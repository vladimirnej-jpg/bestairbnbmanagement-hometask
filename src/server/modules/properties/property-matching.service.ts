import type { MasterProperty } from '@prisma/client';

import { normalizeAddress, type NormalizedAddress } from './address-normalizer';

export type PropertyMatchStatus = 'missing' | 'exact' | 'ambiguous' | 'review' | 'none';

export interface PropertyMatchResult {
  readonly status: PropertyMatchStatus;
  readonly masterProperty: MasterProperty | null;
  readonly candidates: readonly MasterProperty[];
  readonly normalized: NormalizedAddress;
  readonly matchType: 'EXACT_ADDRESS' | 'CONTACT_HISTORY' | 'AMBIGUOUS' | null;
}

export class PropertyMatchingService {
  public normalize(rawAddress: string, cityHint?: string | null): NormalizedAddress {
    return normalizeAddress(rawAddress, cityHint);
  }

  public match(
    rawAddress: string | null,
    properties: readonly MasterProperty[],
    cityHint?: string | null,
    contactEmail?: string | null,
  ): PropertyMatchResult {
    const normalized =
      rawAddress === null ? normalizeAddress('') : normalizeAddress(rawAddress, cityHint);
    if (
      rawAddress === null ||
      normalized.normalizedPostcode === null ||
      normalized.normalizedStreet === null ||
      normalized.normalizedHouseNumber === null
    ) {
      return {
        status: 'missing',
        masterProperty: null,
        candidates: [],
        normalized,
        matchType: null,
      };
    }
    const candidates = properties.filter((property) => {
      const master = normalizeAddress(
        `${property.addressLine1}, ${property.city}, ${property.postcode}`,
      );
      return (
        master.normalizedPostcode === normalized.normalizedPostcode &&
        master.normalizedStreet === normalized.normalizedStreet &&
        master.normalizedHouseNumber === normalized.normalizedHouseNumber
      );
    });
    if (candidates.length === 1) {
      const candidate = candidates[0];
      if (candidate === undefined) {
        return {
          status: 'none',
          masterProperty: null,
          candidates: [],
          normalized,
          matchType: null,
        };
      }
      return {
        status: 'exact',
        masterProperty: candidate,
        candidates,
        normalized,
        matchType: 'EXACT_ADDRESS',
      };
    }
    const historyCandidates =
      contactEmail === undefined || contactEmail === null
        ? []
        : properties.filter(
            (property) => property.contactEmail?.toLowerCase() === contactEmail.toLowerCase(),
          );
    if (historyCandidates.length === 1) {
      const candidate = historyCandidates[0];
      if (candidate === undefined) {
        return {
          status: 'none',
          masterProperty: null,
          candidates: [],
          normalized,
          matchType: null,
        };
      }
      return {
        status: 'review',
        masterProperty: null,
        candidates: historyCandidates,
        normalized,
        matchType: 'CONTACT_HISTORY',
      };
    }
    return {
      status: candidates.length > 1 || historyCandidates.length > 1 ? 'ambiguous' : 'none',
      masterProperty: null,
      candidates: candidates.length > 0 ? candidates : historyCandidates,
      normalized,
      matchType: candidates.length > 1 || historyCandidates.length > 1 ? 'AMBIGUOUS' : null,
    };
  }
}
