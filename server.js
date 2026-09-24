// Servidor local. Corre SOLO en tu computadora (127.0.0.1).
// Las credenciales viajan del navegador a este proceso y nunca a un tercero.
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  IgApiClient,
  IgCheckpointError,
  IgLoginTwoFactorRequiredError,
  IgLoginBadPasswordError,
  IgActionSpamError,
  IgRequestsLimitError,
} = require('instagram-private-api');

const PORT = process.env.PORT || 3000;
const SESSION_FILE = path.join(__dirname, '.session.json');
const MAX_ADD_PER_REQUEST = 500;
const ADD_CHUNK = 25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a));

// ---------- Estado en memoria ----------
let ig = null;
let me = null; // { pk, username }
let pending2fa = null; // { username, twoFactorIdentifier, method }
let followers = [];
let bestieIds = new Set();
let job = { type: null, running: false, done: 0, total: 0, failed: 0, error: null, message: null };

const slimUser = (u) => ({
  pk: String(u.pk),
  username: u.username,
  fullName: u.full_name || '',
  isPrivate: !!u.is_private,
  isVerified: !!u.is_verified,
  hasPhoto: !u.has_anonymous_profile_picture,
  pic: u.profile_pic_url || '',
});

function explain(e) {
  if (e instanceof IgLoginBadPasswordError) return 'Usuario o contraseña incorrectos.';
  if (e instanceof IgCheckpointError)
    return 'Instagram pidió verificar que eres tú. Abre la app de Instagram, aprueba el intento de inicio de sesión ("Fui yo") y vuelve a intentarlo.';
  if (e instanceof IgActionSpamError)
    return 'Instagram bloqueó la acción temporalmente por actividad sospechosa. Espera varias horas antes de reintentar.';
  if (e instanceof IgRequestsLimitError)
    return 'Instagram limitó las solicitudes (rate limit). Espera un rato antes de reintentar.';
  return e && e.message ? e.message : String(e);
}

async function saveSession() {
  try {
    const state = await ig.state.serialize();
    delete state.constants;
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ username: me.username, state }), { mode: 0o600 });
  } catch (_) {}
}

async function loadBesties() {
  const ids = new Set();
  const feed = ig.feed.bestFriendships();
  do {
    const items = await feed.items();
    items.forEach((u) => ids.add(String(u.pk)));
    if (feed.isMoreAvailable()) await sleep(rand(800, 1600));
  } while (feed.isMoreAvailable());
  bestieIds = ids;
  followers.forEach((f) => (f.closeFriend = ids.has(f.pk)));
}

async function tryRestoreSession() {
  if (!fs.existsSync(SESSION_FILE)) return;
  try {
    const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const client = new IgApiClient();
    client.state.generateDevice(saved.username);
    await client.state.deserialize(saved.state);
    const user = await client.account.currentUser();
    ig = client;
    me = { pk: String(user.pk), username: user.username };
    console.log(`Sesión restaurada: @${me.username}`);
  } catch (_) {
    try { fs.unlinkSync(SESSION_FILE); } catch (_) {}
  }
}

// ---------- API ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    loggedIn: !!me,
    username: me ? me.username : null,
    needs2fa: !!pending2fa,
    twoFactorMethod: pending2fa ? pending2fa.method : null,
    followersCount: followers.length,
    bestiesCount: bestieIds.size,
    job,
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Escribe usuario y contraseña.' });
  const client = new IgApiClient();
  client.state.generateDevice(username);
  try {
    await client.account.login(username, password);
    ig = client;
    const user = await ig.account.currentUser();
    me = { pk: String(user.pk), username: user.username };
    pending2fa = null;
    followers = [];
    await saveSession();
    res.json({ ok: true, username: me.username });
  } catch (e) {
    if (e instanceof IgLoginTwoFactorRequiredError) {
      const info = e.response.body.two_factor_info;
      ig = client;
      pending2fa = {
        username: info.username || username,
        twoFactorIdentifier: info.two_factor_identifier,
        method: info.totp_two_factor_on ? 'totp' : 'sms',
      };
      return res.json({ needs2fa: true, method: pending2fa.method });
    }
    res.status(401).json({ error: explain(e) });
  }
});

