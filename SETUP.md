# Setup

## 1. Node.js

Install Node.js 20 or newer from [https://nodejs.org](https://nodejs.org). Check it:

```bash
node -v
npm -v
```

## 2. PostgreSQL

Use one of these:

- Docker Desktop, then `docker compose up -d` from the `edumanage` folder
- Your own PostgreSQL 16 server
- `npm run db:up`, which tries Docker and otherwise starts a development server stored in `.pgdata`

Do not commit `.pgdata` or `backend/.env`.

## 3. Git

Clone the repository, then work inside `edumanage/`.

## 4. Dependencies

From `edumanage/`:

```bash
npm install
```

This installs the shared package, the API, and the web app.

## 5. Environment variables

```bash
copy .env.example backend\.env
```

On macOS or Linux, use `cp .env.example backend/.env`.

Set real values before any shared or production deployment:

- `DATABASE_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` when you want real email
- `STORAGE_URL` if uploaded files are served from another host

When email is empty, development responses include a one-time verification or reset link so the flow can still be tested.

## 6. Database

From `edumanage/`:

```bash
npm run db:up
```

## 7. Prisma

From `edumanage/backend`:

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

Or from `edumanage/`:

```bash
npm run build:shared
npm run db:migrate --workspace backend
npm run db:seed --workspace backend
```

`prisma db seed` loads Greenfield Academy. Running it again deletes that demo school and recreates it. It does not remove other schools except through that demo code.

## 8. Frontend

From `edumanage/frontend`:

```bash
npm run dev
```

Vite serves the app at http://localhost:5173 and proxies `/api` to port 4000.

## 9. Backend

From `edumanage/backend`:

```bash
npm run dev
```

Health check: http://localhost:4000/api/health

Both processes together, from `edumanage/`:

```bash
npm run dev
```

## Optional analytics

From `edumanage/analytics`, with the same `DATABASE_URL`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --port 4100
```

The main app does not require this service. Dashboard figures are calculated by the API.

## Production deploy

Push this `edumanage` folder as the GitHub repository root.

Set `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `NODE_ENV=production`, `DEMO_MODE=false`, `APP_URL`, and `CORS_ORIGIN` on the host. Then:

```bash
npm ci
npm run build
npm run db:deploy
npm start
```

`Dockerfile` does the same build, then runs migrations and starts the server. Serve the site over HTTPS. The sign-in cookie is marked secure in production.
