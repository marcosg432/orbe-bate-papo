# Orbe

Conversas privadas por link. A primeira etapa é um MVP de texto em tempo real: ninguém cria conta, informa telefone, e-mail ou senha. Quem tem o link entra, escolhe um nome de exibição e conversa.

O nome **Orbe** é a identidade visual deste projeto. O link da sala é a credencial de acesso.

## Arquitetura

Monorepositório com dois pacotes:

- `client`: React, Vite, TypeScript, Tailwind CSS, React Router e Socket.IO Client. Em desenvolvimento, o Vite publica `http://localhost:5173` e encaminha `/api` e `/socket.io` para o backend, para que o cookie de sessão seja da mesma origem.
- `server`: Express, Socket.IO, Zod e SQLite (`better-sqlite3`). Sobe em `http://localhost:3001`.

O servidor é a fonte da verdade de salas, participantes, mensagens e horários. O banco fica em `server/data/chat.sqlite` e é criado automaticamente.

O acesso funciona assim:

1. `POST /api/rooms` cria uma sala com identificador de 256 bits (32 bytes em base64url).
2. A pessoa abre `/room/<id>`, escolhe um nome e recebe um cookie `HttpOnly` (`orbe_device`), também de 256 bits.
3. O servidor guarda só o hash SHA-256 desse token. A sessão fica presa à sala e expira em 7 dias, com renovação quando passa da metade do prazo.
4. O mesmo navegador pode entrar em mais de uma sala. O cookie identifica o dispositivo; cada sala tem seu próprio participante.
5. Mensagens, histórico e presença exigem essa sessão. O Socket.IO recebe a sala no `auth` do handshake e só aceita se o cookie tiver sessão nela.

Não há listagem pública de salas. IDs sequenciais não são credenciais. Mensagens são texto: a interface não interpreta HTML.

## O que esta etapa faz

- Criar sala e compartilhar o link.
- Entrar com nome de exibição.
- Enviar e receber texto em tempo real, com confirmação, deduplicação e histórico paginado.
- Ver quem está online.
- Reconectar sozinho e tratar sessão expirada, erro e link inválido.
- Limitar criação de salas, entradas e envio de mensagens.
- Layout para celular e computador.

Ficam para depois: voz, vídeo, arquivos, áudio e notificações push.

## Segurança que esta versão não promete

Não há criptografia de ponta a ponta. O servidor armazena as mensagens para manter o histórico. Em produção, o site e o WebSocket precisam de **HTTPS e WSS**. Sem isso, o link e as mensagens trafegam sem sigilo no caminho.

O nome de exibição não prova identidade. Duas pessoas podem escolher o mesmo nome; a interface distingue as suas próprias mensagens pelo identificador da sessão, não pelo texto do nome.

Não coloque o token em parâmetros de consulta. O segredo da sala vai no caminho do link (`/room/...`), porque é assim que ele é compartilhado. Não registre o link completo nem o cookie em logs.

Se a API ficar atrás de um proxy reverso, defina `TRUST_PROXY=true` somente nesse proxy confiável. Para cookies entre origens diferentes, use `COOKIE_SAMESITE=none` junto com `COOKIE_SECURE=true`. O desenho recomendado é servir o site e a API na mesma origem HTTPS.

## Requisitos

- Node.js 22 ou superior (testado com Node 24)
- npm
- Windows, macOS ou Linux. Os comandos abaixo funcionam no PowerShell.

Nenhum serviço pago é necessário.

## Executar em desenvolvimento

No PowerShell, a partir desta pasta:

```powershell
npm install
npm run dev
```

Abra `http://localhost:5173`. O backend sobe na porta 3001. Não é preciso criar um `.env` para o uso local: os padrões estão no código. Para alterá-los, copie `server/.env.example` para `server/.env`.

## Scripts

| Comando | Efeito |
| --- | --- |
| `npm run dev` | Frontend e backend juntos |
| `npm run typecheck` | Verificação de tipos dos dois pacotes |
| `npm test` | Testes do servidor |
| `npm run build` | Compila o servidor para `server/dist` e o cliente para `client/dist` |
| `npm start` | Sobe apenas a API já compilada |
| `npm run pm2:start` | Sobe a versão de produção na porta 3041 |
| `npm run pm2:reload` | Recarrega o processo depois de um novo build |
| `npm run pm2:logs` | Mostra os logs do PM2 |

## Variáveis

Servidor (`server/.env`):

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3001` | Porta HTTP |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Única origem aceita no CORS |
| `DATABASE_PATH` | `data/chat.sqlite` | Arquivo SQLite, relativo à pasta `server` |
| `SESSION_TTL_HOURS` | `168` | Duração da sessão anônima |
| `COOKIE_SECURE` | `false` | Use `true` em produção HTTPS |
| `COOKIE_SAMESITE` | `lax` | `none` exige `COOKIE_SECURE=true` |
| `TRUST_PROXY` | `false` | `true` só atrás de proxy confiável |
| `RATE_LIMIT_ENABLED` | `true` | Limites de criação, entrada e mensagens |

Cliente: deixe `VITE_API_URL` e `VITE_SOCKET_URL` vazios quando o site e a API compartilham a origem. Preencha apenas se o build precisar apontar para outra origem HTTPS.

## Limites

- Nome: 2 a 40 caracteres.
- Mensagem: 1 a 2000 caracteres.
- Criação de sala: 20 a cada 15 minutos por IP.
- Entrada: 40 a cada 15 minutos por IP.
- Envio: 30 mensagens por minuto por participante.

## VPS Hostinger com PM2

O processo de produção escuta em `0.0.0.0:3041` e entrega o site, a API e o Socket.IO no mesmo endereço. Quem abre `http://IP-DA-VPS:3041` recebe um link que outra pessoa também consegue abrir. Uma instância só: presença e SQLite não devem ser divididos entre vários processos.

Na VPS, com Node.js 22 ou superior:

```bash
npm install -g pm2
cd /caminho/do/projeto
npm install
npm run build
npm run pm2:start
pm2 save
pm2 startup
```

Abra a porta 3041 no firewall da Hostinger. O endereço para enviar é `http://IP-DA-VPS:3041`. Crie a conversa por esse endereço, não por `localhost`, e compartilhe o link da sala que aparecer no botão.

Depois de atualizar o código:

```bash
npm run build
npm run pm2:reload
```

Quando houver um domínio com HTTPS na frente dessa porta, ajuste o ambiente do PM2: `COOKIE_SECURE=true` e `CLIENT_ORIGIN=https://seu-dominio`. Sem HTTPS, deixe `COOKIE_SECURE=false`, como está em `ecosystem.config.cjs`. O servidor ainda lê as mensagens; HTTPS protege o caminho, mas esta etapa não tem criptografia de ponta a ponta.
