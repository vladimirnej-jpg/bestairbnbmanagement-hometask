export interface MasterPropertyRecord {
  readonly externalId: string;
  readonly addressLine1: string;
  readonly city: string;
  readonly postcode: string;
  readonly contactEmail?: string;
  readonly sourceUpdatedAt?: string;
  readonly isActive?: boolean;
}

export interface ServiceZoneRecord {
  readonly externalId: string;
  readonly name: string;
  readonly city?: string;
  readonly postcodePrefixes: readonly string[];
  readonly isActive?: boolean;
}

export interface ServiceRecord {
  readonly externalId: string;
  readonly name: string;
  readonly description?: string;
  readonly isActive?: boolean;
}

export interface ZoneServiceRecord {
  readonly serviceZoneExternalId: string;
  readonly serviceExternalId: string;
  readonly isActive?: boolean;
}

export interface MasterDataSnapshot {
  readonly properties: readonly MasterPropertyRecord[];
  readonly serviceZones: readonly ServiceZoneRecord[];
  readonly services: readonly ServiceRecord[];
  readonly zoneServices: readonly ZoneServiceRecord[];
}

export interface MasterDataProvider {
  fetchSnapshot(): Promise<MasterDataSnapshot>;
}

export const MASTER_DATA_PROVIDER = Symbol('MASTER_DATA_PROVIDER');

export class MasterDataProviderError extends Error {
  public constructor(
    public readonly code:
      | 'PROVIDER_CONFIGURATION'
      | 'PROVIDER_UNAVAILABLE'
      | 'PROVIDER_TIMEOUT'
      | 'PROVIDER_INVALID_RESPONSE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MasterDataProviderError';
  }
}
