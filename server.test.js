import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer, hashPassword, loadConfig } from '../server.js';

const password = 'test-password-for-http-only';
const auth = { username: 'equipo', ...hashPassword(password) };

test('credential generator stores a private hash outside the checkout and never overwrites it', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'traffic-credential-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'auth.json');
  const script = fileURLToPath(new URL('../scripts/create-access.js', import.meta.url));
  const run = target => spawnSync(process.execPath, [script, '--username', 'equipo', '--output', target], { input: password, encoding: 'utf8' });
  const created = run(output);
  assert.equal(created.status, 0, created.stderr);
  assert.doesNotMatch(created.stdout + created.stderr, new RegExp(password));
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.password, undefined);
  assert.equal(saved.passwordHash, hashPassword(password, saved.salt).passwordHash);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.equal(loadConfig({ APP_AUTH_FILE: output }).auth.username, 'equipo');
  const previous = await readFile(output, 'utf8');
  assert.equal(run(output).status, 1);
  assert.equal(await readFile(output, 'utf8'), previous);
  const forbidden = run(fileURLToPath(new URL('../auth-test-never-created.json', import.meta.url)));
  assert.equal(forbidden.status, 1);
  assert.match(forbidden.stderr, /fuera del repositorio/);
});

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'traffic-server-'));
  const publicDir = path.join(directory, 'public');
  await mkdir(publicDir);
  await writeFile(path.join(publicDir, 'index.html'), '<h1>Private laboratory</h1>');
  await writeFile(path.join(publicDir, 'app.js'), 'window.privateLaboratory = true;');
  await writeFile(path.join(directory, 'auth.json'), 'PRIVATE AUTHENTICATION DATA');
  await writeFile(path.join(publicDir, 'source.env'), 'PRIVATE SOURCE DATA');
  await symlink(path.join(directory, 'auth.json'), path.join(publicDir, 'escape.json'));
  const server = createServer({ auth, publicDir, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const origin = options.origin || base;
  const host = new URL(origin).host;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  // Use raw HTTP: fetch deliberately rewrites Host and cannot test the proxy contract.
  const request = (url, init = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method: init.method || 'GET', headers: { host, ...init.headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(Object.entries(res.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])), text: async () => Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(init.body?.toString());
  });
  const login = (secret = password, extraHeaders = {}) => request('/login', {
    method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', ...extraHeaders },
    body: new URLSearchParams({ username: auth.username, password: secret }),
  });
  return { request, login, base, origin, host, server };
}

test('requires configured authentication and HTTPS origin for a non-loopback bind', () => {
  assert.throws(() => loadConfig({}), /APP_AUTH_FILE/);
  assert.throws(() => loadConfig({ APP_USERNAME: 'equipo', APP_PASSWORD: 'short' }), /16/);
  assert.throws(() => createServer({ auth, host: '0.0.0.0' }), /HTTPS/);
  assert.throws(() => createServer({ auth, origin: 'http://private.example' }), /HTTPS/);
  assert.throws(() => createServer({ auth, origin: 'https://private.example/' }), /HTTPS/);
  assert.doesNotThrow(() => createServer({ auth, host: '0.0.0.0', origin: 'https://private.example' }));
});

test('protects the home page and every application asset, exposes a minimal health check', async t => {
  const { request } = await fixture(t);
  const home = await request('/');
  assert.equal(home.status, 303);
  assert.equal(home.headers.get('location'), '/login');
  const asset = await request('/app.js');
  assert.equal(asset.status, 401);
  assert.doesNotMatch(await asset.text(), /privateLaboratory/);
  const health = await request('/healthz');
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok\n');
  const login = await request('/login');
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Acceso privado/);
  assert.match(login.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  assert.equal(login.headers.get('referrer-policy'), 'same-origin');
  assert.equal(login.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal((await request('/login.css')).status, 200);
});

test('rejects incorrect credentials, creates a session, and invalidates it on logout', async t => {
  const { request, login, origin } = await fixture(t);
  const wrong = await login('incorrect-password');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  const accepted = await login();
  assert.equal(accepted.status, 303);
  const setCookie = accepted.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\//);
  assert.doesNotMatch(setCookie, /Domain=/);
  const cookie = setCookie.split(';')[0];
  const home = await request('/', { headers: { cookie } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Private laboratory/);
  assert.equal((await request('/app.js', { headers: { cookie } })).status, 200);
  const loggedOut = await request('/logout', { method: 'POST', headers: { cookie, origin } });
  assert.equal(loggedOut.status, 303);
  assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await request('/app.js', { headers: { cookie } })).status, 401);
});

