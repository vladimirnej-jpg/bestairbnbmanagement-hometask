import type { MasterProperty, PrismaClient, PropertyMatchCandidate } from '@prisma/client';

import { matchesServiceZone } from './service-zone-matching';

export class PropertiesRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public findMasterProperties(postcode: string | null): Promise<MasterProperty[]> {
    return this.prisma.masterProperty.findMany({
      where: {
        isActive: true,
        isMissing: false,
        ...(postcode === null ? {} : { normalizedPostcode: postcode }),
      },
    });
  }

  public findMasterPropertiesByContactEmail(email: string): Promise<MasterProperty[]> {
    return this.prisma.masterProperty.findMany({
      where: { isActive: true, isMissing: false, contactEmail: email.toLowerCase() },
    });
  }

  public async replaceCandidates(
    leadPropertyId: string,
    candidates: readonly {
      masterPropertyId: string;
      confidence: number;
      matchType?: 'EXACT_ADDRESS' | 'CONTACT_HISTORY' | 'AMBIGUOUS';
    }[],
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.propertyMatchCandidate.deleteMany({ where: { leadPropertyId } });
      if (candidates.length > 0) {
        await transaction.propertyMatchCandidate.createMany({
          data: candidates.map((candidate) => ({
            leadPropertyId,
            masterPropertyId: candidate.masterPropertyId,
            matchType:
              candidate.matchType ?? (candidates.length === 1 ? 'EXACT_ADDRESS' : 'AMBIGUOUS'),
            confidence: candidate.confidence,
          })),
        });
      }
    });
  }

  public async findZoneDecision(
    postcode: string | null,
    city: string | null,
  ): Promise<'inside' | 'outside' | 'unknown'> {
    const zones = await this.prisma.serviceZone.findMany({
      where: { isActive: true, isMissing: false },
    });
    if (zones.length === 0) {
      return 'unknown';
    }
    const matchingZone = zones.some((zone) => {
      return matchesServiceZone(zone, postcode, city);
    });
    return matchingZone ? 'inside' : 'outside';
  }

  public async updateLeadPropertyMatch(
    leadPropertyId: string,
    masterPropertyId: string | null,
  ): Promise<void> {
    await this.prisma.leadProperty.update({
      where: { id: leadPropertyId },
      data: { masterPropertyId },
    });
  }

  public async getCandidates(leadPropertyId: string): Promise<PropertyMatchCandidate[]> {
    return this.prisma.propertyMatchCandidate.findMany({ where: { leadPropertyId } });
  }

  public async confirmMatch(leadId: string, masterPropertyId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const property = await transaction.leadProperty.findUnique({
        where: { leadId },
        select: { id: true },
      });
      if (property === null) return false;
      const masterProperty = await transaction.masterProperty.findFirst({
        where: { id: masterPropertyId, isActive: true, isMissing: false },
        select: { id: true },
      });
      if (masterProperty === null) return false;
      const candidate = await transaction.propertyMatchCandidate.findFirst({
        where: { leadPropertyId: property.id, masterPropertyId },
        select: { id: true },
      });
      if (candidate === null) return false;
      await transaction.leadProperty.update({
        where: { id: property.id },
        data: { masterPropertyId, manuallyConfirmedAt: new Date() },
      });
      await transaction.propertyMatchCandidate.updateMany({
        where: { leadPropertyId: property.id, masterPropertyId },
        data: { reviewStatus: 'CONFIRMED' },
      });
      await transaction.propertyMatchCandidate.updateMany({
        where: { leadPropertyId: property.id, masterPropertyId: { not: masterPropertyId } },
        data: { reviewStatus: 'REJECTED' },
      });
      return true;
    });
  }
}
