import { type GeocodingProvider } from '../../integrations/geocoding/geocoding.provider';
import type { LeadsRepository } from '../leads/leads.repository';
import type { PropertyMatchingService } from './property-matching.service';

export class PropertyEnrichmentService {
  public constructor(
    private readonly geocoder: GeocodingProvider,
    private readonly leadsRepository: LeadsRepository,
    private readonly matcher: PropertyMatchingService,
  ) {}

  public async enrich(leadId: string, rawAddress: string, cityHint?: string | null): Promise<void> {
    const normalized = this.matcher.normalize(rawAddress, cityHint);
    try {
      const geocoded = await this.geocoder.geocode(rawAddress);
      await this.leadsRepository.updateProperty(leadId, {
        rawAddress,
        ...normalized,
        enrichmentStatus: geocoded === null ? 'NOT_FOUND' : 'SUCCEEDED',
        enrichmentSource: geocoded?.source ?? this.geocoder.source,
        enrichmentErrorCode: null,
        enrichedAt: new Date(),
        ...(geocoded === null
          ? {}
          : {
              canonicalAddress: geocoded.canonicalAddress,
              latitude: geocoded.latitude ?? null,
              longitude: geocoded.longitude ?? null,
              confidence: geocoded.confidence,
            }),
      });
    } catch (error) {
      await this.leadsRepository.updateProperty(leadId, {
        rawAddress,
        ...normalized,
        enrichmentStatus: 'FAILED',
        enrichmentSource: this.geocoder.source,
        enrichmentErrorCode: this.errorCode(error),
        enrichedAt: new Date(),
      });
      throw error;
    }
  }

  private errorCode(error: unknown): string {
    return error instanceof Error ? error.name : 'ENRICHMENT_FAILED';
  }
}
