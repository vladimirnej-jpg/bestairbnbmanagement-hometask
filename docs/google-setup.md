# Google provider setup

Google Workspace is the runtime source of truth. Use a dedicated Google Cloud
project and a non-production account while developing or preparing a demo.

## Sheets

Create one spreadsheet with these tabs and headers:

- `Properties`: `externalId`, `addressLine1`, `city`, `postcode`,
  `contactEmail`, `sourceUpdatedAt`, `isActive`
- `ServiceZones`: `externalId`, `name`, `city`, `postcodePrefixes`, `isActive`
- `Services`: `externalId`, `name`, `description`, `isActive`
- `ZoneServices`: `serviceZoneExternalId`, `serviceExternalId`, `isActive`

Create a service account with read-only Sheets access, share the spreadsheet
with its email, base64-encode the JSON key, and set
`GOOGLE_SHEETS_SPREADSHEET_ID` and
`GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64`. The application reads all four
tabs and validates cross-references before writing a projection.

## Gmail and Calendar

Enable Gmail API and Google Calendar API. Create an OAuth client, complete the
consent flow for a dedicated mailbox, and provide the refresh token plus client
ID/secret through environment variables. The Gmail query and Calendar ID are
configurable. Gmail draft writes are only exercised by the explicit live smoke
flag.

Minimum scopes are read access for inbox/calendar and draft access for the
optional draft check. The `gmail:inject` CLI additionally requires
`https://www.googleapis.com/auth/gmail.insert` or
`https://www.googleapis.com/auth/gmail.modify`. Keep the refresh token out of
shell history and logs.

The CLI imports RFC822 messages into the dedicated QA mailbox with
`users.messages.import`; it does not send them to external recipients. Use
only a non-production mailbox because the imported messages remain real Gmail
data until they are removed.

## LLM provider and geocoder

For OpenRouter, set `LEAD_INTELLIGENCE_PROVIDER=openrouter`,
`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and optional fallback models. For
Groq, set `LEAD_INTELLIGENCE_PROVIDER=groq`, `GROQ_API_KEY`, and
`GROQ_MODEL` (for example `openai/gpt-oss-20b`). The Nominatim adapter uses
`NOMINATIM_BASE_URL` and a bounded timeout; comply with the selected provider's
usage policy.

If a provider is unavailable, the corresponding Inngest step reports a
provider warning and can be retried by the durable function. Tests use explicit
fake providers under `src/server/integrations/fake/`; normal runtime
processes never read test fixtures.
