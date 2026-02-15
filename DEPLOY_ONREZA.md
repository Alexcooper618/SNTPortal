# ONREZA Deploy (Monorepo): SNTPortal

Репозиторий — монорепа: `backend/` и `frontend/`. На ONREZA нужно создать **2 проекта** с разными root directories.

## Проект 1: API (backend)

**Source**: GitHub `Alexcooper618/SNTPortal`, branch `main`  
**Root directory**: `backend`

**Install**: `npm ci`  
**Build**: `npm run build`  
**Start**: `npm run start:prod`

### Env vars (минимум)
- `NODE_ENV=production`
- `DATABASE_URL=...` (PostgreSQL)
- `JWT_ACCESS_SECRET=...` (длинная случайная строка)
- `JWT_REFRESH_SECRET=...` (длинная случайная строка)
- `CORS_ORIGIN=https://<your-web-domain>` (можно несколько через запятую, либо `*` временно)
- (опционально) `DEFAULT_TENANT_SLUG=rassvet`
- (опционально) `TBANK_TERMINAL_KEY=...`
- (опционально) `TBANK_WEBHOOK_SECRET=...`

### Проверка
- health: `GET https://<api-domain>/health`
- API base: `https://<api-domain>/api/v1`

## Проект 2: Web (frontend)

**Source**: GitHub `Alexcooper618/SNTPortal`, branch `main`  
**Root directory**: `frontend`

**Install**: `npm ci`  
**Build**: `npm run build`  
**Start**: `npm run start`

### Env vars
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://<api-domain>/api/v1`

## Типовая причина ошибки ENOENT /workspace/package.json
Если ONREZA запускает npm в корне репозитория (`/workspace`) — он не найдет `package.json`.
Решение: поставить правильный **Root directory** (`backend` или `frontend`) для проекта.

