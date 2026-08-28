import './load-env';

import type { AppConfig } from '../src/server/runtime/config';
import { validateConfig } from '../src/server/runtime/config';
import { NominatimGeocodingProvider } from '../src/server/integrations/geocoding/nominatim-geocoding.provider';
import { GoogleCalendarProvider } from '../src/server/integrations/google/google-calendar.provider';
import { GoogleGmailProvider } from '../src/server/integrations/google/google-gmail.provider';
import { GoogleSheetsMasterDataProvider } from '../src/server/integrations/google-sheets-master-data.provider';
import { OpenRouterLeadIntelligenceProvider } from '../src/server/integrations/openrouter/openrouter-lead-intelligence.provider';

type SmokeResult = {
  readonly name: string;
  readonly status: 'PASS' | 'FAIL' | 'SKIP';
  readonly detail: string;
};

async function main(): Promise<void> {
  const missing = requiredLiveVariables().filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.log(`SKIP live smoke: missing ${missing.length} explicitly configured credential(s).`);
    return;
  }

  const config = validateConfig({
    ...process.env,
    PROVIDER_MODE: 'live',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://smoke:smoke@localhost:5432/smoke',
    DIRECT_URL:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      'postgresql://smoke:smoke@localhost:5432/smoke',
    JWT_SECRET: process.env.JWT_SECRET ?? 'live-smoke-secret-that-is-long-enough',
  }) as Extract<AppConfig, { PROVIDER_MODE: 'live' }>;
  const results: SmokeResult[] = [];
  const sheets = new GoogleSheetsMasterDataProvider(config);
  const gmail = new GoogleGmailProvider(config);
  const calendar = new GoogleCalendarProvider(config);
  const geocoder = new NominatimGeocodingProvider(config);
  const openRouter = new OpenRouterLeadIntelligenceProvider(config);

  await run(results, 'Google Sheets read', async () => {
    const snapshot = await sheets.fetchSnapshot();
    return `${snapshot.properties.length} properties / ${snapshot.services.length} services`;
  });
  await run(
    results,
    'Gmail read',
    async () => `${(await gmail.listLeadMessages()).length} messages visible`,
  );
  if (process.env.LIVE_SMOKE_ALLOW_DRAFT === 'true') {
    await run(results, 'Gmail draft write', async () => {
      const recipient = process.env.LIVE_SMOKE_RECIPIENT;
      if (recipient === undefined)
        throw new Error('LIVE_SMOKE_RECIPIENT is required for draft smoke');
      const draft = await gmail.createDraft({
        to: recipient,
        subject: '[BestAirbnb smoke] connectivity check',
        html: '<p>This is an automated connectivity smoke check. Delete this draft after review.</p>',
        idempotencyKey: `live-smoke-${new Date().toISOString().slice(0, 10)}`,
      });
      return `draft ${draft.draftId} created`;
    });
  } else {
    results.push({
      name: 'Gmail draft write',
      status: 'SKIP',
      detail: 'set LIVE_SMOKE_ALLOW_DRAFT=true for the explicit write check',
    });
  }
  await run(
    results,
    'Google Calendar read',
    async () => `${(await calendar.listUpcomingEvents()).length} upcoming events visible`,
  );
  await run(results, 'Geocoder read', async () => {
    const result = await geocoder.geocode(
      process.env.LIVE_SMOKE_ADDRESS ?? '10 Example Street, Amsterdam, 1012 AB',
    );
    return result === null ? 'no result' : 'bounded address lookup succeeded';
  });
  await run(results, 'OpenRouter structured output', async () => {
    const result = await openRouter.extractLead({
      conversation: 'Name: Smoke Check\nAddress: 10 Example Street, Amsterdam, 1012 AB',
    });
    return `schema-valid response from ${result.provider}`;
  });
  for (const result of results)
    console.log(`${result.status.padEnd(4)} ${result.name}: ${result.detail}`);
  if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
}

async function run(
  results: SmokeResult[],
  name: string,
  operation: () => Promise<string>,
): Promise<void> {
  try {
    results.push({ name, status: 'PASS', detail: await operation() });
  } catch (error) {
    results.push({
      name,
      status: 'FAIL',
      detail: error instanceof Error ? error.message : 'provider request failed',
    });
  }
}

function requiredLiveVariables(): readonly string[] {
  return [
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64',
    'GOOGLE_GMAIL_CLIENT_ID',
    'GOOGLE_GMAIL_CLIENT_SECRET',
    'GOOGLE_GMAIL_REFRESH_TOKEN',
    'OPENROUTER_API_KEY',
  ];
}

void main();
