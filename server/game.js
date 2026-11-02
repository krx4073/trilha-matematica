import { randomInt, randomUUID } from 'node:crypto';

export const OPERATIONS = ['+', '-', '×', '÷'];
export function question(operations, difficulty) {
  const op = operations[randomInt(operations.length)];
  const max = { easy: 10, medium: 20, hard: 50 }[difficulty];
  let a = randomInt(1, max + 1), b = randomInt(1, max + 1);
  if (op === '-' && a < b) [a, b] = [b, a];
  if (op === '÷') a *= b;
  const answer = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : a / b;
  return { id: randomUUID(), text: `${a} ${op} ${b}`, answer };
}

export class Game {
  constructor({ emit = () => {}, finish = () => {}, now = Date.now, disconnectMs = 60000 } = {}) {
    this.rooms = new Map(); this.emit = emit; this.finish = finish; this.now = now; this.disconnectMs = disconnectMs;
    this.departures = new Map();
  }
  roomFor(id) { return [...this.rooms.values()].find(r => r.players.some(p => p.id === id)); }
  lobby() { return [...this.rooms.values()].map(r => ({ code: r.code, name: r.name, host: r.players.find(p => p.id === r.host)?.username, count: r.players.length, capacity: r.capacity, status: r.status, difficulty: r.difficulty, operations: r.operations })); }
  view(r) {
    const sorted = [...r.players].sort((a, b) => b.position - a.position);
    return { code: r.code, name: r.name, host: r.host, capacity: r.capacity, operations: r.operations, difficulty: r.difficulty, seconds: r.seconds, status: r.status,
      players: r.players.map(p => ({ ...p })), ranking: sorted.map((p, i) => ({ ...p, rank: sorted.findIndex(x => x.position === p.position) + 1, tied: sorted.filter(x => x.position === p.position).length > 1 })),
      turn: r.status === 'playing' ? r.players[r.turn]?.id : null, question: r.question ? { id: r.question.id, text: r.question.text } : null,
      deadline: r.deadline, feedback: r.feedback, winner: r.winner, reason: r.reason, serverTime: this.now() };
  }
  publish(r) { this.emit('room', r); this.emit('lobby'); }
  create(user, input) {
    if (this.roomFor(user.id)) throw Error('Você já está em uma sala.');
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 40) throw Error('Use um nome de sala de 1 a 40 caracteres.');
    if (!Array.isArray(input.operations) || !input.operations.length || input.operations.some(x => !OPERATIONS.includes(x))) throw Error('Escolha ao menos uma operação válida.');
    if (!['easy', 'medium', 'hard'].includes(input.difficulty) || ![15, 20, 30, 45, 60].includes(input.seconds) || ![2, 3, 4].includes(input.capacity)) throw Error('Configurações inválidas.');
    if (this.rooms.size >= 200) throw Error('Limite de salas atingido.');
    let code; do { code = randomInt(0x100000, 0xffffff).toString(16).toUpperCase(); } while (this.rooms.has(code));
    const r = { code, name: input.name.trim(), operations: [...new Set(input.operations)], difficulty: input.difficulty, seconds: input.seconds, capacity: input.capacity, host: user.id, players: [], status: 'waiting', turn: 0, question: null, deadline: null, feedback: null, winner: null };
    this.rooms.set(code, r); this.add(r, user); return r;
  }
  add(r, user) {
    const used = r.players.map(p => p.color); const color = [0, 1, 2, 3].find(c => !used.includes(c));
    r.players.push({ id: user.id, username: user.username, position: 0, correct: 0, color, online: true }); this.publish(r);
  }
  join(user, code) {
    if (this.roomFor(user.id)) throw Error('Você já está em uma sala.');
    const r = this.rooms.get(String(code).toUpperCase().trim());
    if (!r) throw Error('Sala não encontrada.');
    if (r.status !== 'waiting') throw Error('Esta partida já começou.');
    if (r.players.length >= r.capacity) throw Error('Esta sala está cheia.');
    this.add(r, user); return r;
  }
  require(id) { const r = this.roomFor(id); if (!r) throw Error('Você não está em uma sala.'); return r; }
  start(id) {
    const r = this.require(id);
    if (r.host !== id || r.status !== 'waiting') throw Error('Somente o anfitrião pode começar.');
    if (r.players.length < 2 || r.players.some(p => !p.online)) throw Error('Aguarde ao menos dois jogadores conectados.');
    r.players.forEach(p => { p.position = 0; p.correct = 0; });
    r.status = 'playing'; r.turn = 0; r.winner = null; r.reason = null; r.feedback = null; this.next(r);
  }
  next(r) {
    clearTimeout(r.timer); r.question = question(r.operations, r.difficulty); r.deadline = this.now() + r.seconds * 1000;
    const qid = r.question.id;
    r.timer = setTimeout(() => { if (r.status === 'playing' && r.question?.id === qid) this.resolve(r, null); }, r.seconds * 1000 + 5);
    this.publish(r);
  }
  answer(id, input) {
    const r = this.require(id);
    if (r.status !== 'playing' || r.players[r.turn]?.id !== id || !r.question || r.feedback?.pending) throw Error('Aguarde a sua vez.');
    if (!input || input.questionId !== r.question.id) throw Error('Esta pergunta já terminou.');
    if (typeof input.answer !== 'number' || !Number.isFinite(input.answer) || !Number.isInteger(input.answer)) throw Error('Digite uma resposta inteira.');
    if (this.now() >= r.deadline) { this.resolve(r, null); throw Error('O tempo desta pergunta acabou.'); }
    this.resolve(r, input.answer);
  }
  resolve(r, answer) {
    clearTimeout(r.timer);
    const p = r.players[r.turn]; const correct = answer !== null && answer === r.question.answer;
    if (correct) { p.position = Math.min(20, p.position + 2); p.correct++; }
    r.feedback = { player: p.username, correct, timeout: answer === null, answer: r.question.answer, pending: true };
    r.question = null; r.deadline = null;
    if (p.position >= 20) { this.end(r, p.id, 'finish'); return; }
    this.publish(r);
    r.timer = setTimeout(() => { if (r.status !== 'playing') return; r.feedback = null; r.turn = (r.turn + 1) % r.players.length; this.next(r); }, 1800);
  }
  end(r, winner, reason) {
    clearTimeout(r.timer); r.status = 'finished'; r.winner = winner; r.reason = reason; r.question = null; r.deadline = null;
    if (r.feedback) r.feedback.pending = false;
    this.finish(r); this.publish(r);
  }
  rematch(id) {
    const r = this.require(id); if (r.host !== id || r.status !== 'finished') throw Error('Somente o anfitrião pode preparar outra partida.');
    r.status = 'waiting'; r.winner = null; r.feedback = null; r.reason = null; r.players.forEach(p => { p.position = 0; p.correct = 0; }); this.publish(r);
  }
  leave(id) {
    clearTimeout(this.departures.get(id)); this.departures.delete(id);
    const r = this.roomFor(id); if (!r) return;
    const currentId = r.players[r.turn]?.id;
    r.players = r.players.filter(p => p.id !== id);
    this.emit('left', { id });
    if (!r.players.length) { clearTimeout(r.timer); this.rooms.delete(r.code); this.emit('lobby'); return; }
    if (r.host === id) r.host = (r.players.find(p => p.online) || r.players[0]).id;
    if (r.status === 'playing') {
      if (r.players.length < 2) { this.end(r, r.players[0].id, 'departure'); return; }
      if (currentId === id) { r.feedback = null; r.turn %= r.players.length; this.next(r); return; }
      r.turn = r.players.findIndex(p => p.id === currentId);
    }
    this.publish(r);
  }
  presence(id, online) {
    clearTimeout(this.departures.get(id)); this.departures.delete(id);
    const r = this.roomFor(id); if (!r) return;
    r.players.find(p => p.id === id).online = online;
    if (!online) this.departures.set(id, setTimeout(() => this.leave(id), this.disconnectMs));
    this.publish(r);
  }
  close() { for (const r of this.rooms.values()) clearTimeout(r.timer); for (const t of this.departures.values()) clearTimeout(t); }
}