app.post('/api/2fa', async (req, res) => {
  if (!pending2fa) return res.status(400).json({ error: 'No hay un inicio de sesión pendiente.' });
  const code = String((req.body || {}).code || '').replace(/\s/g, '');
  if (!code) return res.status(400).json({ error: 'Escribe el código.' });
  try {
    await ig.account.twoFactorLogin({
      username: pending2fa.username,
      verificationCode: code,
      twoFactorIdentifier: pending2fa.twoFactorIdentifier,
      verificationMethod: pending2fa.method === 'totp' ? '0' : '1',
      trustThisDevice: '1',
    });
    const user = await ig.account.currentUser();
    me = { pk: String(user.pk), username: user.username };
    pending2fa = null;
    followers = [];
    await saveSession();
    res.json({ ok: true, username: me.username });
  } catch (e) {
    res.status(401).json({ error: explain(e) });
  }
});

app.post('/api/logout', (req, res) => {
  ig = null; me = null; pending2fa = null; followers = []; bestieIds = new Set();
  job = { type: null, running: false, done: 0, total: 0, failed: 0, error: null, message: null };
  try { fs.unlinkSync(SESSION_FILE); } catch (_) {}
  res.json({ ok: true });
});

const requireLogin = (req, res, next) =>
  me ? next() : res.status(401).json({ error: 'Primero inicia sesión.' });

app.post('/api/followers/fetch', requireLogin, (req, res) => {
  if (job.running) return res.status(409).json({ error: 'Ya hay una tarea en curso.' });
  job = { type: 'followers', running: true, done: 0, total: 0, failed: 0, error: null, message: 'Descargando seguidores…' };
  res.json({ ok: true });
  (async () => {
    try {
      const collected = [];
      const feed = ig.feed.accountFollowers(me.pk);
      do {
        const items = await feed.items();
        items.forEach((u) => collected.push(slimUser(u)));
        job.done = collected.length;
        if (feed.isMoreAvailable()) await sleep(rand(1500, 3500)); // ritmo humano
      } while (feed.isMoreAvailable());
      followers = collected;
      job.message = 'Leyendo tu lista de Mejores amigos…';
      await loadBesties();
      job.message = `Listo: ${followers.length} seguidores.`;
    } catch (e) {
      job.error = explain(e);
    } finally {
      job.running = false;
    }
  })();
});

app.get('/api/followers', requireLogin, (req, res) => {
  res.json({ followers: followers.map((f) => ({ ...f, closeFriend: bestieIds.has(f.pk) })) });
});

app.post('/api/besties/add', requireLogin, (req, res) => {
  if (job.running) return res.status(409).json({ error: 'Ya hay una tarea en curso.' });
  const ids = [...new Set(((req.body || {}).ids || []).map(String))].filter((id) => !bestieIds.has(id));
  if (!ids.length) return res.status(400).json({ error: 'No hay usuarios nuevos para agregar.' });
  if (ids.length > MAX_ADD_PER_REQUEST)
    return res.status(400).json({ error: `Máximo ${MAX_ADD_PER_REQUEST} por tanda. Divide la selección en varias tandas.` });

  job = { type: 'besties', running: true, done: 0, total: ids.length, failed: 0, error: null, message: 'Agregando a Mejores amigos…' };
  res.json({ ok: true, total: ids.length });

  (async () => {
    try {
      for (let i = 0; i < ids.length; i += ADD_CHUNK) {
        const chunk = ids.slice(i, i + ADD_CHUNK);
        try {
          await ig.friendship.setBesties({ add: chunk });
          chunk.forEach((id) => bestieIds.add(id));
          job.done += chunk.length;
        } catch (e) {
          job.failed += chunk.length;
          if (e instanceof IgActionSpamError || e instanceof IgRequestsLimitError) throw e;
        }
        if (i + ADD_CHUNK < ids.length) await sleep(rand(4000, 8000));
      }
      job.message = `Listo: ${job.done} agregados${job.failed ? `, ${job.failed} fallaron` : ''}.`;
    } catch (e) {
      job.error = explain(e);
    } finally {
      job.running = false;
    }
  })();
});

(async () => {
  await tryRestoreSession();
  app.listen(PORT, '127.0.0.1', () =>
    console.log(`\n  Abre http://localhost:${PORT} en tu navegador\n`)
  );
})();
