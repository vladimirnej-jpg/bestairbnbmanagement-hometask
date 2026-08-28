# Architecture notes

## Runtime boundaries

Next.js owns the App Router UI and same-origin API route handlers. Inngest owns
durable background work and retries. Prisma persists operational state in Neon
PostgreSQL. Google, Nominatim, and OpenRouter integrations stay behind provider
ports.

```text
Next.js on Vercel
  +-- App Router pages and protected client boundaries
  +-- API route handlers with JWT and role checks
  +-- Inngest endpoint /api/inngest
        |
        +-- Gmail ingestion -> lead-processing fan-out
        +-- master-data projection
        +-- schedules for Gmail and master data
              |
              +-- Neon PostgreSQL through Prisma
              +-- Google / Nominatim / OpenRouter adapters
```

## Source-of-truth rules

Gmail owns the conversation and is ingested idempotently by message ID and
thread ID. A single Google Sheet owns four tabs: `Properties`, `ServiceZones`,
`Services`, and `ZoneServices`. Sync validates the complete snapshot before an
atomic projection; missing source rows are marked inactive/missing rather than
deleted.

The database owns operational decisions: qualification, lifecycle, human match
confirmation, showcase edits, processing attempts, and Gmail draft IDs.

## Safety and idempotency

Inngest retries provider failures with bounded attempts and serializes Gmail,
master-data, and per-lead processing work. Qualification is separate from
master-data freshness: a complete lead can be qualified while a showcase
remains blocked by a missing projection or service context. Showcase generation
is blocked for `NEEDS_INFO`, `NEEDS_REVIEW`, and `OUT_OF_ZONE`; manual edits
require explicit overwrite confirmation.

Gmail draft synchronization uses an intent key persisted before the provider
call. A retry updates the existing draft instead of creating another one.

## UI state

TanStack Query owns server state. Background command endpoints return `202` and
an event ID. The UI displays a queued state, polls persisted sync or lead state
with a bounded timeout, and invalidates affected queries after completion. It
never polls the Inngest dashboard. Showcase generation, editing, and draft
actions remain immediate API operations.

## Deployment topology

Deploy the Next.js app from the repository root to Vercel. Use Neon PostgreSQL in
production and local PostgreSQL plus fake providers for development and E2E.
Apply Prisma migrations as part of the production deployment procedure using
`DIRECT_URL`. Inngest discovers the deployed `/api/inngest` endpoint after the
Vercel deployment.
