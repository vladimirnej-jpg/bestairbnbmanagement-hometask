import type { Prisma } from '@prisma/client';
import {
  type PrismaClient,
  type Lead,
  type LeadMessage,
  type LifecycleEvent,
  type MasterProperty,
  type ProcessingRun,
  type PropertyMatchCandidate,
  type Showcase,
  type EnrichmentStatus,
  type LifecycleStatus,
  type QualificationStatus,
  type ShowcaseStatus,
} from '@prisma/client';

import type { GmailMessage } from '../../integrations/google/gmail.provider';
import {
  formatAddressComponents,
  type PropertyAddressComponents,
} from '../../shared/address-components';
import { normalizeStructuredAddress } from '../properties/address-normalizer';
import { matchesServiceZone } from '../properties/service-zone-matching';

export interface LeadWithContext extends Lead {
  readonly messages: LeadMessage[];
  readonly showcase: Showcase | null;
  readonly processingRuns: ProcessingRun[];
  readonly lifecycleEvents: LifecycleEvent[];
  readonly property: {
    readonly id: string;
    readonly leadId: string;
    readonly rawAddress: string;
    readonly country: string | null;
    readonly unit: string | null;
    readonly normalizedStreet: string | null;
    readonly normalizedHouseNumber: string | null;
    readonly normalizedCity: string | null;
    readonly normalizedPostcode: string | null;
    readonly canonicalAddress: string | null;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly confidence: number | null;
    readonly enrichmentStatus: EnrichmentStatus;
    readonly enrichmentSource: string | null;
    readonly enrichmentErrorCode: string | null;
    readonly enrichedAt: Date | null;
    readonly masterPropertyId: string | null;
    readonly manuallyConfirmedAt: Date | null;
    readonly masterProperty: {
      readonly id: string;
      readonly addressLine1: string;
      readonly city: string;
      readonly postcode: string;
      readonly normalizedStreet: string | null;
      readonly normalizedHouseNumber: string | null;
      readonly normalizedCity: string | null;
      readonly normalizedPostcode: string | null;
      readonly isActive: boolean;
      readonly isMissing: boolean;
    } | null;
    readonly matchCandidates: (PropertyMatchCandidate & {
      readonly masterProperty: MasterProperty;
    })[];
  } | null;
}

export interface LeadListFilters {
  readonly page: number;
  readonly pageSize: number;
  readonly lifecycleStatus?: LifecycleStatus;
  readonly qualificationStatus?: QualificationStatus;
  readonly showcaseStatus?: ShowcaseStatus;
  readonly search?: string;
}

export interface LeadListItem {
  readonly id: string;
  readonly contactEmail: string | null;
  readonly contactName: string | null;
  readonly lifecycleStatus: LifecycleStatus;
  readonly qualificationStatus: QualificationStatus;
  readonly qualificationReason: string | null;
  readonly showcaseStatus: string | null;
  readonly processingStatus: string | null;
  readonly updatedAt: Date;
}

export interface LeadServiceContext {
  readonly zone: 'inside' | 'outside' | 'unknown';
  readonly services: readonly string[];
}

export interface LeadExtractionUpdate {
  readonly contactEmail?: string | null;
  readonly contactName?: string | null;
  readonly propertyAddress?: PropertyAddressComponents | null;
}

