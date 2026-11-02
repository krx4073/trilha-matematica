# Trilha Matemática

Jogo multiplayer funcional baseado no HTML de referência fornecido. Frontend React, servidor Node.js/Express, comunicação Socket.IO e banco SQLite local. Sem serviços pagos ou banco externo.

Para hospedar o frontend no Netlify e o backend no Render, siga **[PUBLICAR.md](PUBLICAR.md)**. Essa configuração usa `npm run build:netlify -- URL-DO-RENDER`; os comandos abaixo são para execução local no mesmo servidor.

## Como executar no Windows

Instale o Node.js 24 ou superior. Abra um terminal nesta pasta e execute:

```powershell
npm install
npm run build
npm start
```

Abra **http://localhost:3000**. Para testar duas pessoas no mesmo computador, use uma janela normal e outra anônima (ou navegadores diferentes). Cada uma deve criar uma conta própria. Abas do mesmo perfil compartilham a conta.

O arquivo `iniciar.cmd` também instala as dependências se necessário, compila e inicia o servidor. Mantenha o terminal aberto durante o uso. Pressione Ctrl+C para encerrar.

## Jogar com outros dispositivos na mesma rede

No PowerShell, antes de iniciar:

```powershell
$env:HOST = "0.0.0.0"
npm start
```

Encontre o IPv4 do computador com `ipconfig`. Os colegas acessam `http://IP-DO-COMPUTADOR:3000` pelo navegador na mesma rede. Se necessário, permita o Node na rede privada no Firewall do Windows. A rede precisa permitir comunicação entre os dispositivos. A interface funciona em celular; se copiar código estiver indisponível em HTTP na rede, o código pode ser selecionado e copiado manualmente.

## Usar pela internet

Este projeto está pronto para executar, mas não foi publicado. Hospede um único processo Node com HTTPS e suporte a WebSocket, faça `npm ci && npm run build` e inicie com `npm start`. Configure:

- `HOST=0.0.0.0`
- `PORT`: porta fornecida pela hospedagem (padrão: 3000).
- `APP_ORIGIN=https://seu-dominio`: origem pública exata, sem barra no final.
- `COOKIE_SECURE=true`: para cookies enviados apenas por HTTPS.
- `DB_PATH`: caminho de um arquivo SQLite em volume persistente, se quiser manter as contas.

Não use várias réplicas: salas e partidas ficam na memória de um único servidor. Hospedagens que desligam o processo por inatividade podem interromper o jogo. HTTP local é adequado para teste; use HTTPS na internet para proteger usuário e senha em trânsito.

## O que está incluído

- Criar conta e entrar com usuário e senha, sem e-mail. Usuário de 3 a 20 letras ASCII, números ou `_`; senha de 6 a 128 caracteres. Nomes são únicos sem diferenciar maiúsculas.
- Lobby com salas atualizadas ao vivo, entrada por código, configuração das quatro operações, três dificuldades, 15/20/30/45/60 segundos e 2 a 4 jogadores.
- Sala de espera com código copiável, identificação do anfitrião e transferência automática do papel quando ele sai.
- Partida por turnos: acerto avança duas casas; erro ou prazo encerrado passa a vez. Todas as divisões são exatas e as subtrações não geram resultados negativos.
- Tabuleiro de 20 casas, peças com formas distintas, ranking ao vivo com empates, resultado e revanche.
- Reconexão com vaga preservada por 60 segundos. O cronômetro continua no servidor durante a desconexão. Após o prazo, o jogador é removido. Se só restar um durante a partida, ele vence por abandono.
- Senhas com scrypt e salt individual; sessões com cookie HttpOnly/SameSite e duração de 12 horas; validação no servidor; limitação de requisições e prevenção de respostas duplicadas ou fora do turno.
- Contas, sessões e resultados gravados em SQLite. As respostas corretas ficam no servidor e só são reveladas após a rodada.

## Dados e limites desta versão

O arquivo `data/game.sqlite` é criado automaticamente. Preserve a pasta `data` para manter as contas. Salas e partidas são temporárias e desaparecem ao reiniciar o processo; as contas e resultados continuam no banco.

Não há e-mail, recuperação de senha, ranking global, chat, bots ou painel administrativo. O ranking mostrado é o da partida atual. Cada usuário participa de uma sala por vez. A partida exige pelo menos duas pessoas reais. O frontend de produção e a fonte funcionam sem depender de CDN.

## Desenvolvimento e verificação

```powershell
npm test
npm run build
```

Para editar com atualização automática, mantenha o backend com `npm start` e rode `npm run dev` em outro terminal. Use a URL do Vite. Para desenvolvimento com essa segunda origem, configure `APP_ORIGIN=http://localhost:5173` no backend e abra o Vite exatamente nesse endereço.

Os testes verificam operações, permissões, ranking, vitória, revanche, tempo esgotado, abandono, reconexão e integração HTTP/Socket.IO com duas contas reais de teste em banco isolado.

## Organização

- `src/main.jsx` e `src/style.css`: telas e interface responsiva.
- `server/index.js`: HTTP, autenticação, banco e comunicação em tempo real.
- `server/game.js`: regras e ciclo de vida das salas.
- `test/`: testes automatizados.
- `public/fonts/`: fonte Nunito extraída da referência com licença preservada.

## Contrato de comunicação

HTTP: `POST /api/auth/register`, `POST /api/auth/login` com `{ username, password }`; `GET /api/me`; `POST /api/logout`; `GET /api/health`.

Socket autenticado pelo cookie: `room:create` com `{ name, capacity, seconds, difficulty, operations }`; `room:join` com `{ code }`; `room:leave`; `game:start`; `game:answer` com `{ questionId, answer }`; `game:rematch`. Todos usam confirmação `{ ok: true }` ou `{ error }`.

O servidor publica `lobby` (lista de salas) e `room` (estado da sua sala ou `null`). O estado contém `players`, `ranking`, `turn`, `question` sem resposta, `deadline`, `serverTime`, `feedback` e `winner`. O servidor decide correção, turno, tempo e posição; o cliente apenas envia intenções e exibe o estado.