test('rejects missing/cross-site origins and ignores spoofed proxy headers', async t => {
  const { request, login, origin } = await fixture(t);
  const missing = await request('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=equipo&password=x' });
  assert.equal(missing.status, 403);
  assert.equal((await login(password, { origin: 'https://attacker.example' })).status, 403);
  assert.equal((await login(password, { origin: 'null' })).status, 403);
  const accepted = await login(password, { 'x-forwarded-for': '203.0.113.1', 'x-forwarded-proto': 'https' });
  const cookie = accepted.headers.get('set-cookie').split(';')[0];
  assert.doesNotMatch(accepted.headers.get('set-cookie'), /Secure/);
  assert.equal((await request('/logout', { method: 'POST', headers: { cookie, origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await request('/app.js', { headers: { cookie } })).status, 200);
  assert.equal((await request('/logout', { method: 'POST', headers: { cookie, origin } })).status, 303);
  assert.equal((await request('/login', { headers: { host: 'attacker.example' } })).status, 421);
});

test('uses Secure host-only cookies behind the configured HTTPS origin', async t => {
  const { request, login } = await fixture(t, { origin: 'https://traffic.internal.example' });
  const response = await login();
  assert.equal(response.status, 303);
  assert.match(response.headers.get('set-cookie'), /^__Host-traffic_session=/);
  assert.match(response.headers.get('set-cookie'), /; Secure/);
  assert.match(response.headers.get('strict-transport-security'), /max-age=/);
  assert.equal((await request('/login', { headers: { host: '127.0.0.1' } })).status, 421);
});

test('expires sessions and rejects arbitrary cookies', async t => {
  let timestamp = 10000;
  const { request, login } = await fixture(t, { clock: () => timestamp, sessionTtlMs: 1000 });
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/app.js', { headers: { cookie } })).status, 200);
  timestamp += 1001;
  assert.equal((await request('/app.js', { headers: { cookie } })).status, 401);
  assert.equal((await request('/app.js', { headers: { cookie: 'traffic_session=forged' } })).status, 401);
});

test('rate limits repeated incorrect logins, including spoofed forwarded addresses', async t => {
  let timestamp = 10000;
  const { login } = await fixture(t, { clock: () => timestamp, loginAttemptLimit: 2, loginWindowMs: 1000 });
  assert.equal((await login('wrong-1')).status, 401);
  assert.equal((await login('wrong-2', { 'x-forwarded-for': '1.2.3.4' })).status, 401);
  const limited = await login(password, { 'x-forwarded-for': '5.6.7.8' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  timestamp += 1001;
  assert.equal((await login()).status, 303);
});

test('blocks encoded traversal, symlinks outside public, and unsupported file types', async t => {
  const { request, login, server, host } = await fixture(t);
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  for (const url of ['/server.js', '/auth.json', '/escape.json', '/source.env', '/missing.js']) {
    const response = await request(url, { headers: { cookie } });
    assert.equal(response.status, 404, url);
    assert.doesNotMatch(await response.text(), /PRIVATE/);
  }
  for (const rawPath of ['/%2e%2e/auth.json', '/..%2fauth.json', '/%252e%252e/auth.json', '/%5c..%5cauth.json', '/%00index.html', '/%invalid']) {
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: rawPath, headers: { host, cookie } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 400, rawPath);
  }
});

test('rejects oversized login bodies and unsupported methods', async t => {
  const { request, login, origin } = await fixture(t);
  const oversized = await request('/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=' + 'x'.repeat(9000) });
  assert.equal(oversized.status, 413);
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/app.js', { method: 'PUT', headers: { cookie } })).status, 405);
  const head = await request('/app.js', { method: 'HEAD', headers: { cookie } });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
