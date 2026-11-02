import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';
test('contas e sessões persistem quando o servidor reinicia', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'trilha-test-')); const path = join(folder, 'test.sqlite'); let server;
  try {
    server = createApp({ dbPath: path }); await new Promise(r => server.http.listen(0, '127.0.0.1', r));
    let base = `http://127.0.0.1:${server.http.address().port}`;
    const response = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'persistente', password: 'senha123' }) });
    const cookie = response.headers.get('set-cookie').split(';')[0]; assert.equal(response.status, 200);
    await server.close(); server = createApp({ dbPath: path }); await new Promise(r => server.http.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.http.address().port}`;
    const me = await fetch(base + '/api/me', { headers: { Cookie: cookie } });
    assert.equal(me.status, 200); assert.equal((await me.json()).user.username, 'persistente');
    const blocked = await fetch(base + '/api/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://other.example' } });
    assert.equal(blocked.status, 403);
  } finally { if (server) await server.close(); rmSync(folder, { recursive: true, force: true }); }
});
