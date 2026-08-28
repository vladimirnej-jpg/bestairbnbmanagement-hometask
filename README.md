# BestAirbnb Lead Operations

BestAirbnb Lead Operations converts an inbound property-services email into a
reviewed Gmail draft.

The application ingests a dedicated Gmail inbox, enriches and qualifies each
lead against Google Sheets master data, blocks leads outside the service area,
and lets an operations representative review and send a customer-ready
showcase. A separate monitoring view provides read-only operational oversight.

## Architecture

```text
Gmail + Google Sheets + Google Calendar
                    |
                    v
          Provider adapters / ports
                    |
                    v
  Next.js route handlers -> application services -> Prisma/PostgreSQL
                    |
                    v
       Inngest durable workflows and retries
                    |
                    v
        Next.js OPS and MONITOR interfaces
```

### Component breakdown and reuse

| Area                      | Responsibility                                                                     | Reusable part                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/app`                 | App Router pages and API route handlers                                            | Route-level auth and error envelope patterns                                      |
| `src/features`            | Lead queue, property review, showcase editor, monitoring UI                        | Feature components consume typed API clients rather than server internals         |
| `src/components`          | App shell, loading/error states, status badges, toast                              | Shared presentation components usable by any operational screen                   |
| `src/server/modules`      | Lead, master data, processing, qualification, showcase, sync, and monitoring logic | Domain services and repositories can be reused by future channels or an admin API |
| `src/server/integrations` | Gmail, Sheets, Calendar, geocoding, and LLM adapters                               | Provider interfaces permit fake, live, or replacement implementations             |
| `src/inngest`             | Scheduled ingestion and durable processing workflows                               | Workflows isolate retries and make long-running provider calls observable         |

The browser calls only same-origin `/api` endpoints. Server-side handlers
authenticate every request and enforce role permissions; client-side route
guards are only a user-experience convenience.

## Main design decisions and trade-offs

### Next.js modular monolith

The app is one deployable unit: App Router UI, API handlers, and server
services live together while still separating feature and infrastructure code.

Trade-off: this is intentionally not a microservice system. If the workload
becomes large, ingestion and processing can be extracted because the provider
and workflow boundaries already exist.

### PostgreSQL with Prisma

PostgreSQL stores operational decisions that must not be lost when Gmail or
Google Sheets change: lead lifecycle, audit events, processing attempts,
property-match reviews, showcase edits, and Gmail draft IDs. Prisma gives
typed migrations and a concise repository implementation.

PostgreSQL was chosen specifically because the operational model is strongly
relational: leads have messages, properties, processing runs, lifecycle
events, match candidates, showcases, and service-zone relationships. Foreign
keys, unique constraints, indexes, and transactions keep these related
records consistent while supporting filtered operational views and reporting.
PostgreSQL is also mature, widely available as a managed or self-hosted
service, and has first-class Prisma support. A document database would make
the cross-entity queries and consistency guarantees more difficult without
providing a meaningful benefit for this workload.

Google Sheets remains the editable source of truth for properties, zones, and
services. PostgreSQL holds a validated projection so lead processing does not
depend on a live Sheet request and historical workflow state stays durable.

Trade-off: this duplicates master data. The sync layer therefore validates a
complete snapshot and applies the projection atomically.

### Inngest for background work

Gmail and master-data syncs run on schedules. Per-lead processing is durable,
retriable, and serialized by lead ID, which avoids losing work during a web
request timeout.

Trade-off: local development requires a second process (`pnpm inngest:dev`),
and a production deployment needs Inngest configuration.

### Provider ports and fakes

External integrations are behind interfaces. The same application services can
run against Google APIs in a demo or deterministic fakes in tests.

Trade-off: there is more code than directly calling provider SDKs from route
handlers, but the boundary makes error handling, replacement, and tests much
safer.

## Prerequisites

- Node.js 22.14 or newer
- pnpm 10 (`corepack enable`)
- Docker Desktop or PostgreSQL 16
- A dedicated non-production Google mailbox, Sheet, and Calendar for a live
  demo

## Local setup

```bash
cd bestairbnb-take-home
pnpm install
cp .env.example .env

