# SNT Portal Frontend

Next.js (App Router) frontend for resident/chairman portal.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3001 (or the port printed by Next.js).

Set API URL via:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

## Main routes

- `/login` phone + password auth
- `/change-password` forced password rotation
- `/dashboard` summary
- `/payments` billing and online payment start
- `/news` content feed
- `/forum` modern messenger (topics + direct chats)
- `/map` GIS layers and objects
- `/documents` doc registry
- `/incidents` resident incidents
- `/governance` meetings and votes
- `/admin` chairman dashboard

## Closed access

- New users are created by chairman from `/admin` with temporary password.
- Login currently supports phone/password only.
- OTP and self-registration are temporarily disabled.
