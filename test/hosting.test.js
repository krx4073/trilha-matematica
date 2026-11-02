import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApp } from '../server/index.js';

test('Netlify + Render: ticket sem cookies de terceiros, origem, uso único e revogação', async t => {
  const origin = 'https://trilha.example';
  const server = createApp({ dbPath: ':memory:', origin, secure: true });
  await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.http.address().port}`;
  const sockets = []; t.after(async () => { sockets.forEach(s => s.disconnect()); await server.close(); });
  async function post(path, body, cookie, from = origin) {
    return fetch(`${base}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: from, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  }
  assert.equal((await post('socket-ticket', {})).status, 401);
  const registered = await post('auth/register', { username: 'hosting', password: 'senha123' });
  assert.equal(registered.status, 200);
  const header = registered.headers.get('set-cookie');
  assert.match(header, /HttpOnly/); assert.match(header, /Secure/); assert.match(header, /SameSite=Strict/);
  const cookie = header.split(';')[0];
  assert.equal((await post('socket-ticket', {}, cookie, 'https://outro.example')).status, 403);
  const response = await post('socket-ticket', {}, cookie); assert.equal(response.headers.get('cache-control'), 'no-store');
  const { ticket } = await response.json();
  const connect = (value, from = origin) => new Promise(resolve => {
    const s = io(base, { transports: ['websocket'], auth: { ticket: value }, extraHeaders: { Origin: from }, reconnection: false, timeout: 2000 }); sockets.push(s);
    s.on('connect', () => resolve({ s })); s.on('connect_error', error => resolve({ error }));
  });
  assert.ok((await connect(ticket, 'https://outro.example')).error);
  const { s, error } = await connect(ticket); assert.equal(error, undefined);
  assert.equal((await s.timeout(2000).emitWithAck('room:create', { name: 'Online', operations: ['+'], difficulty: 'easy', seconds: 15, capacity: 2 })).ok, true);
  assert.ok((await connect(ticket)).error, 'Um ticket não pode ser reutilizado.');
  const extra = await (await post('socket-ticket', {}, cookie)).json();
  const disconnected = new Promise(resolve => s.once('disconnect', resolve));
  assert.equal((await post('logout', {}, cookie)).status, 200); await disconnected;
  assert.ok((await connect(extra.ticket)).error, 'Logout invalida também tickets ainda não usados.');
});
