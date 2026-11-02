import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './style.css';

const levels = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
const operationNames = { '+': 'Adição', '-': 'Subtração', '×': 'Multiplicação', '÷': 'Divisão' };
const backend = import.meta.env.VITE_BACKEND_URL || undefined;
async function api(path, data) {
  const r = await fetch(`/api/${path}`, { credentials: 'same-origin', ...(data !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result = await r.json(); if (!r.ok) throw Error(result.error || 'Não foi possível conectar.'); return result;
}
function Piece({ player, small = false }) { return <span className={`piece piece-${player.color} ${small ? 'small' : ''}`} title={player.username} aria-label={`Peça de ${player.username}`} />; }
function Brand({ compact = false }) { return <div className={`brand ${compact ? 'compact' : ''}`}><span className="brand-mark" aria-hidden="true">÷</span><span>Trilha <span>Matemática</span></span></div>; }
function App() {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [rooms, setRooms] = useState([]), [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [creating, setCreating] = useState(false);
  const socket = useRef(null);
  useEffect(() => { api('me').then(x => setUser(x.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!user) return;
    const s = io(backend, { autoConnect: false, ...(backend ? { transports: ['websocket'], auth: async callback => {
      try { const result = await api('socket-ticket', {}); callback({ ticket: result.ticket }); }
      catch (e) { setError(e.message); callback({ ticket: 'invalid' }); }
    } } : {}) }); socket.current = s;
    s.on('connect', () => { setConnected(true); setError(''); });
    s.on('disconnect', reason => { setConnected(false); if (reason === 'io server disconnect') { setUser(null); setRoom(null); setError('Sua sessão terminou. Entre novamente.'); } });
    s.on('connect_error', e => {
      setConnected(false);
      if (e.message.includes('sessão')) { setError(e.message); setUser(null); setRoom(null); } else setError('Sem conexão com o servidor. Tentando novamente…');
    });
    s.on('lobby', setRooms); s.on('room', value => { setRoom(value); setCreating(false); }); s.connect();
    return () => { s.disconnect(); socket.current = null; setConnected(false); };
  }, [user?.id]);
  async function command(event, data = {}) {
    if (!socket.current?.connected) { setError('Aguarde a reconexão antes de continuar.'); return false; }
    setBusy(true); setError('');
    try { const result = await socket.current.timeout(6000).emitWithAck(event, data); if (result.error) throw Error(result.error); return true; }
    catch (e) { setError(e.message === 'operation has timed out' ? 'O servidor demorou para responder. Verifique a conexão.' : e.message); return false; }
    finally { setBusy(false); }
  }
  async function logout() { try { await api('logout', {}); setUser(null); setRoom(null); setRooms([]); setError(''); } catch (e) { setError(e.message); } }
  if (loading) return <main className="loading"><Brand /><p>Preparando a trilha…</p></main>;
  if (!user) return <Login onLogin={setUser} externalError={error} />;
  const disabled = busy || !connected;
  return <div className="app-shell">
    <header className="topbar"><Brand compact /><div className="userbar"><span className={`connection ${connected ? 'online' : ''}`}>{connected ? 'Conectado' : 'Reconectando…'}</span><strong>{user.username}</strong>{!room && <button className="text-button" onClick={logout}>Sair da conta</button>}</div></header>
    {!connected && <div className="notice" role="status">Conexão interrompida. Tentando reconectar automaticamente. Sua vaga é mantida por 1 minuto.</div>}
    {error && <div className="error global-error" role="alert">{error}<button className="text-button" aria-label="Fechar mensagem" onClick={() => setError('')}>✕</button></div>}
    <main>
      {!room && !creating && <Lobby user={user} rooms={rooms} disabled={disabled} create={() => setCreating(true)} join={code => command('room:join', { code })} />}
      {!room && creating && <CreateRoom disabled={disabled} cancel={() => setCreating(false)} submit={values => command('room:create', values)} />}
      {room?.status === 'waiting' && <Waiting room={room} user={user} disabled={disabled} start={() => command('game:start')} leave={() => command('room:leave')} />}
      {room?.status === 'playing' && <Match room={room} user={user} disabled={disabled} answer={values => command('game:answer', values)} leave={() => command('room:leave')} />}
      {room?.status === 'finished' && <Result room={room} user={user} disabled={disabled} rematch={() => command('game:rematch')} leave={() => command('room:leave')} />}
    </main><footer>Quatro operações. Uma chegada. Vamos nessa!</footer>
  </div>;
}
function Login({ onLogin, externalError }) {
  const [register, setRegister] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); const data = new FormData(e.currentTarget); setError('');
    if (register && data.get('password') !== data.get('confirmation')) return setError('As senhas precisam ser iguais.');
    setBusy(true); try { const result = await api(`auth/${register ? 'register' : 'login'}`, { username: data.get('username'), password: data.get('password') }); onLogin(result.user); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="login-layout"><section className="intro"><div className="eyebrow">O DESAFIO COMEÇA AQUI</div><h1>Trilha<br /><span>Matemática</span></h1><p>Responda certo, avance duas casas e chegue primeiro à casa 20.</p><div className="operation-art" aria-hidden="true"><span>+</span><span>−</span><span>×</span><span>÷</span></div><div className="intro-note">De 2 a 4 jogadores · Contas e diversão em tempo real</div></section>
    <section className="panel login-card"><div className="tabs"><button className={!register ? 'selected' : ''} onClick={() => { setRegister(false); setError(''); }}>Entrar</button><button className={register ? 'selected' : ''} onClick={() => { setRegister(true); setError(''); }}>Criar conta</button></div>
      <h2>{register ? 'Seu lugar na trilha' : 'Bom ter você por aqui!'}</h2><p className="muted">{register ? 'Só um usuário e uma senha. Sem e-mail.' : 'Entre para encontrar sua turma e jogar.'}</p>
      <form onSubmit={submit}><label>Nome de usuário<input name="username" autoComplete="username" placeholder="Seu nome no jogo" pattern="[a-zA-Z0-9_]{3,20}" minLength={3} maxLength={20} required /></label><small>3 a 20 letras, números ou _.</small><label>Senha<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} placeholder="Pelo menos 6 caracteres" minLength={6} maxLength={128} required /></label>
        {register && <><label>Confirmar senha<input name="confirmation" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label><small>Guarde sua senha: esta versão não tem recuperação de conta.</small></>}
        {(error || externalError) && <div className="error" role="alert">{error || externalError}</div>}<button className="primary full" disabled={busy}>{busy ? 'Aguarde…' : register ? 'Criar conta e jogar →' : 'Entrar no jogo →'}</button></form>
    </section></main>;
}
function Lobby({ user, rooms, disabled, create, join }) {
  function submit(e) { e.preventDefault(); join(new FormData(e.currentTarget).get('code')); }
  return <><div className="page-heading"><div><div className="eyebrow">LOBBY PRINCIPAL</div><h1>Vamos jogar, {user.username}?</h1><p className="muted">Crie sua trilha ou encontre a turma em uma sala.</p></div><button className="primary" disabled={disabled} onClick={create}>＋ Criar sala</button></div>
    <section className="panel join-panel"><div><h2>Já tem um código?</h2><p className="muted">Peça o código para quem criou a sala.</p></div><form className="inline-form" onSubmit={submit}><input aria-label="Código da sala" name="code" placeholder="Ex.: A1B2C3" className="code-input" maxLength={6} minLength={6} required /><button className="secondary" disabled={disabled}>Entrar na sala →</button></form></section>
    <section className="rooms-section"><div className="section-heading"><h2>Salas da turma <span className="count">{rooms.length}</span></h2><span className="muted small-text">Atualização em tempo real</span></div>
      {!rooms.length ? <div className="panel empty"><span className="empty-icon">⚑</span><h2>A primeira sala pode ser a sua!</h2><p className="muted">Crie uma sala e convide seus amigos pelo código.</p><button className="primary" onClick={create} disabled={disabled}>Criar a primeira sala</button></div> : <div className="rooms-grid">{rooms.map(r => <article className="panel room-card" key={r.code}><div className="section-heading"><span className={`badge ${r.status === 'waiting' ? 'green' : ''}`}>{r.status === 'waiting' ? 'Aguardando' : r.status === 'playing' ? 'Em partida' : 'Finalizada'}</span><span className="muted">{r.count}/{r.capacity} jogadores</span></div><h2>{r.name}</h2><p className="muted">Anfitrião: {r.host}</p><div className="tags"><span>{levels[r.difficulty]}</span><span>{r.operations.join('  ')}</span></div><button className="secondary full" disabled={disabled || r.status !== 'waiting' || r.count >= r.capacity} onClick={() => join(r.code)}>{r.status !== 'waiting' ? 'Aguarde a próxima' : r.count >= r.capacity ? 'Sala cheia' : 'Entrar na sala →'}</button></article>)}</div>}
    </section></>;
}
function CreateRoom({ disabled, cancel, submit }) {
  const [ops, setOps] = useState(['+', '-', '×', '÷']);
  function send(e) { e.preventDefault(); const f = new FormData(e.currentTarget); submit({ name: f.get('name'), difficulty: f.get('difficulty'), seconds: Number(f.get('seconds')), capacity: Number(f.get('capacity')), operations: ops }); }
  return <section className="narrow"><button className="text-button back" onClick={cancel}>← Voltar ao lobby</button><div className="page-heading"><div><div className="eyebrow">DO SEU JEITO</div><h1>Criar sala</h1><p className="muted">Prepare o desafio e chame a turma.</p></div></div><form className="panel create-form" onSubmit={send}><label>Nome da sala<input name="name" placeholder="Ex.: Tarde de Tabuada" maxLength={40} required /></label><fieldset><legend>Quais operações entram no jogo?</legend><div className="operation-picker">{Object.entries(operationNames).map(([op, label]) => <button type="button" key={op} aria-pressed={ops.includes(op)} className={ops.includes(op) ? 'selected' : ''} onClick={() => setOps(ops.includes(op) ? ops.filter(x => x !== op) : [...ops, op])}><b>{op}</b><span>{label}</span></button>)}</div>{!ops.length && <p className="field-error">Selecione pelo menos uma operação.</p>}</fieldset><div className="form-grid"><label>Dificuldade<select name="difficulty"><option value="easy">Fácil</option><option value="medium">Médio</option><option value="hard">Difícil</option></select></label><label>Tempo por resposta<select name="seconds" defaultValue="30">{[15, 20, 30, 45, 60].map(s => <option key={s} value={s}>{s} segundos</option>)}</select></label><label>Limite de jogadores<select name="capacity" defaultValue="4">{[2, 3, 4].map(n => <option key={n} value={n}>{n} jogadores</option>)}</select></label></div><p className="muted small-text">Acertou? Avance 2 casas. Errou ou acabou o tempo? A vez passa. A chegada fica na casa 20.</p><button className="primary full" disabled={disabled || !ops.length}>Criar sala →</button></form></section>;
}
function Settings({ room }) { return <div className="tags"><span>{levels[room.difficulty]}</span><span>{room.seconds}s por turno</span><span>{room.operations.join('  ')}</span><span>Até {room.capacity} jogadores</span></div>; }
function Waiting({ room, user, disabled, start, leave }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }
  const host = room.host === user.id;
  return <><div className="page-heading"><div><div className="eyebrow">SALA DE ESPERA</div><h1>{room.name}</h1><p className="muted">Todo mundo pronto para a largada?</p></div><button className="secondary" disabled={disabled} onClick={leave}>Sair da sala</button></div><div className="waiting-grid"><section className="panel"><div className="section-heading"><h2>Na trilha com você</h2><span className="count">{room.players.length}/{room.capacity}</span></div><div className="player-list">{room.players.map(p => <div className="player-row" key={p.id}><Piece player={p} /><div><strong>{p.username}{p.id === user.id ? ' (você)' : ''}</strong><div className="muted small-text">{p.online ? 'Pronto para jogar' : 'Reconectando…'}</div></div>{p.id === room.host && <span className="badge">Anfitrião</span>}</div>)}{Array.from({ length: room.capacity - room.players.length }, (_, i) => <div className="player-row vacant" key={`empty${i}`}><span className="empty-avatar">＋</span><span>Aguardando jogador…</span></div>)}</div></section><aside className="panel invitation"><div className="eyebrow">CONVIDE A TURMA</div><h2>O código da sua sala</h2><div className="room-code">{room.code}</div><button className="secondary full" onClick={copy}>{copied ? '✓ Código copiado' : 'Copiar código'}</button><p className="muted small-text">Seus amigos entram pelo lobby usando este código.</p><hr /><Settings room={room} />{host ? <button className="primary full" disabled={disabled || room.players.length < 2 || room.players.some(p => !p.online)} onClick={start}>Começar partida →</button> : <p className="waiting-message">Aguardando o anfitrião começar…</p>}<small className="muted">São necessários pelo menos 2 jogadores conectados.</small></aside></div></>;
}
function Ranking({ room, user }) { return <aside className="panel ranking"><div className="eyebrow">DE OLHO NA CHEGADA</div><h2>Classificação</h2><div className="player-list">{room.ranking.map(p => <div className={`rank-row ${p.id === user.id ? 'is-me' : ''}`} key={p.id}><span className="rank-number">{p.rank}º</span><Piece player={p} small /><div><strong>{p.username}{p.id === user.id ? ' (você)' : ''}</strong><div className="muted small-text">Casa {p.position} · {p.correct} acertos{p.tied ? ' · empate' : ''}</div>{!p.online && <small className="muted">Reconectando…</small>}</div></div>)}</div><p className="muted small-text">Mesma casa? Mesma posição no ranking.</p></aside>; }
function Board({ room }) {
  const cells = [...Array.from({ length: 10 }, (_, i) => i + 1), ...Array.from({ length: 10 }, (_, i) => 20 - i)];
  return <section className="panel board-panel"><div className="section-heading"><h2>A trilha</h2><span className="muted small-text">Chegue à casa 20</span></div><div className="start-line"><span>INÍCIO →</span><div className="pieces">{room.players.filter(p => p.position === 0).map(p => <Piece key={p.id} player={p} small />)}</div></div><div className="board">{cells.map(n => <div className={`cell ${n === 20 ? 'finish-cell' : ''} ${room.players.some(p => p.position === n) ? 'occupied' : ''}`} key={n}><span>{n === 20 ? '⚑ 20' : n}</span><div className="pieces">{room.players.filter(p => p.position === n).map(p => <Piece key={p.id} player={p} small />)}</div></div>)}</div><div className="board-direction">← Na segunda linha, siga até a chegada</div></section>;
}
function Match({ room, user, disabled, answer, leave }) {
  const [value, setValue] = useState(''), [now, setNow] = useState(Date.now()), [confirm, setConfirm] = useState(false);
  const offset = useRef(0), input = useRef(null);
  useEffect(() => { offset.current = room.serverTime - Date.now(); }, [room.serverTime]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t); }, []);
  useEffect(() => { setValue(''); if (room.turn === user.id) input.current?.focus(); }, [room.question?.id, room.turn]);
  const own = room.turn === user.id, player = room.players.find(p => p.id === room.turn);
  const seconds = room.deadline ? Math.max(0, Math.ceil((room.deadline - now - offset.current) / 1000)) : 0;
  function send(e) { e.preventDefault(); if (value.trim()) answer({ questionId: room.question.id, answer: Number(value) }); }
  return <><div className="page-heading match-heading"><div><div className="eyebrow">PARTIDA EM ANDAMENTO</div><h1>{room.name}</h1></div><div className="turn-badge">{player && <Piece player={player} small />} {room.question ? `Vez de ${player?.username}` : 'Atualizando a trilha…'}</div></div><div className="match-grid"><div className="match-main"><Board room={room} /><section className="panel question-panel">
    {room.feedback ? <div className={`feedback ${room.feedback.correct ? 'correct' : 'incorrect'}`} role="status"><div className="feedback-icon">{room.feedback.correct ? '✓' : room.feedback.timeout ? '◷' : '×'}</div><h2>{room.feedback.correct ? `${room.feedback.player} acertou!` : room.feedback.timeout ? 'O tempo acabou!' : 'Não foi dessa vez!'}</h2><p>{room.feedback.correct ? 'Mais duas casas na trilha.' : 'A peça fica onde está. A próxima chance vem aí!'} Resposta: <strong>{room.feedback.answer}</strong>.</p></div> : <><div className="section-heading"><h2>{own ? 'Sua vez! Mostre o que sabe.' : `Aguardando ${player?.username}…`}</h2><span className={`timer ${seconds <= 5 ? 'urgent' : ''}`}>◷ {seconds}s</span></div><div className="progress" role="progressbar" aria-label="Tempo restante" aria-valuemin={0} aria-valuemax={room.seconds} aria-valuenow={seconds}><div style={{ width: `${seconds / room.seconds * 100}%` }} /></div><div className="equation">{room.question?.text} <span>= ?</span></div>{own ? <form className="answer-form" onSubmit={send}><input ref={input} aria-label="Sua resposta" type="number" step="1" inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} placeholder="Sua resposta" disabled={disabled || seconds === 0} required /><button className="primary" disabled={disabled || !value.trim() || seconds === 0}>Responder →</button></form> : <p className="muted">Prepare-se: sua vez está chegando.</p>}<p className="muted small-text">Acertou: +2 casas · Errou: passa a vez</p></>}
    </section></div><Ranking room={room} user={user} /></div><div className="leave-area">{confirm ? <><span>Sair da partida? Sua peça será removida.</span><button className="secondary" disabled={disabled} onClick={leave}>Sim, sair</button><button className="text-button" onClick={() => setConfirm(false)}>Continuar jogando</button></> : <button className="text-button" onClick={() => setConfirm(true)}>Sair da partida</button>}</div></>;
}
function Result({ room, user, disabled, rematch, leave }) {
  const winner = room.players.find(p => p.id === room.winner);
  return <div className="results"><section className="panel winner-panel"><div className="eyebrow">CHEGAMOS AO FINAL</div><div className="trophy" aria-hidden="true">🏆</div><h1>{winner?.username || 'A turma'} venceu!</h1><p className="muted">{room.reason === 'departure' ? 'Os outros jogadores saíram da partida.' : 'Casa 20 conquistada. Mandou bem nas contas!'}</p><div className="winner-summary">{winner?.correct || 0} acertos <span>·</span> {room.name}</div></section><Ranking room={room} user={user} /><div className="result-actions">{room.host === user.id ? <button className="primary" disabled={disabled} onClick={rematch}>Jogar novamente ↻</button> : <p className="muted">Aguardando o anfitrião preparar outra partida…</p>}<button className="secondary" disabled={disabled} onClick={leave}>Voltar ao lobby</button></div></div>;
}
createRoot(document.getElementById('root')).render(<App />);
