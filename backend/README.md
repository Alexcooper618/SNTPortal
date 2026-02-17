# SNT Portal Backend

Express + Prisma API for resident/chairman portal.

## Run locally

```bash
npm install
npx prisma generate
npm run dev
```

Default API root: `http://localhost:3000/api/v1`

## Auth model

- Closed registry: users must be pre-created by chairman.
- Current login mode: phone + password (`/auth/login`).
- OTP endpoints (`/auth/request-otp`, `/auth/verify-otp`) are temporarily disabled.
- Self-registration endpoint (`/auth/register-snt`) is temporarily disabled.
- Chairman creates resident via `POST /users` with `temporaryPassword`.
- First login with temporary password returns `mustChangePassword=true`; user must call `/auth/change-password`.

## Main endpoint groups

- `/auth` - OTP/session lifecycle, tenant bootstrap
- `/users` - residents/chairman management
- `/plots` - plots and ownership
- `/billing` - charges, invoices, balances
- `/payments` - online payment + webhook
- `/news`, `/documents` - content
- `/forum`, `/chat` - communication
- `/map`, `/incidents` - GIS + operational workflow
- `/meetings`, `/votes` - governance
- `/notifications` - in-app notifications
- `/audit` - security and admin audit trail

OpenAPI draft: `backend/openapi.yaml`
