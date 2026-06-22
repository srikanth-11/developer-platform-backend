# Deployment — 100% free (learning) stack

| Piece | Host | Free tier |
|-------|------|-----------|
| Frontend (React SPA) | **Vercel** Hobby | free forever |
| Backend (NestJS Docker) | **Render** web service | free forever (sleeps after ~15 min idle) |
| PostgreSQL | **Neon** | free forever (auto-suspends when idle) |
| Redis | **Render Key Value** | free forever (25 MB) |

```
Vercel (SPA) ──HTTPS──> Render web service (NestJS) ──> Neon Postgres (TLS)
                                                   └──> Render Key Value (Redis)
```

No GitHub Actions / Terraform needed — Render and Vercel both auto-deploy from Git.

> **Free-tier caveats (fine for learning):** the Render backend sleeps after
> ~15 min of inactivity, so the first request after idle takes ~30–60s to wake.
> Neon also auto-suspends; the first query after idle has a small cold start.

---

## 1. Create the database (Neon)
1. Sign up at neon.tech → create a project (pick a region near you).
2. Copy the **pooled** connection string (the host contains `-pooler`).
   It looks like `postgresql://user:pass@ep-xxx-pooler.REGION.aws.neon.tech/dbname`.

## 2. Deploy the backend (Render)
1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → connect the repo. Render reads
   `render.yaml` and creates the **web service** + **Key Value** (Redis).
3. When prompted, fill the `sync: false` env vars:
   - `DATABASE_URL` → the Neon pooled string from step 1
   - `CORS_ORIGINS` → your Vercel URL (you can set a placeholder now, fix in step 4)
   - `FRONTEND_URL` → your Vercel URL
   - `STRIPE_SECRET_KEY` → your Stripe key
   - `STRIPE_WEBHOOK_SECRET` → leave blank for now (step 5)
   (`REDIS_URL` is auto-wired; `JWT_SECRET` is auto-generated.)
4. Deploy. First boot runs with `DB_SYNCHRONIZE=true` to create the schema.
   Health check: open `https://<your-service>.onrender.com/api/health` → `200`.

## 3. Deploy the frontend (Vercel)
1. Import `developer-platform-frontend` in Vercel (framework auto-detected: Vite).
2. Add env var (Production): `VITE_API_BASE_URL = https://<your-service>.onrender.com/api`
3. Deploy. `vercel.json` handles the SPA fallback so `/dashboard` refresh works.

## 4. Connect the two
- Put the real Vercel URL into the Render backend's `CORS_ORIGINS` and
  `FRONTEND_URL` env vars → save (Render redeploys).

## 5. Stripe webhook
1. Stripe dashboard → Developers → Webhooks → add endpoint:
   `https://<your-service>.onrender.com/api/billing/webhook`
2. Copy the signing secret (`whsec_...`) into the Render env var
   `STRIPE_WEBHOOK_SECRET` → save.

## 6. Freeze the schema
Once the app is up and tables exist, set the Render env var
`DB_SYNCHRONIZE=false` and redeploy. (No migrations exist yet, so until you add
them, schema changes need a one-off `true` deploy.)

---

## Local development is unchanged
`npm run dev` still uses the discrete `DB_*` / `REDIS_*` vars from `.env` and the
local `docker-compose.yml`. The new `DATABASE_URL` / `REDIS_URL` simply take
precedence when present (production), so nothing local breaks.

## Switching Redis to Upstash (optional)
Prefer Upstash over Render Key Value? Create an Upstash Redis DB, copy its
`rediss://` URL into the Render `REDIS_URL` env var, and delete the `dp-redis`
service from `render.yaml`. (Heads-up: Upstash's free tier caps commands/day,
which a busy BullMQ worker can exhaust — Render Key Value has no such cap.)
