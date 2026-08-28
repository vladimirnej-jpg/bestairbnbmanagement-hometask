# Demo script

## Before the demo

1. Copy `.env.example` to `.env` and configure a dedicated non-production
   Google Sheet, Gmail mailbox, Calendar, and OpenRouter key.
2. Start PostgreSQL and run `pnpm db:migrate`.
3. Run `RESET_DEMO_CONFIRM=I_UNDERSTAND pnpm reset:demo`.
4. Start Next.js with `pnpm dev` and Inngest with `INNGEST_DEV=1 pnpm inngest:dev`.
5. Check `/api/health/live` and confirm the Inngest Dev Server discovers all
   functions.
6. Confirm the Sheet tabs, Gmail query, Calendar, and OpenRouter model point to
   the intended non-production sources.
7. Run `pnpm smoke:live` only against that non-production account.

## Critical path

1. Sign in as `ops@example.com`.
2. Click **Sync master data** and observe the visible queued state until the
   persisted projection status reports completion.
3. Click **Sync Gmail** and review the actual new or updated conversations from
   the configured mailbox.
4. Show that incomplete conversations stay in `NEEDS_INFO` until the sender
   provides the required information; do not rely on a synthetic named lead.
5. Open the lead, inspect the conversation, property match, qualification
   checklist, and processing timeline.
6. Generate the showcase, edit the subject, save it, and confirm the shared
   email preview.
7. Click **Save to Gmail**, then open the generated draft. A repeated sync
   updates the same draft rather than creating a duplicate.
8. Change lifecycle to **Warm** and verify the audit event.
9. Sign out and sign in as `monitor@example.com`. Open Monitoring and show the
   source health, qualification counts, failures, calendar, and activity.
10. Point out that mutation controls and lead-operation links are absent for
    the monitor role.

## Manual pre-demo checks

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build` are green.
- `pnpm test:integration` passes with `TEST_DATABASE_URL` configured.
- `pnpm test:e2e` passes against fake providers and the Inngest Dev Server.
- No `.env` file, access token, complete email body, or customer export is in
  version control.
- Inspect the Google account, Sheet tabs, Gmail label, and Calendar scope
  before the session; do not use a customer mailbox.
