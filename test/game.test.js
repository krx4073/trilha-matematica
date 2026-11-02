import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, question } from '../server/game.js';
const a = { id: 1, username: 'ana' }, b = { id: 2, username: 'bia' }, c = { id: 3, username: 'caio' };
const config = { name: 'Turma', capacity: 2, seconds: 15, difficulty: 'easy', operations: ['÷'] };
test('divisões exatas e subtrações sem negativos em todos os níveis', () => {
  for (const level of ['easy', 'medium', 'hard']) for (let i = 0; i < 200; i++) {
    const q = question(['÷', '-'], level); assert.ok(Number.isInteger(q.answer)); assert.ok(q.answer >= 0);
  }
});
test('sala, permissões, resposta autoritativa, ranking, vitória e revanche', t => {
  const g = new Game(); t.after(() => g.close()); const r = g.create(a, config);
  assert.throws(() => g.start(1), /dois/); g.join(b, r.code); assert.throws(() => g.join(c, r.code), /cheia/);
  assert.throws(() => g.start(2), /anfitrião/); g.start(1);
  assert.throws(() => g.answer(2, { questionId: r.question.id, answer: 0 }), /sua vez/);
  assert.equal('answer' in g.view(r).question, false);
  const qid = r.question.id; g.answer(1, { questionId: qid, answer: r.question.answer });
  assert.equal(r.players[0].position, 2); assert.equal(g.view(r).ranking[0].id, 1);
  assert.throws(() => g.answer(1, { questionId: qid, answer: 0 }));
  clearTimeout(r.timer); r.feedback = null; r.players[0].position = 18; g.next(r);
  g.answer(1, { questionId: r.question.id, answer: r.question.answer });
  assert.equal(r.status, 'finished'); assert.equal(r.winner, 1); assert.equal(r.players[0].position, 20);
  assert.throws(() => g.rematch(2), /anfitrião/); g.rematch(1); assert.equal(r.status, 'waiting'); assert.equal(r.players[0].position, 0);
});
test('empate, tempo expirado, saída do anfitrião e abandono', t => {
  let now = 1000; const g = new Game({ now: () => now }); t.after(() => g.close());
  const r = g.create(a, { ...config, capacity: 3 }); g.join(b, r.code); g.join(c, r.code); g.start(1);
  assert.deepEqual(g.view(r).ranking.map(x => x.rank), [1, 1, 1]);
  now = r.deadline + 1; assert.throws(() => g.answer(1, { questionId: r.question.id, answer: r.question.answer }), /tempo/);
  assert.equal(r.players[0].position, 0); assert.equal(r.feedback.timeout, true);
  g.leave(1); assert.equal(r.host, 2); assert.equal(r.status, 'playing'); assert.equal(r.question !== null, true);
  g.leave(2); assert.equal(r.status, 'finished'); assert.equal(r.winner, 3); assert.equal(r.reason, 'departure');
  g.leave(3); assert.equal(g.rooms.size, 0);
});
test('desconexão temporária preserva vaga, reconexão cancela remoção', async t => {
  const g = new Game({ disconnectMs: 30 }); t.after(() => g.close()); const r = g.create(a, config); g.join(b, r.code);
  g.presence(2, false); assert.equal(r.players[1].online, false); g.presence(2, true);
  await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(r.players.length, 2);
  g.presence(2, false); await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(r.players.length, 1);
});
test('a próxima rodada começa automaticamente após o feedback', async t => {
  const g = new Game(); t.after(() => g.close()); const r = g.create(a, config); g.join(b, r.code); g.start(1);
  const oldId = r.question.id; g.answer(1, { questionId: oldId, answer: -1 });
  assert.equal(r.question, null);
  await new Promise(resolve => setTimeout(resolve, 1900));
  assert.equal(r.turn, 1); assert.notEqual(r.question.id, oldId); assert.equal(r.feedback, null);
});
