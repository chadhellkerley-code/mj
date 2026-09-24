// API sin estado: sirve tanto en Vercel (funciones serverless) como en local.
// Nada se guarda en el servidor. La sesión de Instagram viaja cifrada (AES-256-GCM)
// entre el navegador y cada pedido, y las tareas largas las conduce el navegador
// pidiendo pasos cortos (una página de seguidores, un lote de 25, etc.).
const express = require('express');
const crypto = require('crypto');
const {
  IgApiClient,
  IgCheckpointError,
  IgLoginTwoFactorRequiredError,
  IgLoginBadPasswordError,
  IgLoginInvalidUserError,
  IgLoginRequiredError,
  IgActionSpamError,
  IgRequestsLimitError,
} = require('instagram-private-api');

const ON_VERCEL = !!process.env.VERCEL;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ADD_PER_REQUEST = 25;

// Clave de cifrado de las sesiones. En local, si falta, se genera una por proceso.
const SESSION_KEY = process.env.SESSION_SECRET
  ? crypto.createHash('sha256').update(process.env.SESSION_SECRET).digest()
  : ON_VERCEL ? null : crypto.randomBytes(32);

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- Sesión cifrada ----------
function seal(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SESSION_KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

function unseal(token) {
  try {
    const raw = Buffer.from(String(token), 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', SESSION_KEY, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const payload = JSON.parse(json);
    if (!payload.iat || Date.now() - payload.iat > SESSION_MAX_AGE_MS) throw new Error('expired');
    return payload;
  } catch (_) {
    throw new HttpError(401, 'Tu sesión expiró. Vuelve a iniciar sesión.', 'relogin');
  }
}

async function serializeState(ig) {
  const state = await ig.state.serialize();
  delete state.constants;
  return state;
}

async function clientFrom(payload) {
  const ig = new IgApiClient();
  ig.state.generateDevice(payload.username);
  await ig.state.deserialize(payload.state);
  return ig;
}

async function sessionToken(ig, me) {
  return seal({ v: 1, iat: Date.now(), username: me.username, pk: me.pk, state: await serializeState(ig) });
}

// Abre la sesión del pedido; devuelve el cliente y una función para renovar el token.
async function openSession(req) {
  const payload = unseal((req.body || {}).token);
  if (!payload.pk) throw new HttpError(401, 'Primero inicia sesión.', 'relogin');
  const ig = await clientFrom(payload);
  const me = { pk: payload.pk, username: payload.username };
  return { ig, me, renew: () => sessionToken(ig, me) };
}

function explain(e) {
  if (e instanceof HttpError) return e;
  if (e instanceof IgLoginBadPasswordError) return new HttpError(401, 'Usuario o contraseña incorrectos.');
  if (e instanceof IgLoginInvalidUserError) return new HttpError(401, 'Ese usuario de Instagram no existe.');
  if (e instanceof IgLoginRequiredError)
    return new HttpError(401, 'Instagram cerró la sesión. Vuelve a iniciar sesión.', 'relogin');
  if (e instanceof IgCheckpointError)
    return new HttpError(403, 'Instagram pidió verificar que eres tú. Abre la app de Instagram, aprueba el intento de inicio de sesión ("Fui yo") y vuelve a intentarlo.', 'relogin');
  if (e instanceof IgActionSpamError)
    return new HttpError(429, 'Instagram bloqueó la acción temporalmente por actividad sospechosa. Espera varias horas antes de reintentar.', 'blocked');
  if (e instanceof IgRequestsLimitError)
    return new HttpError(429, 'Instagram limitó las solicitudes (rate limit). Espera un rato antes de reintentar.', 'blocked');
  return new HttpError(502, e && e.message ? e.message : String(e));
}

const slimUser = (u) => ({
  pk: String(u.pk),
  username: u.username,
  fullName: u.full_name || '',
  isPrivate: !!u.is_private,
  isVerified: !!u.is_verified,
  hasPhoto: !u.has_anonymous_profile_picture,
  pic: u.profile_pic_url || '',
});

// ---------- Contraseña del panel ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
function checkAppPassword(req, res, next) {
  if (!APP_PASSWORD) {
    if (ON_VERCEL) return next(new HttpError(500, 'Falta configurar APP_PASSWORD en Vercel.'));
    return next();
  }
  const given = req.get('x-app-password') || '';
  if (crypto.timingSafeEqual(sha(given), sha(APP_PASSWORD))) return next();
  // Pausa para frenar intentos de adivinar la contraseña.
  setTimeout(() => next(new HttpError(401, 'Contraseña del panel incorrecta.', 'app_password')), 1200);
}

// ---------- API ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

app.get('/api/config', (req, res) => {
  res.json({ passwordRequired: !!APP_PASSWORD || ON_VERCEL });
});

app.use('/api', checkAppPassword);
app.use('/api', (req, res, next) =>
  SESSION_KEY ? next() : next(new HttpError(500, 'Falta configurar SESSION_SECRET en Vercel.')));

app.post('/api/unlock', (req, res) => res.json({ ok: true }));

app.post('/api/login', route(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new HttpError(400, 'Escribe usuario y contraseña.');
  const ig = new IgApiClient();
  ig.state.generateDevice(username);
  try {
    const user = await ig.account.login(username, password);
    const me = { pk: String(user.pk), username: user.username };
    res.json({ ok: true, username: me.username, token: await sessionToken(ig, me) });
  } catch (e) {
    if (!(e instanceof IgLoginTwoFactorRequiredError)) throw e;
    const info = e.response.body.two_factor_info;
    const pending2fa = {
      username: info.username || username,
      twoFactorIdentifier: info.two_factor_identifier,
      method: info.totp_two_factor_on ? 'totp' : 'sms',
    };
    const token = seal({ v: 1, iat: Date.now(), username, pending2fa, state: await serializeState(ig) });
    res.json({ needs2fa: true, method: pending2fa.method, token });
  }
}));

app.post('/api/2fa', route(async (req, res) => {
  const payload = unseal((req.body || {}).token);
  if (!payload.pending2fa) throw new HttpError(400, 'No hay un inicio de sesión pendiente.', 'relogin');
  const code = String((req.body || {}).code || '').replace(/\s/g, '');
  if (!code) throw new HttpError(400, 'Escribe el código.');
  const ig = await clientFrom(payload);
  const { pending2fa } = payload;
  const body = await ig.account.twoFactorLogin({
    username: pending2fa.username,
    verificationCode: code,
    twoFactorIdentifier: pending2fa.twoFactorIdentifier,
    verificationMethod: pending2fa.method === 'totp' ? '0' : '1',
    trustThisDevice: '1',
  });
  const user = body.logged_in_user || (await ig.account.currentUser());
  const me = { pk: String(user.pk), username: user.username };
  res.json({ ok: true, username: me.username, token: await sessionToken(ig, me) });
}));

app.post('/api/me', route(async (req, res) => {
  const payload = unseal((req.body || {}).token);
  if (!payload.pk) throw new HttpError(401, 'Primero inicia sesión.', 'relogin');
  res.json({ username: payload.username });
}));

// Una página de seguidores. El navegador repite con el cursor hasta que more = false.
app.post('/api/followers/page', route(async (req, res) => {
  const { ig, me, renew } = await openSession(req);
  const feed = ig.feed.accountFollowers(me.pk);
  const { cursor } = req.body;
  if (cursor) feed.deserialize(cursor);
  const items = await feed.items();
  res.json({
    users: items.map(slimUser),
    more: feed.isMoreAvailable(),
    cursor: feed.serialize(),
    token: await renew(),
  });
}));

// Una página de la lista actual de Mejores amigos.
app.post('/api/besties/page', route(async (req, res) => {
  const { ig, renew } = await openSession(req);
  const feed = ig.feed.bestFriendships();
  const { cursor } = req.body;
  if (cursor) feed.deserialize(cursor);
  const items = await feed.items();
  res.json({
    ids: items.map((u) => String(u.pk)),
    more: feed.isMoreAvailable(),
    cursor: feed.serialize(),
    token: await renew(),
  });
}));

// Agrega un lote pequeño. El navegador espera entre lotes.
app.post('/api/besties/add', route(async (req, res) => {
  const { ig, renew } = await openSession(req);
  const ids = [...new Set(((req.body || {}).ids || []).map(String))].filter((id) => /^\d+$/.test(id));
  if (!ids.length) throw new HttpError(400, 'No hay usuarios para agregar.');
  if (ids.length > MAX_ADD_PER_REQUEST) throw new HttpError(400, `Máximo ${MAX_ADD_PER_REQUEST} por lote.`);
  await ig.friendship.setBesties({ add: ids });
  res.json({ ok: true, added: ids, token: await renew() });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const e = explain(err);
  if (e.status >= 500) console.error(err);
  res.status(e.status || 500).json({ error: e.message, code: e.code || null });
});

module.exports = app;
