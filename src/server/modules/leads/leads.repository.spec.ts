import { describe, expect, it, vi } from 'vitest';

import { LeadsRepository } from './leads.repository';

describe('LeadsRepository', () => {
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
    const repository = new LeadsRepository(prisma as never);

    await expect(repository.findServiceContext('20AB', 'amsterdam')).resolves.toEqual({
      zone: 'outside',
      services: [],
    });
  });

  it('persists structured extracted address components for matching', async () => {
    const createProperty = vi.fn();
    const transaction = {
      lead: {
        findUnique: vi.fn().mockResolvedValue({ property: null }),
        update: vi.fn(),
      },
      leadProperty: { create: createProperty, update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof transaction) => Promise<void>) =>
        callback(transaction),
      ),
    };
    const repository = new LeadsRepository(prisma as never);

    await repository.updateExtraction('lead-1', {
      propertyAddress: {
        country: 'Netherlands',
        city: 'Amsterdam',
        street: 'Prinsengracht',
        houseNumber: '263',
        unit: 'A',
        postcode: '1016 GV',
      },
    });

    expect(createProperty).toHaveBeenCalledWith({
      data: {
        leadId: 'lead-1',
        rawAddress: 'Prinsengracht 263, A, Amsterdam, 1016 GV, Netherlands',
        country: 'Netherlands',
        unit: 'A',
        normalizedStreet: 'prinsengracht',
        normalizedHouseNumber: '263',
        normalizedCity: 'amsterdam',
        normalizedPostcode: '1016GV',
      },
    });
  });
});
