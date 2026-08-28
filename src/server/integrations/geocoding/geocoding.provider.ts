export interface GeocodingResult {
  readonly canonicalAddress: string;
  readonly city?: string;
  readonly postcode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly confidence: number;
  readonly source: string;
}

export interface GeocodingProvider {
  readonly source: string;
  geocode(address: string): Promise<GeocodingResult | null>;
}

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');

export class GeocodingProviderError extends Error {
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
    this.name = 'GeocodingProviderError';
  }
}
