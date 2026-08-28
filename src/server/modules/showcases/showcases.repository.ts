import type { PrismaClient, Showcase, ShowcaseStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { matchesServiceZone } from '../properties/service-zone-matching';
import type { ShowcaseContentInput } from './showcase-content.schema';

export interface DraftSyncPreparation {
  readonly intentKey: string;
  readonly draftId: string | null;
}

export class ShowcasesRepository {
  public constructor(private readonly prisma: PrismaClient) {}
  public findLead(leadId: string) {
    return this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { property: { include: { masterProperty: true } }, showcase: true },
    });
  }
  public latestSuccessfulProjection() {
    return this.prisma.masterDataSyncRun.findFirst({
      where: { status: 'SUCCEEDED' },
      orderBy: { finishedAt: 'desc' },
    });
  }
  public async servicesForProperty(
    postcode: string | null,
    city: string | null,
  ): Promise<string[]> {
    if (postcode === null && city === null) return [];
    const zones = await this.prisma.serviceZone.findMany({
      where: { isActive: true, isMissing: false },
      include: { zoneServices: { where: { isActive: true }, include: { service: true } } },
    });
    const names = new Set<string>();
    for (const zone of zones) {
      const isMatch = matchesServiceZone(zone, postcode, city);
      if (isMatch)
        for (const assignment of zone.zoneServices)
          if (assignment.service.isActive && !assignment.service.isMissing)
            names.add(assignment.service.name);
    }
    return [...names];
  }
  public upsertContent(
    leadId: string,
    status: ShowcaseStatus,
    content: ShowcaseContentInput,
    html: string,
    manuallyEdited: boolean,
  ): Promise<Showcase> {
    return this.prisma.showcase.upsert({
      where: { leadId },
      create: {
        leadId,
        status,
        structuredContent: content,
        renderedHtml: html,
        draftSyncIntentKey: null,
        draftSyncIntentAt: null,
        manuallyEditedAt: manuallyEdited ? new Date() : null,
      },
      update: {
        status,
        blockingReason: null,
        structuredContent: content,
        renderedHtml: html,
        draftSyncIntentKey: null,
        draftSyncIntentAt: null,
        manuallyEditedAt: manuallyEdited ? new Date() : null,
      },
    });
  }
  public setStatus(
    leadId: string,
    status: ShowcaseStatus,
    blockingReason: string | null,
  ): Promise<Showcase> {
    return this.prisma.showcase.upsert({
      where: { leadId },
      create: { leadId, status, blockingReason },
      update: { status, blockingReason },
    });
  }
  public async prepareDraftSync(leadId: string): Promise<DraftSyncPreparation> {
    const existing = await this.prisma.showcase.findUnique({
      where: { leadId },
      select: { draftSyncIntentKey: true, gmailDraftId: true },
    });
    if (existing === null) {
      throw new Error('Showcase was not found while preparing Gmail draft synchronization');
    }
    if (existing.draftSyncIntentKey !== null) {
      await this.prisma.showcase.update({
        where: { leadId },
        data: { status: 'READY', blockingReason: null, draftSyncIntentAt: new Date() },
      });
      return { intentKey: existing.draftSyncIntentKey, draftId: existing.gmailDraftId };
    }
    const intentKey = randomUUID();
    const claimed = await this.prisma.showcase.updateMany({
      where: { leadId, draftSyncIntentKey: null },
      data: {
        status: 'READY',
        blockingReason: null,
        draftSyncIntentKey: intentKey,
        draftSyncIntentAt: new Date(),
      },
    });
    if (claimed.count === 1) {
      return { intentKey, draftId: existing.gmailDraftId };
    }
    const concurrent = await this.prisma.showcase.findUnique({
      where: { leadId },
      select: { draftSyncIntentKey: true, gmailDraftId: true },
    });
    if (concurrent?.draftSyncIntentKey !== null && concurrent?.draftSyncIntentKey !== undefined) {
      return { intentKey: concurrent.draftSyncIntentKey, draftId: concurrent.gmailDraftId };
    }
    if (concurrent?.gmailDraftId !== null && concurrent?.gmailDraftId !== undefined) {
      const recoveredKey = randomUUID();
      await this.prisma.showcase.update({
        where: { leadId },
        data: {
          status: 'READY',
          blockingReason: null,
          draftSyncIntentKey: recoveredKey,
          draftSyncIntentAt: new Date(),
        },
      });
      return { intentKey: recoveredKey, draftId: concurrent.gmailDraftId };
    }
    throw new Error('Showcase draft synchronization intent could not be claimed');
  }
  public setDraftResult(leadId: string, draftId: string): Promise<Showcase> {
    return this.prisma.showcase.update({
      where: { leadId },
      data: {
        status: 'DRAFT_CREATED',
        gmailDraftId: draftId,
        blockingReason: null,
        draftSyncIntentKey: null,
        draftSyncIntentAt: null,
      },
    });
  }
  public setDraftFailed(leadId: string, reason: string): Promise<Showcase> {
    return this.prisma.showcase.update({
      where: { leadId },
      data: { status: 'FAILED', blockingReason: reason.slice(0, 500) },
    });
  }
  public editContent(
    leadId: string,
    content: ShowcaseContentInput,
    html: string,
  ): Promise<Showcase> {
    return this.upsertContent(leadId, 'READY', content, html, true);
  }
}