# Use the included PostgreSQL container (or start PostgreSQL 16 yourself).
docker compose up -d --wait postgres
pnpm db:migrate
pnpm db:seed
```

The default `PROVIDER_MODE=fake` works without Google or LLM credentials. Keep
the generated `.env` for local testing; configure live credentials only for a
dedicated demo account.

Run the application and the local Inngest server in separate terminals. Both
commands must be run from `bestairbnb-take-home`:

```bash
pnpm dev
pnpm inngest:dev
```

Open <http://localhost:3000/login>.

`pnpm db:seed` creates or updates the demo users. By default they are
`ops@example.com` / `ops-demo-password` and
`monitor@example.com` / `monitor-demo-password`. Set the matching `OPS_*` or
`MONITOR_*` environment variables before seeding only when you need to
override those local defaults.

For a clean local demo database, use the destructive
`pnpm reset:demo -- --yes` command instead. It removes existing local demo
data before recreating the demo users.

## Import a test email into the QA Gmail mailbox

For a live end-to-end check, the CLI can import an RFC822 message into the
configured non-production Gmail mailbox and then queue the same Gmail sync
workflow used by the application. The message is not sent to an external
recipient, but it does become real data in that QA mailbox.

Before using this command:

- set `PROVIDER_MODE=live` in `.env`;
- set `GOOGLE_GMAIL_USER_ID` to the QA mailbox address, or `me` when the OAuth
  token belongs to that QA mailbox;
- grant the OAuth token the `gmail.insert` or `gmail.modify` scope;
- keep `GOOGLE_GMAIL_QUERY` broad enough to find the imported message;
- run `pnpm dev` and `pnpm inngest:dev` in separate terminals.

Import one of the checked-in scenarios:

```bash
pnpm gmail:inject -- \
  --file scenarios/qualified-inside.eml \
  --confirm-mailbox qa-mailbox@example.com
```

The command waits for Gmail ingestion and the three processing steps. Use
`--fire-and-forget` to return after importing and queueing the sync, or
`--dry-run` to validate an RFC822 file without calling Google or Inngest.
On every run the CLI keeps the selected scenario's subject and body, but
replaces its `Date` header with the current time, generates a unique test
sender address, and adds a unique subject/`Message-ID` suffix so Gmail starts a
separate conversation. The checked-in scenarios cover:

- `qualified-inside.eml` - complete Amsterdam request;
- `qualified-amsterdam-apartment.eml` - recurring apartment and linen service;
- `qualified-amsterdam-dutch.eml` - complete request written in Dutch;
- `multipart-qualified.eml` - multipart/alternative MIME message;
- `needs-info.eml` - no property address;
- `needs-info-incomplete-address.eml` - address without house number/postcode;
- `out-of-zone.eml` and `out-of-zone-utrecht.eml` - supported-service-area misses;
- `ambiguous-multiple-properties.eml` - two property addresses in one request.

## Runtime configuration

Copy `.env.example` to `.env` and configure only non-production credentials.

| Integration     | Required configuration                                         |
| --------------- | -------------------------------------------------------------- |
| PostgreSQL      | `DATABASE_URL`, `DIRECT_URL`                                   |
| Authentication  | `JWT_SECRET`, OPS and MONITOR user credentials                 |
| Gmail           | OAuth client ID, secret, refresh token, mailbox query          |
| Google Sheets   | Spreadsheet ID and base64 service-account JSON                 |
| Google Calendar | Calendar ID and Gmail OAuth credentials                        |
| LLM extraction  | `LEAD_INTELLIGENCE_PROVIDER` plus OpenRouter or Groq key/model |
| Geocoding       | `NOMINATIM_BASE_URL`                                           |

The default `PROVIDER_MODE=fake` is intended for local automated testing.
Use `PROVIDER_MODE=live` only with a dedicated demo account.

## Testing plan

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

| Layer       | What it covers                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Qualification policy, address/property matching, master-data validation, Gmail draft idempotency, auth, runtime config, and Inngest dispatching                               |
| Integration | Route contracts and service flows against a configured test PostgreSQL database (`TEST_DATABASE_URL`)                                                                         |
| E2E         | An OPS user syncs master data and Gmail, turns an incomplete conversation into a qualified lead, creates a showcase draft, updates lifecycle, then verifies monitoring access |
| Live smoke  | `pnpm smoke:live` checks configured Google, geocoding, and LLM connections; `pnpm gmail:inject` imports a selected RFC822 case into the QA mailbox and runs Gmail sync        |

The lead-extraction evaluation is part of `pnpm test` and uses committed,
recorded provider responses only, so CI makes no paid model calls. It gates
zero false `OUT_OF_ZONE` decisions for protected cases and at least 90% exact
matches across `postcode`, `street`, `houseNumber`, and `contactEmail`.
Refresh snapshots only deliberately with `pnpm eval:lead-extraction:record`
while `PROVIDER_MODE=live`; the command refuses every other mode and production.
When T7 introduces its confidence threshold, calibrate that threshold against
this fixture set before using it to automate a qualification decision.

Google setup details are in [docs/google-setup.md](docs/google-setup.md).

## Security and operational safeguards

- JWT authorization is required for API routes; OPS can mutate state and
  MONITOR is read-only.
- Passwords are bcrypt-hashed; credentials remain in environment variables.
- Zod validates request payloads and master-data snapshots.
- Gmail message IDs and thread IDs provide ingestion idempotency.
- Showcase creation is gated by qualification and available zone services.
- Gmail drafts use a persisted intent key so retries update the same draft.
- Email previews run in a sandboxed iframe; client-generated preview fields
  are escaped.
- Demo reset refuses production and non-local database targets.

## Rough cost estimate at scale

This is an illustrative planning estimate, not a provider quote. It assumes one
lead-processing run per lead, 2,500 input tokens and 300 output tokens per run,
one production region, and no high-availability replica. Replace the example
rates with the selected provider's current pricing before production.

### LLM cost (calculated separately)

The application uses the configured OpenRouter or Groq model for structured extraction.
The following example uses USD 0.10 per million input tokens and USD 0.40 per
million output tokens only to make the calculation explicit:

| Monthly leads | Input tokens | Output tokens | Calculation                     | Estimated LLM cost |
| ------------: | -----------: | ------------: | ------------------------------- | -----------------: |
|         1,000 |         2.5M |          0.3M | `(2.5 x $0.10) + (0.3 x $0.40)` |          **$0.37** |
|        10,000 |          25M |            3M | `(25 x $0.10) + (3 x $0.40)`    |          **$3.70** |
|       100,000 |         250M |           30M | `(250 x $0.10) + (30 x $0.40)`  |         **$37.00** |

Actual spend can be higher or lower depending on the model, prompt size,
fallback usage, retries, and whether the selected model is free, pay-as-you-go,
or premium. The formula is:

```text
LLM cost = (input tokens / 1,000,000 * input price)
         + (output tokens / 1,000,000 * output price)
