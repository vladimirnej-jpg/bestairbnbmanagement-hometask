import { describe, expect, it, vi } from 'vitest';

import { ShowcasesRepository } from './showcases.repository';

describe('ShowcasesRepository', () => {
  it('does not return services for a city match with an unmatched postcode', async () => {
    const prisma = {
      serviceZone: {
        findMany: vi.fn().mockResolvedValue([
          {
            normalizedCity: 'amsterdam',
            postcodePrefixes: ['10'],
            zoneServices: [
              { isActive: true, service: { isActive: true, isMissing: false, name: 'Cleaning' } },
            ],
          },
        ]),
      },
    };
    const repository = new ShowcasesRepository(prisma as never);

    await expect(repository.servicesForProperty('20AB', 'amsterdam')).resolves.toEqual([]);
  });
});
