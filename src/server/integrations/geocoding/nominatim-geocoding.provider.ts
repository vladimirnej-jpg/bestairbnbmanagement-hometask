import type { AppConfig } from '../../runtime/config';
import {
  GeocodingProviderError,
  type GeocodingProvider,
  type GeocodingResult,
} from './geocoding.provider';

const REQUEST_TIMEOUT_MS = 10_000;

export class NominatimGeocodingProvider implements GeocodingProvider {
  public readonly source = 'nominatim';
  private readonly cache = new Map<string, GeocodingResult | null>();

  public constructor(private readonly config: AppConfig) {}

  public async geocode(address: string): Promise<GeocodingResult | null> {
    const cacheKey = address.trim().toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined || this.cache.has(cacheKey)) {
      return cached ?? null;
    }
    const baseUrl = this.config.NOMINATIM_BASE_URL;
    const url = new URL('/search', baseUrl);
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'bestairbnb-take-home/0.1' },
      });
      if (!response.ok) {
        throw new GeocodingProviderError(
          'PROVIDER_UNAVAILABLE',
          `Geocoder returned HTTP ${response.status}`,
        );
      }
      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new GeocodingProviderError(
          'PROVIDER_INVALID_RESPONSE',
          'Geocoder response is not an array',
        );
      }
      const first = data[0] as Record<string, unknown> | undefined;
      if (first === undefined || typeof first.display_name !== 'string') {
        this.cache.set(cacheKey, null);
        return null;
      }
      const latitude = typeof first.lat === 'string' ? Number(first.lat) : undefined;
      const longitude = typeof first.lon === 'string' ? Number(first.lon) : undefined;
      const result = {
        canonicalAddress: first.display_name,
        ...(Number.isFinite(latitude) ? { latitude } : {}),
        ...(Number.isFinite(longitude) ? { longitude } : {}),
        confidence: 0.8,
        source: 'nominatim',
      };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof GeocodingProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GeocodingProviderError('PROVIDER_TIMEOUT', 'Geocoder request timed out', {
          cause: error,
        });
      }
      throw new GeocodingProviderError('PROVIDER_UNAVAILABLE', 'Geocoder request failed', {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
