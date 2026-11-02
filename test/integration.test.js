import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApp } from '../server/index.js';
test('contas reais, sessão, duas conexões, sala e partida até a vitória', async t => {
  const server = createApp({ dbPath: ':memory:' }); await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.http.address().port}`; const sockets = [];
  t.after(async () => { sockets.forEach(s => s.disconnect()); await server.close(); });
  async function auth(action, username, password = 'senha123') {
    const r = await fetch(`${base}/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], body: await r.json() };
  }
  const ana = await auth('register', 'ana'); const bia = await auth('register', 'bia');
  assert.equal(ana.status, 200); assert.equal((await auth('register', 'ANA')).status, 409);
  assert.equal((await auth('login', 'ana', 'errada')).status, 401); assert.equal((await auth('login', 'ANA')).status, 200);
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  const saved = server.db.prepare('SELECT hash FROM users WHERE username=?').get('ana'); assert.notEqual(saved.hash, 'senha123');
  const connect = cookie => new Promise((resolve, reject) => { const s = io(base, { extraHeaders: { Cookie: cookie }, reconnection: false }); sockets.push(s); s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
  const sa = await connect(ana.cookie), sb = await connect(bia.cookie);
  const send = (s, event, data = {}) => s.timeout(3000).emitWithAck(event, data);
  assert.equal((await send(sa, 'room:create', { name: 'Teste', capacity: 2, seconds: 15, difficulty: 'easy', operations: ['+'] })).ok, true);
  const room = server.game.roomFor(ana.body.user.id); assert.ok(room);
  assert.equal((await send(sb, 'room:join', { code: room.code })).ok, true);
  assert.match((await send(sb, 'game:start')).error, /anfitrião/);
  assert.equal((await send(sa, 'game:start')).ok, true);
  assert.match((await send(sb, 'game:answer', { questionId: room.question.id, answer: room.question.answer })).error, /sua vez/);
  for (let i = 0; i < 10; i++) {
    const update = new Promise(resolve => { const listener = state => { if (state?.players[0].position === (i + 1) * 2) { sa.off('room', listener); resolve(state); } }; sa.on('room', listener); });
    const questionId = room.question.id;
    assert.equal((await send(sa, 'game:answer', { questionId, answer: room.question.answer })).ok, true);
    const state = await update; assert.equal(state.players[0].position, (i + 1) * 2);
    if (i < 9) {
      clearTimeout(room.timer); room.feedback = null; room.turn = 1; server.game.next(room);
      assert.equal((await send(sb, 'game:answer', { questionId: room.question.id, answer: -1 })).ok, true);
      clearTimeout(room.timer); room.feedback = null; room.turn = 0; server.game.next(room);
    }
  }
  assert.equal(room.status, 'finished'); assert.equal(room.winner, ana.body.user.id);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM results').get().count, 1);
  assert.equal((await send(sa, 'game:rematch')).ok, true);
  assert.equal((await send(sa, 'room:leave')).ok, true); assert.equal(room.host, bia.body.user.id);
  const logout = await fetch(`${base}/api/logout`, { method: 'POST', headers: { Cookie: bia.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(logout.status, 200); assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: bia.cookie } })).status, 401);
});
