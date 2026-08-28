import type { MasterProperty } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PropertiesService } from './properties.service';
import { PropertyMatchingService } from './property-matching.service';

function masterProperty(): MasterProperty {
  return {
    id: 'property-1',
    source: 'google-sheets',
    externalId: 'external-1',
    addressLine1: '10 Example Street',
    city: 'Amsterdam',
    postcode: '1012 AB',
    normalizedStreet: 'example street',
    normalizedHouseNumber: '10',
    normalizedCity: 'amsterdam',
    normalizedPostcode: '1012AB',
    contactEmail: null,
    sourceUpdatedAt: null,
    lastSyncedAt: new Date(),
    isActive: true,
    isMissing: false,
  };
}

describe('PropertiesService', () => {
  it('preserves a manually confirmed match and skips automatic writes', async () => {
    const property = {
      rawAddress: '10 Example Street, Amsterdam, 1012 AB',
      normalizedPostcode: '1012AB',
      normalizedCity: 'amsterdam',
      canonicalAddress: '10 Example Street, Amsterdam',
      manuallyConfirmedAt: new Date(),
      masterPropertyId: 'property-1',
    };
    const leadsRepository = {
      findById: vi.fn().mockResolvedValue({ property }),
    };
    const repository = {
      findMasterProperties: vi.fn().mockResolvedValue([masterProperty()]),
      replaceCandidates: vi.fn(),
      updateLeadPropertyMatch: vi.fn(),
      findZoneDecision: vi.fn().mockResolvedValue('inside'),
    };
    const enrichment = { enrich: vi.fn() };
    const service = new PropertiesService(
      leadsRepository as never,
      repository as never,
      new PropertyMatchingService(),
      enrichment as never,
    );

    const result = await service.resolve('lead-1', property.rawAddress);

    expect(result).toMatchObject({ zone: 'inside', match: { status: 'exact' } });
    expect(enrichment.enrich).not.toHaveBeenCalled();
    expect(repository.replaceCandidates).not.toHaveBeenCalled();
    expect(repository.updateLeadPropertyMatch).not.toHaveBeenCalled();
  });
});
