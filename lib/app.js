// API sin estado: sirve tanto en Vercel (funciones serverless) como en local.
// Nada se guarda en el servidor. La sesión de Instagram viaja cifrada (AES-256-GCM)
// entre el navegador y cada pedido, y las tareas largas las conduce el navegador
// pidiendo pasos cortos (buscar un usuario, agregar un lote pequeño, etc.).
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
const IgConstants = require('instagram-private-api/dist/core/constants');

const ON_VERCEL = !!process.env.VERCEL;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ADD_PER_REQUEST = 25;

// La librería trae una versión de la app de 2022 que Instagram ya rechaza
// ("Your version of Instagram is out of date"). Nos presentamos como una versión actual.
const APP_PROFILE = {
  APP_VERSION: '448.0.0.0.20',
  APP_VERSION_CODE: '1065560286',
  BLOKS_VERSION_ID: '0bc46a03e177bfc9bc8d611918815acf248fa9c77754d807d6a5951dc9ce9432',
};
const DEVICE_STRING = '34/14; 480dpi; 1344x2992; Google/google; Pixel 8 Pro; husky; husky';

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

function newClient(seed) {
  const ig = new IgApiClient();
  ig.state.generateDevice(seed);
  ig.state.deviceString = DEVICE_STRING;
  applyAppProfile(ig);
  return ig;
}

function applyAppProfile(ig) {
  ig.state.constants = { ...IgConstants, ...APP_PROFILE };
  // Las versiones actuales firman con "SIGNATURE." en lugar de un HMAC.
  ig.request.sign = (payload) => ({
    signed_body: `SIGNATURE.${typeof payload === 'object' ? JSON.stringify(payload) : payload}`,
  });
}

async function clientFrom(payload) {
  const ig = newClient(payload.username);
  await ig.state.deserialize(payload.state);
  applyAppProfile(ig);
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
  const ig = newClient(username);
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

// Alternativa al inicio de sesión: usar la cookie sessionid de instagram.com.
// Evita el login desde el servidor (y sus verificaciones), que Instagram suele frenar.
app.post('/api/login-session', route(async (req, res) => {
  let sessionid = String((req.body || {}).sessionid || '').trim().replace(/^sessionid=/, '').replace(/;.*$/, '');
  if (!sessionid) throw new HttpError(400, 'Pega el valor de la cookie sessionid.');
  if (!sessionid.includes('%')) sessionid = encodeURIComponent(decodeURIComponent(sessionid));
  const dsUserId = decodeURIComponent(sessionid).split(':')[0];
  if (!/^\d+$/.test(dsUserId)) throw new HttpError(400, 'Ese sessionid no tiene el formato esperado.');
  const ig = newClient(dsUserId);
  ig.state.authorization = 'Bearer IGT:2:' + Buffer.from(JSON.stringify({
    ds_user_id: dsUserId,
    sessionid: decodeURIComponent(sessionid),
    should_use_header_over_cookies: true,
  })).toString('base64');
  let user;
  try {
    user = await ig.user.info(dsUserId);
  } catch (e) {
    if (e instanceof IgLoginRequiredError || (e.response && e.response.statusCode === 403))
      throw new HttpError(401, 'Instagram no aceptó ese sessionid. Copia uno nuevo desde instagram.com.');
    throw e;
  }
  const me = { pk: String(user.pk), username: user.username };
  res.json({ ok: true, username: me.username, token: await sessionToken(ig, me) });
}));

app.post('/api/me', route(async (req, res) => {
  const payload = unseal((req.body || {}).token);
  if (!payload.pk) throw new HttpError(401, 'Primero inicia sesión.', 'relogin');
  res.json({ username: payload.username });
}));

// Busca un usuario por nombre y devuelve su id. El navegador llama de a uno, con pausas.
app.post('/api/resolve', route(async (req, res) => {
  const { ig, renew } = await openSession(req);
  const username = String((req.body || {}).username || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(username)) throw new HttpError(400, 'Nombre de usuario inválido.', 'not_found');
  let user;
  try {
    user = await ig.user.usernameinfo(username);
  } catch (e) {
    if (e.response && e.response.statusCode === 404) throw new HttpError(404, 'No existe ese usuario.', 'not_found');
    throw e;
  }
  if (!user || !user.pk) throw new HttpError(404, 'No existe ese usuario.', 'not_found');
  res.json({ pk: String(user.pk), username: user.username, token: await renew() });
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
