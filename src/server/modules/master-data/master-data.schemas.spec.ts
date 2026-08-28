import { describe, expect, it } from 'vitest';

import { validatedMasterDataSnapshotSchema } from './master-data.schemas';

const validSnapshot = {
  properties: [
    {
      externalId: 'property-1',
      addressLine1: '10 Example Street',
      city: 'Amsterdam',
      postcode: '1012 AB',
    },
  ],
  serviceZones: [
    {
      externalId: 'zone-1',
      name: 'Amsterdam',
      postcodePrefixes: ['10'],
    },
  ],
  services: [{ externalId: 'service-1', name: 'Cleaning' }],
  zoneServices: [{ serviceZoneExternalId: 'zone-1', serviceExternalId: 'service-1' }],
};

describe('validatedMasterDataSnapshotSchema', () => {
  it('applies safe defaults to a valid complete snapshot', () => {
    const result = validatedMasterDataSnapshotSchema.parse(validSnapshot);

    expect(result.properties[0]?.isActive).toBe(true);
    expect(result.zoneServices[0]?.isActive).toBe(true);
  });

  it('rejects duplicate records before persistence', () => {
    const result = validatedMasterDataSnapshotSchema.safeParse({
      ...validSnapshot,
      services: [...validSnapshot.services, { externalId: 'service-1', name: 'Duplicate' }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('Duplicate external id')),
      ).toBe(true);
    }
  });

  it('rejects assignments that reference absent tabs', () => {
    const result = validatedMasterDataSnapshotSchema.safeParse({
      ...validSnapshot,
      zoneServices: [{ serviceZoneExternalId: 'unknown-zone', serviceExternalId: 'service-1' }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('Unknown service zone')),
      ).toBe(true);
    }
  });
});
