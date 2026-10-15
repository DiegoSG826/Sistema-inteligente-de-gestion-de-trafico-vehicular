import http from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const MIME = new Map(Object.entries({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf' }));
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'";
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password, salt = randomBytes(32).toString('hex')) {
  return { salt, passwordHash: scryptSync(password, salt, 64, SCRYPT).toString('hex') };
}

function validateAuth(auth) {
  if (!auth || typeof auth.username !== 'string' || !/^[\p{L}\p{N}_.@-]{1,80}$/u.test(auth.username) || !/^[a-f0-9]{64}$/.test(auth.salt ?? '') || !/^[a-f0-9]{128}$/.test(auth.passwordHash ?? '')) {
    throw new Error('Configura autenticación válida mediante APP_AUTH_FILE o APP_USERNAME y APP_PASSWORD.');
  }
  return { username: auth.username, salt: auth.salt, passwordHash: auth.passwordHash };
}

export function loadConfig(env = process.env) {
  let auth;
  if (env.APP_AUTH_FILE) {
    try { auth = JSON.parse(readFileSync(env.APP_AUTH_FILE, 'utf8')); }
    catch { throw new Error('No se pudo leer APP_AUTH_FILE; comprueba su ubicación, permisos y formato JSON.'); }
  } else {
    if (typeof env.APP_PASSWORD !== 'string' || env.APP_PASSWORD.length < 16 || env.APP_PASSWORD.length > 1024) {
      throw new Error('Se requiere APP_AUTH_FILE o APP_USERNAME y APP_PASSWORD de entre 16 y 1024 caracteres.');
    }
    auth = { username: env.APP_USERNAME, ...hashPassword(env.APP_PASSWORD) };
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe estar entre 1 y 65535.');
  return { auth: validateAuth(auth), host: env.HOST || '127.0.0.1', port, origin: env.APP_ORIGIN || undefined, publicDir: path.join(ROOT, 'public') };
}

const LOGIN_CSS = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#243029;background:#f5f5f1;color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 15% 0%,#e8ede5 0,transparent 55%),#f5f5f1}.card{width:min(100%,430px);padding:36px;border:1px solid #dcded4;border-radius:18px;background:#fff;box-shadow:0 25px 70px #2430290b}.logo{display:flex;align-items:center;gap:12px;font-size:21px;font-weight:800;letter-spacing:3px}.signal{display:flex;gap:5px;padding:8px;background:#243029;border-radius:7px}.signal i{width:8px;height:8px;border-radius:50%;background:#69aa8b}.signal i:first-child{background:#e7773b}.signal i:nth-child(2){background:#f5c36a}h1{font-size:29px;letter-spacing:-1px;margin:32px 0 12px}p{color:#626e64;font-size:14px;line-height:1.65}label{display:block;font-size:13px;font-weight:650;margin-top:22px}input{width:100%;padding:13px 14px;margin-top:8px;border:1px solid #cbd3c9;border-radius:9px;background:#fafbf8;color:#243029;font:inherit}input:focus-visible{outline:2px solid #427968;outline-offset:2px}button{width:100%;margin-top:26px;padding:14px;border:0;border-radius:9px;background:#e7773b;color:#17241d;font:inherit;font-weight:750;cursor:pointer}button:hover{background:#ee925f}button:focus-visible{outline:2px solid #427968;outline-offset:3px}.error{color:#8c302b;padding:10px 12px;border-radius:8px;background:#fff0ed}footer{margin-top:25px;padding-top:18px;border-top:1px solid #e4e8de;color:#667367;font-size:12px;line-height:1.7}`;

function loginPage(error = false) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Acceso privado · NODO CDMX</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/login.css"></head><body><main class="card"><div class="logo"><span class="signal" aria-hidden="true"><i></i><i></i><i></i></span>NODO</div><h1>Tu ciudad, en movimiento.</h1><p>Acceso privado al laboratorio de gestión inteligente del tráfico vehicular en CDMX.</p>${error ? '<p class="error" role="alert">No se pudo iniciar sesión. Revisa tus datos o inténtalo más tarde.</p>' : ''}<form method="post" action="/login"><label for="username">Usuario</label><input id="username" name="username" autocomplete="username" required maxlength="80"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024"><button type="submit">Entrar al laboratorio →</button></form><footer>Entorno privado · CDMX<br>Simulación académica. Sin conexión a semáforos reales.</footer></main></body></html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 8192) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.resume(); }
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Request aborted')));
  });
}

