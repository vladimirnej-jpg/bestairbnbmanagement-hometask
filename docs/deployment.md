# Deployment and operations

## Production topology

```text
Vercel (Next.js App Router) ──HTTPS──> Neon PostgreSQL
          │
          └── /api/inngest <── Inngest durable functions
                                  │
                                  └── Google / OpenRouter / Nominatim
```

The Vercel project root is `bestairbnb-take-home/`. Use Node.js 22 and a
region close to the Neon database; `vercel.json` defaults to `fra1` and can be
changed with the deployment decision.

## Local PostgreSQL

`docker-compose.yml` contains only the local PostgreSQL option. Start it with:

```bash
docker compose up -d postgres
pnpm db:migrate
```

Run Next.js and Inngest in separate terminals:

```bash
pnpm dev
INNGEST_DEV=1 pnpm inngest:dev
```

## Operations checklist

- Set a randomly generated `JWT_SECRET` and strong user passwords.
- Restrict production provider credentials to the secret store.
- Configure Neon backups, health checks, log retention, and provider alerts.
- Run `pnpm smoke:live` only as a bounded release check with non-production
  credentials; redact output in CI logs.
- Rotate Google refresh tokens and OpenRouter keys independently.
- Confirm Inngest discovers all functions after deployment.
