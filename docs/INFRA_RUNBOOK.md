# SNTPortal Infra Runbook (2 VM)

Этот документ является основным источником правды по инфраструктуре и деплою.

## 1) Текущая топология

- Домен приложения: `app.snt-portal.ru`
- Домен API: `api.snt-portal.ru`

### VM-1 (app stack)

- Назначение: reverse proxy + web + api
- IP: `217.114.15.55`
- Путь проекта: `/opt/snt-app/SNTPortal`
- Основные сервисы (`docker compose`):
  - `traefik`
  - `web`
  - `api`

### VM-2 (database)

- Назначение: PostgreSQL
- IP: `155.212.221.8`
- Подключение из `DATABASE_URL` в `.env` на VM-1

## 2) Source of truth для конфигурации

- Основной compose: `/opt/snt-app/SNTPortal/docker-compose.yml`
- Runtime env (секреты и URL): `/opt/snt-app/SNTPortal/.env`
- Резервные копии конфигов: `/root/snt-recovery-*`

Правило:

- Секреты не храним в git.
- В git допускаются только шаблоны (`.env.example`) и документация.

## 3) Обязательные переменные `.env` на проде

- `DATABASE_URL` (должен указывать на прод-БД VM-2)
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN=https://app.snt-portal.ru`
- `NEXT_PUBLIC_API_URL=https://api.snt-portal.ru/api/v1`
- `SNT_API_URL=https://api.snt-portal.ru/api/v1`
- `DEFAULT_TENANT_SLUG=rassvet`
- `PLATFORM_ADMIN_PHONE`
- `PLATFORM_ADMIN_PASSWORD`
- `PLATFORM_ADMIN_NAME`

## 4) Стандартные сценарии деплоя

Все команды выполняются на VM-1 в `/opt/snt-app/SNTPortal`.

### 4.1 Web-only деплой (дизайн/клиентские правки)

Этот режим не должен менять БД и API.

```bash
cd /opt/snt-app/SNTPortal
git status
git pull origin main
docker compose build web
docker compose up -d --no-deps --force-recreate web
docker compose logs --tail=100 web
```

### 4.2 API + Web деплой

```bash
cd /opt/snt-app/SNTPortal
git status
git pull origin main
docker compose build --no-cache api web
docker compose up -d --force-recreate traefik api web
docker compose logs --tail=200 api
docker compose logs --tail=100 web
```

### 4.3 Full restart (runtime)

```bash
cd /opt/snt-app/SNTPortal
docker compose up -d --force-recreate traefik api web
docker compose ps
```

## 5) Быстрые проверки (smoke checks)

```bash
curl -i https://api.snt-portal.ru/health
curl -i https://api.snt-portal.ru/api/v1/auth/tenants
```

Проверка активного `DATABASE_URL` и tenant slug внутри `api`:

```bash
docker compose exec api sh -lc 'echo "$DATABASE_URL" | sed "s#://.*@#://***@#"; echo "$DEFAULT_TENANT_SLUG"'
```

Проверка объема данных:

```bash
docker compose exec api node -e 'const {PrismaClient}=require("@prisma/client");(async()=>{const p=new PrismaClient();console.log("tenants",await p.tenant.count());console.log("users",await p.user.count());await p.$disconnect();})();'
```

## 6) Аварийное восстановление (если пропали входы/СНТ)

Симптом:

- В `auth/tenants` пусто или не те СНТ.
- Пользователи не могут войти после деплоя.

Чеклист:

1. Снять бэкап текущих файлов:

```bash
cd /opt/snt-app/SNTPortal
TS=$(date +%F-%H%M%S)
mkdir -p /root/snt-recovery-$TS
cp -a docker-compose.yml .env /root/snt-recovery-$TS/ 2>/dev/null || true
```

2. Проверить `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` в `.env`.
3. Убедиться, что `DATABASE_URL` указывает на рабочую прод-БД VM-2, а не на локальный `postgres` контейнер по умолчанию.
4. Перезапустить runtime:

```bash
docker compose up -d --force-recreate traefik api web
docker compose logs --tail=200 api
```

5. Повторить smoke checks.

## 7) Rollback

Если после обновления появились регрессии:

```bash
cd /opt/snt-app/SNTPortal
git log --oneline -n 10
git checkout <previous_commit_sha>
docker compose build api web
docker compose up -d --force-recreate traefik api web
```

После аварийного rollback зафиксировать причину и вернуть `main` в рабочее состояние отдельным коммитом.

## 8) Операционные правила (обязательные)

- Перед любым `git pull` всегда запускать `git status`.
- Для дизайн-правок выполнять только web-only деплой.
- Не запускать на проде:
  - `prisma migrate reset`
  - `prisma db push --force-reset`
- Перед перезапуском `api` проверять:
  - `DATABASE_URL`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
- `.env` на сервере не коммитить в git.

## 9) Проверка функциональности после релиза

- Логин отображает список СНТ.
- `ADMIN` после входа попадает на `/platform`.
- На `/platform` доступны управление СНТ и пользователями.
- На dashboard обычного пользователя отображается weather widget (если у СНТ заданы координаты).