export function createServer(config) {
  const auth = validateAuth(config.auth);
  const host = config.host || '127.0.0.1';
  let origin;
  if (config.origin) {
    try {
      const url = new URL(config.origin);
      if (url.protocol !== 'https:' || url.origin !== config.origin || url.username || url.password) throw new Error();
      origin = url.origin;
    } catch { throw new Error('APP_ORIGIN debe ser un origen HTTPS exacto, sin ruta ni barra final.'); }
  }
  if (!LOOPBACK.has(host) && !origin) throw new Error('Un enlace externo requiere APP_ORIGIN HTTPS y un proxy TLS privado.');
  const publicDir = path.resolve(config.publicDir || path.join(ROOT, 'public'));
  const now = config.clock || Date.now;
  const ttl = config.sessionTtlMs || 8 * 60 * 60 * 1000;
  const attemptWindow = config.loginWindowMs || 15 * 60 * 1000;
  const attemptLimit = config.loginAttemptLimit || 10;
  const sessions = new Map();
  const attempts = new Map();
  let globalAttempts = { count: 0, until: 0 };
  const cookieName = origin ? '__Host-traffic_session' : 'traffic_session';
  const expectedUser = createHash('sha256').update(auth.username).digest();
  const expectedHash = Buffer.from(auth.passwordHash, 'hex');
  const cookie = (value, maxAge) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin ? '; Secure' : ''}`;
  const server = http.createServer(async (req, res) => {
    const timestamp = now();
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    // Preserve same-origin form POST Origin in Chromium; omit referrers off-site.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (origin) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.statusCode = status;
      res.setHeader('Content-Type', type);
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const redirect = location => { res.setHeader('Location', location); send(303, ''); };
    try {
      const address = server.address();
      const localHost = host === '::1' ? '[::1]' : host;
      const expectedOrigin = origin || `http://${localHost}:${address.port}`;
      if (req.headers.host !== new URL(expectedOrigin).host) { send(421, 'Origen no autorizado.'); return; }
      let pathname;
      try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
      catch { send(400, 'Ruta inválida.'); return; }
      if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.includes('%') || pathname.split('/').some(part => part === '.' || part === '..')) {
        send(400, 'Ruta inválida.'); return;
      }
      if (pathname === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) { send(200, 'ok\n'); return; }
      if (pathname === '/login.css' && (req.method === 'GET' || req.method === 'HEAD')) { send(200, LOGIN_CSS, 'text/css; charset=utf-8'); return; }
      if (pathname === '/login' && (req.method === 'GET' || req.method === 'HEAD')) { send(200, loginPage(), 'text/html; charset=utf-8'); return; }
      if ((pathname === '/login' || pathname === '/logout') && req.method === 'POST') {
        if (req.headers.origin !== expectedOrigin) { send(403, 'Origen no autorizado.'); return; }
        if (pathname === '/logout') {
          const id = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
          if (id) sessions.delete(createHash('sha256').update(id).digest('hex'));
          res.setHeader('Set-Cookie', cookie('', 0)); redirect('/login'); return;
        }
        if (!(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) { send(415, 'Formato no admitido.'); return; }
        for (const [key, value] of attempts) if (value.until <= timestamp) attempts.delete(key);
        const client = req.socket.remoteAddress;
        let bucket = attempts.get(client);
        if (!bucket) bucket = { count: 0, until: timestamp + attemptWindow };
        if (globalAttempts.until <= timestamp) globalAttempts = { count: 0, until: timestamp + attemptWindow };
        if (bucket.count >= attemptLimit || globalAttempts.count >= 200 || attempts.size >= 10000 && !attempts.has(client)) {
          res.setHeader('Retry-After', String(Math.max(1, Math.ceil((Math.max(bucket.until, globalAttempts.until) - timestamp) / 1000))));
          send(429, loginPage(true), 'text/html; charset=utf-8'); return;
        }
        bucket.count++; globalAttempts.count++; attempts.set(client, bucket);
        const body = new URLSearchParams(await readBody(req));
        const username = body.get('username') || '';
        const password = body.get('password') || '';
        if (username.length > 80 || password.length > 1024 || body.getAll('username').length !== 1 || body.getAll('password').length !== 1) { send(401, loginPage(true), 'text/html; charset=utf-8'); return; }
        const userHash = createHash('sha256').update(username).digest();
        const passwordHash = scryptSync(password, auth.salt, 64, SCRYPT);
        const validPassword = timingSafeEqual(passwordHash, expectedHash);
        const validUser = timingSafeEqual(userHash, expectedUser);
        if (!validUser || !validPassword) { send(401, loginPage(true), 'text/html; charset=utf-8'); return; }
        for (const [key, expires] of sessions) if (expires <= timestamp) sessions.delete(key);
        if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
        const id = randomBytes(32).toString('base64url');
        sessions.set(createHash('sha256').update(id).digest('hex'), timestamp + ttl);
        attempts.delete(client);
        res.setHeader('Set-Cookie', cookie(id, Math.floor(ttl / 1000))); redirect('/'); return;
      }
      const id = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const sessionKey = id && /^[A-Za-z0-9_-]{43}$/.test(id) ? createHash('sha256').update(id).digest('hex') : undefined;
      const expires = sessionKey && sessions.get(sessionKey);
      if (!expires || expires <= timestamp) {
        if (sessionKey) sessions.delete(sessionKey);
        if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/' || (req.headers.accept || '').includes('text/html'))) redirect('/login');
        else send(401, 'Se requiere autenticación.');
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); send(405, 'Método no admitido.'); return; }
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const mime = MIME.get(path.extname(relative).toLowerCase());
      if (!mime) { send(404, 'No encontrado.'); return; }
      let rootReal, fileReal, fileStat;
      try {
        rootReal = await realpath(publicDir);
        fileReal = await realpath(path.join(publicDir, relative));
        if (!fileReal.startsWith(rootReal + path.sep)) { send(404, 'No encontrado.'); return; }
        fileStat = await stat(fileReal);
        if (!fileStat.isFile()) { send(404, 'No encontrado.'); return; }
      } catch { send(404, 'No encontrado.'); return; }
      send(200, req.method === 'HEAD' ? '' : await readFile(fileReal), mime);
    } catch (error) {
      if (!res.headersSent) send(error.status || 500, error.status === 413 ? 'Solicitud demasiado grande.' : 'No se pudo completar la solicitud.');
      else res.end();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 40;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = loadConfig();
    const server = createServer(config);
    server.on('error', () => { console.error('No se pudo iniciar el servidor; revisa la dirección y el puerto.'); process.exitCode = 1; });
    server.listen(config.port, config.host, () => console.log(`Servidor privado listo en ${config.origin || `http://${config.host === '::1' ? '[::1]' : config.host}:${config.port}`}`));
    const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
