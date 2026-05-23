# SIT

Scaffold básico de gestão comercial em React com Tailwind e Firebase (Auth + Firestore).

Principais features:
- Login (Firebase Authentication)
- Controle de usuários (Firestore)
- Perfis: Administrador, Executivo, Gerente, Vendedor
- Cadastro de vendas, status, filtro por vendedor, busca por CPF
- Dashboard, Relatórios, Controle de metas
- Responsivo e dark mode via Tailwind

Instalação:

```bash
cd crm-app
npm install
```

Configurar Firebase:
- Crie um projeto no Firebase Console
- Cole as chaves em `src/firebase/config.js`
- Habilite Authentication (Email/Password)
- Crie coleções `users` e `sales` no Firestore

Backend de gestão de usuários e sincronização:
- Crie uma conta de serviço JSON no Firebase Console
- Copie `serviceAccountKey.json.example` para `serviceAccountKey.json` e preencha os valores reais
- Ou copie `.env.example` para `.env` e configure as variáveis de ambiente
- Exporte `GOOGLE_APPLICATION_CREDENTIALS` para apontar para o arquivo, ou deixe `serviceAccountKey.json` na raiz do projeto
- Como alternativa, cole o JSON da conta de serviço em `SERVICE_ACCOUNT_JSON` no `.env`

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
```

No `.env`, você pode usar:

```bash
SERVICE_ACCOUNT_JSON='{"type":"service_account", ... }'
```

Você também pode usar `.env` e rodar o seed diretamente:

```bash
cp .env.example .env
# preencha .env com seus valores
npm run seed-admin
```

Se preferir, use também `FIREBASE_PROJECT_ID` ao rodar o seed:

```bash
FIREBASE_PROJECT_ID="meu-projeto" \
ADMIN_EMAIL="admin@seudominio.com" \
ADMIN_PASSWORD="troque-esta-senha" \
ADMIN_NAME="Admin" \
npm run seed-admin
```

Rodar o servidor Node de criação de usuários:

```bash
npm run server
```

Por padrão, o backend sobe em `http://localhost:4100`.

Limpeza de dados duplicados:

```bash
npm run cleanup-data
```

Esse comando cria backup em `data/cleanup-backups`, remove metas/lojas duplicadas por chave lógica e limpa campos antigos de realizado manual.

Seed e regras
- Para cadastrar ou atualizar o primeiro administrador (Auth + Firestore + custom claim):

```bash
ADMIN_EMAIL="admin@seudominio.com" \
ADMIN_PASSWORD="troque-esta-senha" \
ADMIN_NAME="Admin" \
npm run seed-admin
```

Se aparecer `auth/configuration-not-found`, abra o Firebase Console do projeto correto, entre em Authentication, clique em "Começar" e habilite o provedor Email/Password.

- Para gerar usuários de exemplo (Auth + Firestore) execute:

```bash
node scripts/seedUsers.js
```

- O backend também suporta:
  - `POST /api/users/:uid/reset-password` para redefinir a senha do usuário
  - `DELETE /api/users/:uid` para desativar o usuário no Auth e Firestore
- Regras e índices de exemplo estão em `firestore.rules` e `firestore.indexes.json`.
- Para implantar regras:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Rodar em desenvolvimento:

```bash
npm run dev
```

Rodar para acessar na rede da loja:

1. No computador principal, descubra o IP local:

```bash
hostname -I
```

2. Em um terminal, rode o backend:

```bash
PORT=4100 npm run server
```

3. Em outro terminal, rode o frontend liberado para a rede:

```bash
VITE_API_URL="http://IP-DO-COMPUTADOR:4100" npm run dev -- --host 0.0.0.0
```

Preparar para colocar online:

```bash
npm run cleanup-data
npm test -- --run
npm run build
```

Em hospedagem, configure `VITE_API_URL` com a URL pública do backend.

4. Nos outros computadores/celulares da loja, acesse:

```text
http://IP-DO-COMPUTADOR:5173
```

Publicar para acessar pela internet:

- O frontend precisa ser publicado com `VITE_API_URL` apontando para o endereço online do backend.
- O backend precisa rodar em uma hospedagem Node com as variáveis `SERVICE_ACCOUNT_JSON` ou `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID` e `ALLOWED_ORIGINS`.
- Use `ALLOWED_ORIGINS` com o domínio real do frontend, por exemplo:

```bash
ALLOWED_ORIGINS="https://sit-crm.web.app"
```

- Antes de publicar o frontend:

```bash
npm run build
```

Segurança do backend:
- Todas as rotas `/api` exigem login por token do Firebase Authentication.
- O backend valida o perfil real do usuário no Firebase/Firestore, sem confiar no cargo enviado pela tela.
- Vendedores só conseguem acessar as próprias vendas e metas.
- Administrador, Gestor Master e Gerente continuam com acesso gerencial.

Instalar como app no Android e iPhone:

O CRM foi preparado como PWA. Depois de abrir o endereço do sistema no navegador:

- Android/Chrome: toque no menu de três pontos e escolha `Instalar app` ou `Adicionar à tela inicial`.
- iPhone/Safari: toque em compartilhar e escolha `Adicionar à Tela de Início`.

Para testar como app instalável na rede da loja, gere e sirva a versão de produção:

```bash
VITE_API_URL="http://IP-DO-COMPUTADOR:4000" npm run build
npm run preview -- --host 0.0.0.0
```

Depois acesse:

```text
http://IP-DO-COMPUTADOR:4173
```

Observação: para iPhone instalar corretamente, acesse por um endereço `https://` publicado online. Na rede local via `http://IP-DO-COMPUTADOR:5173`, o navegador pode abrir normalmente, mas a instalação como app pode ficar limitada.

Observações:
- Este scaffold é um ponto de partida profissional; adicione validações, regras de segurança no Firestore, e testes.
- Para deploy, use Vercel, Netlify ou Firebase Hosting.
