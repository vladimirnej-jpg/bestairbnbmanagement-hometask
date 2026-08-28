import { describe, expect, it } from 'vitest';

import { getSafeReturnPath } from './return-path';

describe('getSafeReturnPath', () => {
  it.each(['/ops', '/ops/leads/lead-1?tab=history', '/'])('accepts internal path %s', (path) => {
    expect(getSafeReturnPath(path)).toBe(path);
  });

  it.each([
    null,
    '',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
  ])('rejects unsafe return path %s', (path) => {
    expect(getSafeReturnPath(path)).toBeNull();
  });
});
