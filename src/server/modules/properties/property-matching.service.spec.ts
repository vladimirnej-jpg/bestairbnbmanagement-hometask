import type { MasterProperty } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { PropertyMatchingService } from './property-matching.service';

function master(overrides: Partial<MasterProperty> = {}): MasterProperty {
  return {
    id: 'property-1',
    source: 'google-sheets',
    externalId: 'external-1',
    addressLine1: '10 Example Street',
    city: 'Amsterdam',
    postcode: '1012 AB',
    normalizedStreet: 'example street',
    normalizedHouseNumber: null,
    normalizedCity: 'amsterdam',
    normalizedPostcode: '1012AB',
    contactEmail: null,
    sourceUpdatedAt: null,
    lastSyncedAt: new Date(),
    isActive: true,
    isMissing: false,
    ...overrides,
  };
}

describe('PropertyMatchingService', () => {
  const service = new PropertyMatchingService();

  it('matches an exact normalized address', () => {
    const result = service.match('10 Example Street, Amsterdam, 1012 AB', [master()]);
    expect(result.status).toBe('exact');
    expect(result.masterProperty?.id).toBe('property-1');
  });

  it('does not auto-merge ambiguous candidates', () => {
    const result = service.match('10 Example Street, Amsterdam, 1012 AB', [
      master(),
      master({ id: 'property-2', externalId: 'external-2' }),
    ]);
    expect(result.status).toBe('ambiguous');
    expect(result.masterProperty).toBeNull();
  });

  it('surfaces a single contact-history match for human confirmation', () => {
    const result = service.match(
      '99 Unknown Road, Amsterdam, 1012 AB',
      [master({ contactEmail: 'owner@example.com' })],
      undefined,
      'owner@example.com',
    );
    expect(result.status).toBe('review');
    expect(result.masterProperty).toBeNull();
    expect(result.matchType).toBe('CONTACT_HISTORY');
  });

  it('returns missing when required address components are absent', () => {
    expect(service.match('Amsterdam', [master()]).status).toBe('missing');
    expect(service.match('Example Street, Amsterdam, 1012 AB', [master()]).status).toBe('missing');
  });
});
