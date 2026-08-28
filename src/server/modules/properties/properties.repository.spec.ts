import { describe, expect, it, vi } from 'vitest';

import { PropertiesRepository } from './properties.repository';

describe('PropertiesRepository', () => {
  it('requires the postcode prefix when a zone also specifies a city', async () => {
    const prisma = {
      serviceZone: {
        findMany: vi.fn().mockResolvedValue([
          {
            normalizedCity: 'amsterdam',
            postcodePrefixes: ['10'],
          },
        ]),
      },
    };
    const repository = new PropertiesRepository(prisma as never);

    await expect(repository.findZoneDecision('20AB', 'amsterdam')).resolves.toBe('outside');
    await expect(repository.findZoneDecision('10AB', 'amsterdam')).resolves.toBe('inside');
  });
});