export class LeadsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public findByThreadId(threadId: string): Promise<LeadWithContext | null> {
    return this.prisma.lead.findUnique({
      where: { gmailThreadId: threadId },
      include: {
        messages: { orderBy: { receivedAt: 'asc' } },
        property: {
          include: { masterProperty: true, matchCandidates: { include: { masterProperty: true } } },
        },
        showcase: true,
        processingRuns: true,
        lifecycleEvents: true,
      },
    }) as Promise<LeadWithContext | null>;
  }

  public findMessageByGmailId(messageId: string): Promise<LeadMessage | null> {
    return this.prisma.leadMessage.findUnique({ where: { gmailMessageId: messageId } });
  }

  public findById(leadId: string): Promise<LeadWithContext | null> {
    return this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        messages: { orderBy: { receivedAt: 'asc' } },
        property: {
          include: { masterProperty: true, matchCandidates: { include: { masterProperty: true } } },
        },
        showcase: true,
        processingRuns: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            leadId: true,
            step: true,
            status: true,
            attempt: true,
            errorCode: true,
            provider: true,
            model: true,
            tokenUsage: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
          },
        },
        lifecycleEvents: {
          orderBy: { timestamp: 'desc' },
          include: { actor: { select: { id: true, email: true, role: true } } },
        },
      },
    }) as Promise<LeadWithContext | null>;
  }

  public async list(filters: LeadListFilters): Promise<{
    readonly items: LeadListItem[];
    readonly total: number;
  }> {
    const where: Prisma.LeadWhereInput = {
      ...(filters.lifecycleStatus === undefined
        ? {}
        : { lifecycleStatus: filters.lifecycleStatus }),
      ...(filters.qualificationStatus === undefined
        ? {}
        : { qualificationStatus: filters.qualificationStatus }),
      ...(filters.showcaseStatus === undefined
        ? {}
        : { showcase: { is: { status: filters.showcaseStatus } } }),
      ...(filters.search === undefined || filters.search.length === 0
        ? {}
        : {
            OR: [
              { contactEmail: { contains: filters.search, mode: 'insensitive' } },
              { contactName: { contains: filters.search, mode: 'insensitive' } },
              { gmailThreadId: { contains: filters.search, mode: 'insensitive' } },
              { property: { rawAddress: { contains: filters.search, mode: 'insensitive' } } },
            ],
          }),
    };
    const [leads, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: { showcase: true, processingRuns: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return {
      items: leads.map((lead) => ({
        id: lead.id,
        contactEmail: lead.contactEmail,
        contactName: lead.contactName,
        lifecycleStatus: lead.lifecycleStatus,
        qualificationStatus: lead.qualificationStatus,
        qualificationReason: lead.qualificationReason,
        showcaseStatus: lead.showcase?.status ?? null,
        processingStatus: lead.processingRuns[0]?.status ?? null,
        updatedAt: lead.updatedAt,
      })),
      total,
    };
  }

  public async findServiceContext(
    postcode: string | null,
    city: string | null,
  ): Promise<LeadServiceContext> {
    if (postcode === null && city === null) return { zone: 'unknown', services: [] };
    const zones = await this.prisma.serviceZone.findMany({
      where: { isActive: true, isMissing: false },
      include: { zoneServices: { where: { isActive: true }, include: { service: true } } },
    });
    const matchingZones = zones.filter((zone) => matchesServiceZone(zone, postcode, city));
    const services = [
      ...new Set(
        matchingZones.flatMap((zone) =>
          zone.zoneServices
            .filter((assignment) => assignment.service.isActive && !assignment.service.isMissing)
            .map((assignment) => assignment.service.name),
        ),
      ),
    ];
    return {
      zone: zones.length === 0 ? 'unknown' : matchingZones.length === 0 ? 'outside' : 'inside',
      services,
    };
  }

  public async updateLifecycle(
    leadId: string,
    status: LifecycleStatus,
    reason: string | null,
    actorId: string,
  ): Promise<LeadWithContext | null> {
    await this.prisma.$transaction(async (transaction) => {
      const lead = await transaction.lead.findUnique({
        where: { id: leadId },
        select: { lifecycleStatus: true },
      });
      if (lead === null) return;
      await transaction.lead.update({ where: { id: leadId }, data: { lifecycleStatus: status } });
      if (lead.lifecycleStatus !== status) {
        await transaction.lifecycleEvent.create({
          data: {
            leadId,
            fromStatus: lead.lifecycleStatus,
            toStatus: status,
            actorType: 'USER',
            actorId,
            reason,
          },
        });
      }
    });
    return this.findById(leadId);
  }

  public async createLeadWithMessage(message: GmailMessage): Promise<Lead> {
    return this.prisma.lead.create({
      data: {
        gmailThreadId: message.threadId,
        contactEmail: this.extractEmail(message.from),
        messages: {
          create: this.messageData(message),
        },
      },
    });
  }

  public async appendMessage(leadId: string, message: GmailMessage): Promise<LeadMessage> {
    return this.prisma.leadMessage.create({
      data: { leadId, ...this.messageData(message) },
    });
  }

  public async updateExtraction(leadId: string, update: LeadExtractionUpdate): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const lead = await transaction.lead.findUnique({
        where: { id: leadId },
        include: { property: true },
      });
      if (lead === null) {
        return;
      }
      await transaction.lead.update({
        where: { id: leadId },
        data: {
          ...(update.contactEmail === undefined ? {} : { contactEmail: update.contactEmail }),
          ...(update.contactName === undefined ? {} : { contactName: update.contactName }),
        },
      });
      if (
        update.propertyAddress === undefined ||
        update.propertyAddress === null ||
        (lead.property?.manuallyConfirmedAt !== null &&
          lead.property?.manuallyConfirmedAt !== undefined)
      ) {
        return;
      }
      const rawAddress = formatAddressComponents(update.propertyAddress);
      if (rawAddress === null) return;
      const normalized = normalizeStructuredAddress(update.propertyAddress);
      const propertyData = {
        rawAddress,
        country: update.propertyAddress.country,
        unit: update.propertyAddress.unit,
        normalizedStreet: normalized.normalizedStreet,
        normalizedHouseNumber: normalized.normalizedHouseNumber,
        normalizedCity: normalized.normalizedCity,
        normalizedPostcode: normalized.normalizedPostcode,
      };
      if (lead.property === null) {
        await transaction.leadProperty.create({ data: { leadId, ...propertyData } });
      } else {
        const addressChanged =
          lead.property.rawAddress !== rawAddress ||
          lead.property.normalizedStreet !== normalized.normalizedStreet ||
          lead.property.normalizedHouseNumber !== normalized.normalizedHouseNumber ||
          lead.property.normalizedCity !== normalized.normalizedCity ||
          lead.property.normalizedPostcode !== normalized.normalizedPostcode ||
          lead.property.country !== update.propertyAddress.country ||
          lead.property.unit !== update.propertyAddress.unit;
        await transaction.leadProperty.update({
          where: { leadId },
          data: {
            ...propertyData,
            ...(addressChanged
              ? {
                  canonicalAddress: null,
                  latitude: null,
                  longitude: null,
                  confidence: null,
                  masterPropertyId: null,
                }
              : {}),
          },
        });
      }
    });
  }

  public async updateProperty(
    leadId: string,
    data: {
      readonly rawAddress: string;
      readonly normalizedStreet?: string | null;
      readonly normalizedHouseNumber?: string | null;
      readonly normalizedCity?: string | null;
      readonly normalizedPostcode?: string | null;
      readonly canonicalAddress?: string | null;
      readonly latitude?: number | null;
      readonly longitude?: number | null;
      readonly confidence?: number | null;
      readonly enrichmentStatus?: EnrichmentStatus;
      readonly enrichmentSource?: string | null;
      readonly enrichmentErrorCode?: string | null;
      readonly enrichedAt?: Date | null;
      readonly masterPropertyId?: string | null;
    },
  ): Promise<void> {
    await this.prisma.leadProperty.upsert({
      where: { leadId },
      create: { leadId, ...data },
      update: data,
    });
  }

  public async updateQualification(
    leadId: string,
    qualificationStatus: QualificationStatus,
    qualificationReason: string,
    lifecycleStatus: LifecycleStatus,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const lead = await transaction.lead.findUnique({
        where: { id: leadId },
        select: { lifecycleStatus: true },
      });
      if (lead === null) {
        return;
      }
      await transaction.lead.update({
        where: { id: leadId },
        data: { qualificationStatus, qualificationReason, lifecycleStatus },
      });
      if (lead.lifecycleStatus !== lifecycleStatus) {
        await transaction.lifecycleEvent.create({
          data: {
            leadId,
            fromStatus: lead.lifecycleStatus,
            toStatus: lifecycleStatus,
            actorType: 'SYSTEM',
            reason: qualificationReason,
          },
        });
      }
    });
  }

  private messageData(message: GmailMessage): Prisma.LeadMessageCreateWithoutLeadInput {
    return {
      gmailMessageId: message.messageId,
      sender: message.from,
      subject: message.subject,
      body: message.body,
      receivedAt: message.receivedAt,
    };
  }

  private extractEmail(value: string): string | null {
    const match = value.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    return match?.[0]?.toLowerCase() ?? null;
  }
}
