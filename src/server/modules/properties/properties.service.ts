import { ApplicationError } from '../../errors/application-error';

import type { LeadsRepository } from '../leads/leads.repository';
import type { PropertyEnrichmentService } from './property-enrichment.service';
import type { PropertyMatchingService } from './property-matching.service';
import { type PropertyMatchResult } from './property-matching.service';
import type { PropertiesRepository } from './properties.repository';

export interface PropertyResolution {
  readonly match: PropertyMatchResult;
  readonly zone: 'inside' | 'outside' | 'unknown';
}

export class PropertiesService {
  public constructor(
    private readonly leadsRepository: LeadsRepository,
    private readonly repository: PropertiesRepository,
    private readonly matcher: PropertyMatchingService,
    private readonly enrichment: PropertyEnrichmentService,
  ) {}

  public async resolve(
    leadId: string,
    rawAddress: string | null,
    cityHint?: string | null,
    contactEmail?: string | null,
  ): Promise<PropertyResolution> {
    if (rawAddress === null) {
      return { match: this.matcher.match(null, []), zone: 'unknown' };
    }
    const lead = await this.leadsRepository.findById(leadId);
    if (
      lead?.property === null ||
      lead === null ||
      (lead.property.manuallyConfirmedAt === null && lead.property.canonicalAddress === null)
    ) {
      await this.enrichment.enrich(leadId, rawAddress, cityHint);
    }
    const current = await this.leadsRepository.findById(leadId);
    const property = current?.property;
    const manuallyConfirmed =
      property?.manuallyConfirmedAt !== null && property?.manuallyConfirmedAt !== undefined;
    const addressProperties = await this.repository.findMasterProperties(
      property?.normalizedPostcode ?? null,
    );
    const historyProperties =
      contactEmail === undefined || contactEmail === null
        ? []
        : await this.repository.findMasterPropertiesByContactEmail(contactEmail);
    const properties = [
      ...new Map(
        [...addressProperties, ...historyProperties].map((candidate) => [candidate.id, candidate]),
      ).values(),
    ];
    const calculatedMatch = this.matcher.match(
      property?.rawAddress ?? rawAddress,
      properties,
      property?.normalizedCity ?? cityHint,
      contactEmail,
    );
    const matchBase =
      manuallyConfirmed && property?.masterPropertyId !== null
        ? { ...calculatedMatch, status: 'exact' as const, matchType: 'EXACT_ADDRESS' as const }
        : calculatedMatch;
    if (property !== undefined && property !== null && !manuallyConfirmed) {
      await this.repository.replaceCandidates(
        property.id,
        matchBase.candidates.map((candidate) => ({
          masterPropertyId: candidate.id,
          confidence: 1,
          matchType: matchBase.matchType ?? undefined,
        })),
      );
      await this.repository.updateLeadPropertyMatch(
        property.id,
        matchBase.masterProperty?.id ?? null,
      );
    }
    const zone = await this.repository.findZoneDecision(
      matchBase.normalized.normalizedPostcode,
      matchBase.normalized.normalizedCity,
    );
    return { match: matchBase, zone };
  }

  public async confirmMatch(leadId: string, masterPropertyId: string): Promise<void> {
    const lead = await this.leadsRepository.findById(leadId);
    if (lead === null) {
      throw new ApplicationError(404, 'LEAD_NOT_FOUND', 'Lead was not found');
    }
    const confirmed = await this.repository.confirmMatch(leadId, masterPropertyId);
    if (!confirmed) {
      throw new ApplicationError(
        409,
        'PROPERTY_MATCH_NOT_AVAILABLE',
        'The selected property is not an active candidate for this lead',
      );
    }
  }
}
