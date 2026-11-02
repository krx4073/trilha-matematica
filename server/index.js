import express from 'express';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Game } from './game.js';
const scrypt = promisify(scryptCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const cookies = header => Object.fromEntries(String(header || '').split(';').map(x => x.trim().split('=')).filter(x => x.length === 2));

export function createApp({ dbPath = process.env.DB_PATH || resolve(root, 'data/game.sqlite'), secure = process.env.COOKIE_SECURE === 'true', origin = process.env.APP_ORIGIN } = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, key TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY, created INTEGER NOT NULL, room TEXT NOT NULL, winner INTEGER, reason TEXT, players TEXT NOT NULL);`);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  const app = express(); app.disable('x-powered-by');
  const http = createServer(app);
  const allowed = req => !req.headers.origin || req.headers.origin === (origin || `${secure ? 'https' : 'http'}://${req.headers.host}`);
  const io = new Server(http, { maxHttpBufferSize: 8192, cors: { origin: origin || false }, allowRequest: (req, cb) => cb(null, allowed(req)) });
  const tickets = new Map();
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && !allowed(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  const session = req => {
    const token = cookies(req.headers.cookie).trilha;
    const hash = req.trilhaSessionHash || (token && /^[a-f0-9]{64}$/.test(token) ? digest(token) : null);
    if (!hash) return null;
    return db.prepare('SELECT u.id, u.username, s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(hash, Date.now());
  };
  const requireUser = (req, res, next) => { req.user = session(req); if (!req.user) return res.status(401).json({ error: 'Entre na sua conta para continuar.' }); next(); };
  const clients = new Map();
  const game = new Game({
    emit(type, data) {
      if (type === 'lobby') io.emit('lobby', game.lobby());
      if (type === 'room') for (const p of data.players) io.to(`user:${p.id}`).emit('room', game.view(data));
      if (type === 'left') io.to(`user:${data.id}`).emit('room', null);
    },
    finish(r) { db.prepare('INSERT INTO results(created,room,winner,reason,players) VALUES(?,?,?,?,?)').run(Date.now(), r.name, r.winner, r.reason, JSON.stringify(r.players)); }
  });
  const attempts = new Map();
  const cleanup = setInterval(() => {
    for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
    for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key);
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }, 60000); cleanup.unref();
  function authLimit(req, res, next) {
    const key = req.ip; const old = attempts.get(key); const entry = old && old.until > Date.now() ? old : { count: 0, until: Date.now() + 60000 };
    attempts.set(key, entry); if (++entry.count > 120) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' }); next();
  }
  function setSession(res, user) {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(digest(token), user.id, Date.now() + 43200000);
    res.cookie('trilha', token, { httpOnly: true, sameSite: 'strict', secure, maxAge: 43200000, path: '/' });
    res.json({ user: { id: user.id, username: user.username } });
  }
  app.post('/api/auth/:action', authLimit, async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (!['login', 'register'].includes(req.params.action)) return next();
      if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(username) || typeof password !== 'string' || password.length < 6 || password.length > 128) return res.status(400).json({ error: 'Use um usuário de 3 a 20 letras, números ou _ e senha de 6 a 128 caracteres.' });
      const key = username.toLowerCase();
      if (req.params.action === 'register') {
        const salt = randomBytes(16).toString('hex'); const hash = (await scrypt(password, salt, 64)).toString('hex');
        try { const result = db.prepare('INSERT INTO users(username,key,salt,hash) VALUES(?,?,?,?)').run(username, key, salt, hash); setSession(res, { id: Number(result.lastInsertRowid), username }); }
        catch (e) { if (e.code?.includes('SQLITE') && e.message.includes('UNIQUE')) res.status(409).json({ error: 'Esse nome de usuário já está em uso.' }); else throw e; }
      } else {
        const user = db.prepare('SELECT * FROM users WHERE key=?').get(key);
        const hash = await scrypt(password, user?.salt || 'nonexistent-user-padding', 64);
        if (!user || !timingSafeEqual(hash, Buffer.from(user.hash, 'hex'))) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        setSession(res, user);
      }
    } catch (e) { next(e); }
  });
  app.get('/api/me', requireUser, (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ user: { id: req.user.id, username: req.user.username } }); });
  // HTTP passes through Netlify with a first-party HttpOnly cookie. The direct
  // Render socket uses a one-use, 30-second ticket instead of third-party cookies.
  app.post('/api/socket-ticket', requireUser, (req, res) => {
    const hash = digest(cookies(req.headers.cookie).trilha);
    for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key);
    const own = [...tickets.entries()].filter(([, value]) => value.hash === hash);
    if (own.length >= 10) tickets.delete(own[0][0]);
    const ticket = randomBytes(32).toString('hex');
    tickets.set(digest(ticket), { hash, expires: Date.now() + 30000 });
    res.json({ ticket });
  });
  app.post('/api/logout', requireUser, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token=?').run(digest(cookies(req.headers.cookie).trilha));
    const remaining = db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=? AND expires>?').get(req.user.id, Date.now());
    for (const socket of io.sockets.sockets.values()) if (socket.data.sessionHash === digest(cookies(req.headers.cookie).trilha)) socket.disconnect(true);
    if (!remaining.count) game.leave(req.user.id);
    res.clearCookie('trilha', { path: '/', httpOnly: true, sameSite: 'strict', secure }); res.json({ ok: true });
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  io.use((socket, next) => {
    if (socket.handshake.auth?.ticket) {
      const value = socket.handshake.auth.ticket;
      if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return next(Error('Sua sessão expirou. Entre novamente.'));
      const key = digest(value), ticket = tickets.get(key); tickets.delete(key);
      if (!ticket || ticket.expires <= Date.now()) return next(Error('Sua sessão expirou. Entre novamente.'));
      socket.request.trilhaSessionHash = ticket.hash;
    }
    const user = session(socket.request); if (!user) return next(Error('Sua sessão expirou. Entre novamente.'));
    socket.data.user = user; socket.data.sessionHash = socket.request.trilhaSessionHash || digest(cookies(socket.request.headers.cookie).trilha); next();
  });
  io.on('connection', socket => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`); clients.set(user.id, (clients.get(user.id) || 0) + 1); game.presence(user.id, true);
    socket.emit('lobby', game.lobby()); const r = game.roomFor(user.id); socket.emit('room', r ? game.view(r) : null);
    let calls = 0, reset = Date.now();
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(1, user.expires - Date.now()));
    function on(name, action) {
      socket.on(name, (input, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          if (!session(socket.request)) { reply({ error: 'Sua sessão expirou.' }); socket.disconnect(true); return; }
          if (Date.now() - reset > 10000) { calls = 0; reset = Date.now(); }
          if (++calls > 40) throw Error('Aguarde antes de tentar novamente.');
          action(input); reply({ ok: true });
        } catch (e) { reply({ error: e.message }); }
      });
    }
    on('room:create', input => game.create(user, input)); on('room:join', input => game.join(user, input?.code));
    on('room:leave', () => game.leave(user.id)); on('game:start', () => game.start(user.id));
    on('game:answer', input => game.answer(user.id, input)); on('game:rematch', () => game.rematch(user.id));
    socket.on('disconnect', () => { clearTimeout(expiry); const count = (clients.get(user.id) || 1) - 1; if (!count) { clients.delete(user.id); game.presence(user.id, false); } else clients.set(user.id, count); });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(express.static(resolve(root, 'dist')));
  app.get('/', (_req, res) => existsSync(resolve(root, 'dist/index.html')) ? res.sendFile(resolve(root, 'dist/index.html')) : res.json({ ok: true, service: 'Trilha Matemática API' }));
  app.use((err, _req, res, _next) => { console.error(err.message); res.status(err.status === 400 ? 400 : 500).json({ error: err.status === 400 ? 'Dados inválidos.' : 'Não foi possível concluir. Tente novamente.' }); });
  return { app, http, io, game, db, async close() { clearInterval(cleanup); await new Promise(resolve => io.close(resolve)); game.close(); db.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp(); const port = Number(process.env.PORT || 3000);
  server.http.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Trilha Matemática: http://localhost:${port}`));
}
