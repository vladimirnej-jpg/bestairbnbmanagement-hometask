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

## Controlled production order

```text
CI verification
  -> Prisma migrate deploy through DIRECT_URL
  -> Vercel production deployment
  -> Inngest function synchronization
```

The migration job must use the privileged `DIRECT_URL` connection. Runtime
`DATABASE_URL` may use Neon pooling. Never run migrations from `next build`, a
Route Handler, or an Inngest function.

The manual GitHub workflow `.github/workflows/deploy-production.yml` encodes
this order. Configure these GitHub secrets before dispatching it:

- `DATABASE_URL` - production runtime/pooler URL used by the deployment;
- `DIRECT_URL` - direct Neon URL used only by the migration job;
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN`;
- `APP_URL` - deployed HTTPS origin;
- `INNGEST_EVENT_KEY`.

Configure the following Vercel production variables:

```text
DATABASE_URL
DIRECT_URL
JWT_SECRET
PROVIDER_MODE=live
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
Google Sheets/Gmail/Calendar variables
OPENROUTER variables
NOMINATIM_BASE_URL
```

Do not add Langfuse variables. Preview Neon branches are optional and outside
the minimum migration.

## Local PostgreSQL

`docker-compose.yml` contains only the local PostgreSQL option. Start it with:

```bash
docker compose up -d postgres
pnpm db:migrate
RESET_DEMO_CONFIRM=I_UNDERSTAND pnpm reset:demo
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