```

### Infrastructure cost by system

| System                      | Role                                         | 1,000 leads/month | 10,000 leads/month | Main cost driver                                                        |
| --------------------------- | -------------------------------------------- | ----------------: | -----------------: | ----------------------------------------------------------------------- |
| Vercel                      | Next.js web/API runtime                      |            $20-50 |            $30-150 | Team plan and request/compute usage                                     |
| Neon PostgreSQL             | Operational state and master-data projection |             $0-30 |            $30-150 | Compute hours, storage, and data transfer                               |
| Inngest                     | Scheduled syncs, fan-out, retries            |             $0-30 |             $0-100 | Function runs and event volume                                          |
| Gmail API                   | Lead messages and drafts                     |                $0 |                 $0 | Google API usage is normally quota-based; mailbox licensing is separate |
| Google Sheets API           | Master-data source                           |                $0 |                 $0 | Google API quota; spreadsheet/user licensing is separate                |
| Google Calendar API         | Monitoring upcoming appointments             |                $0 |                 $0 | Google API quota; Workspace licensing is separate                       |
| Geocoding                   | Address enrichment                           |             $0-25 |            $25-150 | Public endpoint limits or a paid geocoding provider                     |
| Logs and error tracking     | Operational diagnostics                      |             $0-25 |            $20-100 | Retention and event volume                                              |
| Backups, DNS, and misc.     | Recovery and edge services                   |             $0-20 |             $10-50 | Backup retention and bandwidth                                          |
| **Infrastructure subtotal** | Excludes LLM usage                           |       **$20-180** |       **$115-700** | —                                                                       |

Indicative combined totals are therefore **$20.37-180.37/month** for 1,000
leads and **$118.70-703.70/month** for 10,000 leads, using the example LLM
rate above. Google API rows exclude any paid Google Workspace seats.

The largest variables are database/compute sizing, geocoding volume, log
retention, and LLM model choice. Costs can be controlled with message-length
limits, one extraction per changed conversation, retries only for transient
errors, caching stable geocoding results, and retention policies for raw email
bodies and processing logs.

### Actual time spent

16 hours
