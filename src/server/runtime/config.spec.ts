import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';

import { validateConfig } from './config';

const baseConfig = {
  DATABASE_URL: 'postgresql://bestairbnb:bestairbnb@localhost:5432/bestairbnb?schema=public',
  DIRECT_URL: 'postgresql://bestairbnb:bestairbnb@localhost:5432/bestairbnb?schema=public',
  JWT_SECRET: 'test-secret-that-is-long-enough-for-runtime-validation',
};

describe('runtime config', () => {
  it('defaults to fake provider mode without live credentials', () => {
    expect(validateConfig(baseConfig)).toEqual(
      expect.objectContaining({ PROVIDER_MODE: 'fake', PORT: 3000 }),
    );
  });

  it('requires live provider credentials only in live mode', () => {
    expect(() => validateConfig({ ...baseConfig, PROVIDER_MODE: 'live' })).toThrow(ZodError);
    expect(
      validateConfig({
        ...baseConfig,
        PROVIDER_MODE: 'live',
        GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-id',
        GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64: 'dGVzdA==',
        GOOGLE_GMAIL_CLIENT_ID: 'client-id',
        GOOGLE_GMAIL_CLIENT_SECRET: 'client-secret',
        GOOGLE_GMAIL_REFRESH_TOKEN: 'refresh-token',
        OPENROUTER_API_KEY: 'openrouter-key',
      }),
    ).toEqual(expect.objectContaining({ PROVIDER_MODE: 'live' }));
  });

  it('rejects credentials with an invalid database URL', () => {
    expect(() => validateConfig({ ...baseConfig, DATABASE_URL: 'not-a-url' })).toThrow(ZodError);
  });
});
