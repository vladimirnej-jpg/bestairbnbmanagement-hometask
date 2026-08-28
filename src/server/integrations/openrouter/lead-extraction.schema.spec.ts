import { describe, expect, it } from 'vitest';

import { leadExtractionSchema } from './lead-extraction.schema';

const propertyAddress = {
  country: null,
  city: null,
  street: null,
  houseNumber: null,
  unit: null,
  postcode: null,
};

describe('leadExtractionSchema', () => {
  it('rejects contact names longer than 120 characters', () => {
    const result = leadExtractionSchema.safeParse({
      contactName: 'a'.repeat(121),
      propertyAddress,
    });

    expect(result.success).toBe(false);
  });
});
