# Publicar: frontend no Netlify e backend no Render

Use este pacote atualizado. Não envie `node_modules`, `data`, senhas ou arquivos `.env` para o GitHub.

## 1. Código no GitHub

Crie um repositório chamado `trilha-matematica`. Envie o conteúdo desta pasta, preservando as subpastas `server`, `src`, `scripts`, `public` e `test`. O `package.json` e o `package-lock.json` precisam ficar na raiz do repositório, e não dentro de outra pasta `trilha-matematica`.

Pelo navegador: abra o repositório, use **Add file → Upload files**, arraste os arquivos e pastas e confirme em **Commit changes**.

## 2. Backend no Render

Abra **New → Web Service**, conecte o repositório e configure:

| Campo | Valor |
| --- | --- |
| Name | `trilha-matematica-api` (ou outro nome disponível) |
| Language / Runtime | `Node` |
| Branch | `main` (ou a branch que contém o código) |
| Root Directory | vazio, se `package.json` está na raiz |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Instance Type | `Free`, para este teste |
| Health Check Path | `/api/health` |

Adicione as variáveis de ambiente:

```text
NODE_VERSION=24.16.0
HOST=0.0.0.0
COOKIE_SECURE=true
```

Crie o serviço e aguarde aparecer **Live**. Copie a URL HTTPS fornecida pelo Render. Abra `https://SEU-BACKEND.onrender.com/api/health` e confirme que aparece `{"ok":true}`. O endereço real pode conter um sufixo; use exatamente o que o painel mostrar.

O arquivo `render.yaml` também descreve essa configuração para importação como Blueprint; nesse caminho, `APP_ORIGIN` deve ser preenchida com a URL final do Netlify.

## 3. Frontend no Netlify — publicação manual

No terminal da pasta do projeto, rode (trocando o exemplo pela URL real do Render):

```powershell
npm install
npm run build:netlify -- https://SEU-BACKEND.onrender.com
```

O comando gera a pasta `dist`, incluindo os arquivos `_redirects` e `_headers`. Não remova esses arquivos: o login depende do proxy `/api`.

No Netlify, escolha a opção para adicionar/publicar um projeto manualmente (**Deploy manually / Netlify Drop**). Arraste a pasta **`dist`** para a área de upload. Não arraste o ZIP ou a pasta inteira do código-fonte. Aguarde a publicação e copie a URL HTTPS `.netlify.app` que o painel fornecer.

Para atualizar depois, gere novamente `dist` com o mesmo comando e envie-a na área de deploys do mesmo projeto, sem criar outro site.

### Alternativa: publicação automática pelo GitHub

No Netlify, importe o mesmo repositório. Configure `VITE_BACKEND_URL` com a origem HTTPS real do Render. O `netlify.toml` já define o comando `npm run build:netlify` e a pasta de publicação `dist`. Uma mudança de URL do backend exige novo build/deploy do frontend.

## 4. Autorizar o endereço do frontend

Volte ao serviço do Render → **Environment** e adicione:

```text
APP_ORIGIN=https://SEU-SITE.netlify.app
```

Use a URL real do Netlify, sem `/` no final e sem caminho. Salve e aguarde o redeploy ficar **Live**. Essa autorização vale apenas para essa origem exata. Se mudar o nome do site ou usar domínio próprio, atualize a variável.

## 5. Testar

Abra o site do Netlify, crie uma conta e entre no lobby. Em uma janela anônima, crie outra conta. Crie uma sala na primeira, entre pelo código na segunda e inicie a partida. Verifique uma resposta, o avanço da peça e o ranking nas duas janelas.

Se o Render estiver iniciando após um período sem uso, abra a URL `/api/health` do backend, espere responder e então recarregue o frontend.

## Limites do plano gratuito

O Render Free pode suspender o servidor após 15 minutos sem tráfego. O filesystem é temporário: contas, sessões e resultados em SQLite são perdidos ao reiniciar, republicar ou suspender o serviço. Salas e partidas também são temporárias. Crie as contas definitivas depois do último deploy e teste antes do evento. Para persistência real é necessário mudar o armazenamento ou contratar um serviço com disco persistente; este pacote não configura um banco externo.

## Como a conexão funciona

O Netlify hospeda os arquivos estáticos e encaminha `/api/*` para o Render. A sessão usa cookie HttpOnly de primeira parte, sem armazenar a senha no navegador. A partida abre um WebSocket direto com o Render, autenticado por ticket de uso único de 30 segundos obtido pela API. Não é necessário habilitar cookies de terceiros.

Documentação oficial: [Render Node](https://render.com/docs/deploy-node-express-app), [Render Free](https://render.com/docs/free), [Netlify proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).
