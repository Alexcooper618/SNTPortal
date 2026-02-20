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
- `MEDIA_UPLOAD_DIR=/app/uploads`
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

## Альтернатива: единый Docker Compose на одном сервере

Если деплой идет не через два отдельных ONREZA-проекта, а на один VPS:

1. В корне репо использовать `docker-compose.yml`, `Dockerfile.api`, `Dockerfile.web`.
2. Создать `.env` из `.env.example` и заполнить секреты.
3. Запуск:

```bash
docker compose build --no-cache api web
docker compose up -d --force-recreate traefik api web
docker compose logs --tail=200 api
```

4. Миграции:

```bash
docker compose exec api npm run migrate:deploy
```

6. Постоянное хранилище медиа:
   - backend хранит фото/видео из соц-ленты в `MEDIA_UPLOAD_DIR` (по умолчанию `/app/uploads`);
   - для Docker Compose уже добавлен volume `api_uploads`, его удалять нельзя при redeploy.

5. Проверка:

```bash
curl -i https://api.snt-portal.ru/api/v1/auth/tenants
curl -i https://api.snt-portal.ru/health
```
