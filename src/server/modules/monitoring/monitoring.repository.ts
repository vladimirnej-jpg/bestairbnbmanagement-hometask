import type {
  LifecycleStatus,
  PrismaClient,
  QualificationStatus,
  ShowcaseStatus,
} from '@prisma/client';

export interface MonitoringSnapshot {
  readonly totalLeads: number;
  readonly lifecycleCounts: Readonly<Record<LifecycleStatus, number>>;
  readonly qualificationCounts: Readonly<Record<QualificationStatus, number>>;
  readonly showcaseCounts: Readonly<Record<ShowcaseStatus, number>>;
  readonly failedProcessingCount: number;
  readonly recentLeads: readonly {
    readonly id: string;
    readonly contactEmail: string | null;
    readonly contactName: string | null;
    readonly lifecycleStatus: LifecycleStatus;
    readonly qualificationStatus: QualificationStatus;
    readonly showcaseStatus: ShowcaseStatus | null;
    readonly updatedAt: Date;
  }[];
  readonly failedProcessing: readonly {
    readonly leadId: string;
    readonly step: string;
    readonly errorCode: string | null;
    readonly createdAt: Date;
  }[];
  readonly recentActivity: readonly {
    readonly leadId: string;
    readonly fromStatus: LifecycleStatus | null;
    readonly toStatus: LifecycleStatus;
    readonly actorType: string;
    readonly reason: string | null;
    readonly timestamp: Date;
  }[];
  readonly masterData: {
    readonly latestRun: {
      readonly id: string;
      readonly status: string;
      readonly trigger: string;
      readonly startedAt: Date;
      readonly finishedAt: Date | null;
      readonly errorCode: string | null;
    } | null;
    readonly lastSuccessfulAt: Date | null;
  };
  readonly gmail: {
    readonly messageCount: number;
    readonly lastMessageAt: Date | null;
  };
}

const lifecycleStatuses: readonly LifecycleStatus[] = [
  'INCOMING',
  'SCHEDULED_INITIAL_APPOINTMENT',
  'WARM',
  'GONE_COLD',
];
const qualificationStatuses: readonly QualificationStatus[] = [
  'NEEDS_INFO',
  'NEEDS_REVIEW',
  'QUALIFIED',
  'OUT_OF_ZONE',
];
const showcaseStatuses: readonly ShowcaseStatus[] = [
  'NOT_READY',
  'READY',
  'BLOCKED',
  'DRAFT_CREATED',
  'FAILED',
];

function emptyCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

export class MonitoringRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getSnapshot(): Promise<MonitoringSnapshot> {
    const [
      leads,
      lifecycleGroups,
      qualificationGroups,
      showcaseGroups,
      failedProcessingCount,
      failedProcessing,
      activity,
      latestMasterRun,
      successfulMasterRun,
      messageCount,
      latestMessage,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          contactEmail: true,
          contactName: true,
          lifecycleStatus: true,
          qualificationStatus: true,
          updatedAt: true,
          showcase: { select: { status: true } },
        },
      }),
      this.prisma.lead.groupBy({ by: ['lifecycleStatus'], _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['qualificationStatus'], _count: { _all: true } }),
      this.prisma.showcase.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.processingRun.count({ where: { status: 'FAILED' } }),
      this.prisma.processingRun.findMany({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { leadId: true, step: true, errorCode: true, createdAt: true },
      }),
      this.prisma.lifecycleEvent.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          leadId: true,
          fromStatus: true,
          toStatus: true,
          actorType: true,
          reason: true,
          timestamp: true,
        },
      }),
      this.prisma.masterDataSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.masterDataSyncRun.findFirst({
        where: { status: 'SUCCEEDED' },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.leadMessage.count(),
      this.prisma.leadMessage.findFirst({ orderBy: { receivedAt: 'desc' } }),
    ]);

    const lifecycleCounts = emptyCounts(lifecycleStatuses);
    for (const group of lifecycleGroups) lifecycleCounts[group.lifecycleStatus] = group._count._all;
    const qualificationCounts = emptyCounts(qualificationStatuses);
    for (const group of qualificationGroups)
      qualificationCounts[group.qualificationStatus] = group._count._all;
    const showcaseCounts = emptyCounts(showcaseStatuses);
    for (const group of showcaseGroups) showcaseCounts[group.status] = group._count._all;

    return {
      totalLeads: lifecycleGroups.reduce((total, group) => total + group._count._all, 0),
      lifecycleCounts,
      qualificationCounts,
      showcaseCounts,
      failedProcessingCount,
      recentLeads: leads.map((lead) => ({
        id: lead.id,
        contactEmail: lead.contactEmail,
        contactName: lead.contactName,
        lifecycleStatus: lead.lifecycleStatus,
        qualificationStatus: lead.qualificationStatus,
        showcaseStatus: lead.showcase?.status ?? null,
        updatedAt: lead.updatedAt,
      })),
      failedProcessing,
      recentActivity: activity,
      masterData: {
        latestRun:
          latestMasterRun === null
            ? null
            : {
                id: latestMasterRun.id,
                status: latestMasterRun.status,
                trigger: latestMasterRun.trigger,
                startedAt: latestMasterRun.startedAt,
                finishedAt: latestMasterRun.finishedAt,
                errorCode: latestMasterRun.errorCode,
              },
        lastSuccessfulAt: successfulMasterRun?.finishedAt ?? null,
      },
      gmail: { messageCount, lastMessageAt: latestMessage?.receivedAt ?? null },
    };
  }

  public async findLeadIdsByEmails(
    emails: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (emails.length === 0) return new Map();
    const leads = await this.prisma.lead.findMany({
      where: { contactEmail: { in: [...new Set(emails.map((email) => email.toLowerCase()))] } },
      select: { id: true, contactEmail: true },
    });
    return new Map(
      leads
        .filter((lead): lead is { id: string; contactEmail: string } => lead.contactEmail !== null)
        .map((lead) => [lead.contactEmail.toLowerCase(), lead.id]),
    );
  }
}
