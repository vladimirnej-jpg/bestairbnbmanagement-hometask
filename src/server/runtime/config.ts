import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const databaseUrl = z.string().url();

const commonRuntimeConfig = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  GOOGLE_GMAIL_USER_ID: nonEmptyString.default('me'),
  GOOGLE_GMAIL_QUERY: z.string().max(500).optional(),
  GOOGLE_GMAIL_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(50),
  GOOGLE_CALENDAR_ID: nonEmptyString.default('primary'),
  GOOGLE_CALENDAR_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(25),
  LEAD_INTELLIGENCE_PROVIDER: z.enum(['openrouter', 'groq']).optional(),
  OPENROUTER_MODEL: nonEmptyString.default('google/gemini-2.0-flash-exp:free'),
  OPENROUTER_FALLBACK_MODELS: z.string().optional(),
  GROQ_MODEL: nonEmptyString.optional(),
  NOMINATIM_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
});

const fakeRuntimeConfig = commonRuntimeConfig.extend({
  PROVIDER_MODE: z.literal('fake'),
  GOOGLE_SHEETS_SPREADSHEET_ID: nonEmptyString.optional(),
  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64: nonEmptyString.optional(),
  GOOGLE_GMAIL_CLIENT_ID: nonEmptyString.optional(),
  GOOGLE_GMAIL_CLIENT_SECRET: nonEmptyString.optional(),
  GOOGLE_GMAIL_REFRESH_TOKEN: nonEmptyString.optional(),
  OPENROUTER_API_KEY: nonEmptyString.optional(),
  GROQ_API_KEY: nonEmptyString.optional(),
});

const liveRuntimeConfig = commonRuntimeConfig.extend({
  PROVIDER_MODE: z.literal('live'),
  GOOGLE_SHEETS_SPREADSHEET_ID: nonEmptyString,
  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64: nonEmptyString,
  GOOGLE_GMAIL_CLIENT_ID: nonEmptyString,
  GOOGLE_GMAIL_CLIENT_SECRET: nonEmptyString,
  GOOGLE_GMAIL_REFRESH_TOKEN: nonEmptyString,
  OPENROUTER_API_KEY: nonEmptyString.optional(),
  GROQ_API_KEY: nonEmptyString.optional(),
});

const runtimeConfigSchema = z.discriminatedUnion('PROVIDER_MODE', [
  fakeRuntimeConfig,
  liveRuntimeConfig,
]);

export type AppConfig = z.infer<typeof runtimeConfigSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const parsed = runtimeConfigSchema.parse({
    ...config,
    PROVIDER_MODE: config.PROVIDER_MODE ?? 'fake',
  });
  if (parsed.PROVIDER_MODE === 'live') {
    const requiredKey =
      parsed.LEAD_INTELLIGENCE_PROVIDER === 'groq'
        ? parsed.GROQ_API_KEY
        : parsed.OPENROUTER_API_KEY;
    if (requiredKey === undefined) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: [
            parsed.LEAD_INTELLIGENCE_PROVIDER === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY',
          ],
          message: `A key is required for ${parsed.LEAD_INTELLIGENCE_PROVIDER}`,
        },
      ]);
    }
  }
  return parsed;
}

let cachedConfig: AppConfig | undefined;

export function getRuntimeConfig(): AppConfig {
  cachedConfig ??= validateConfig(process.env);
  return cachedConfig;
}

export function resetRuntimeConfigForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Runtime config reset is test-only');
  }
  cachedConfig = undefined;
}
