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
optional draft check. Keep the refresh token out of shell history and logs.

## OpenRouter and geocoder

Set `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and optional fallback models for
structured extraction. The Nominatim adapter uses `NOMINATIM_BASE_URL` and a
bounded timeout; comply with the selected provider's usage policy.

If a provider is unavailable, the corresponding Inngest step reports a
provider warning and can be retried by the durable function. Tests use explicit
fake providers under `src/server/integrations/fake/`; normal runtime
processes never read test fixtures.
