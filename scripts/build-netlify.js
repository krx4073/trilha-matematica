import { build } from 'vite';
import { writeFile } from 'node:fs/promises';

const input = process.argv[2] || process.env.VITE_BACKEND_URL;
if (!input) throw Error('Informe a URL do Render: npm run build:netlify -- https://seu-backend.onrender.com');
const url = new URL(input);
if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Use apenas a origem HTTPS do backend, sem caminhos ou credenciais.');
process.env.VITE_BACKEND_URL = url.origin;
await build();
await writeFile('dist/_redirects', `/api/* ${url.origin}/api/:splat 200!\n/* /index.html 200\n`);
await writeFile('dist/_headers', `/api/*\n  Cache-Control: no-store\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ${url.origin} ${url.origin.replace('https:', 'wss:')}; frame-ancestors 'none'\n`);
console.log(`Frontend pronto na pasta dist. Backend: ${url.origin}`);
