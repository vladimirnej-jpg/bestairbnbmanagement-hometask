import { apiFetch } from './client';
import type { LifecycleStatus, QualificationStatus, ShowcaseStatus } from './leads';

export interface MonitoringOverview {
  readonly generatedAt: string;
  readonly sync: {
    readonly latestRun: {
      readonly id: string;
      readonly status: string;
      readonly trigger: string;
      readonly startedAt: string;
      readonly finishedAt: string | null;
      readonly errorCode: string | null;
    } | null;
    readonly lastSuccessfulAt: string | null;
    readonly hasSuccessfulProjection: boolean;
    readonly gmail: { readonly messageCount: number; readonly lastMessageAt: string | null };
  };
  readonly leads: {
    readonly total: number;
    readonly byLifecycle: Readonly<Record<LifecycleStatus, number>>;
    readonly byQualification: Readonly<Record<QualificationStatus, number>>;
    readonly byShowcase: Readonly<Record<ShowcaseStatus, number>>;
    readonly attention: {
      readonly needsReview: number;
      readonly blockedShowcases: number;
      readonly failedProcessing: number;
    };
    readonly recent: readonly {
      readonly id: string;
      readonly contactEmail: string | null;
      readonly contactName: string | null;
      readonly lifecycleStatus: LifecycleStatus;
      readonly qualificationStatus: QualificationStatus;
      readonly showcaseStatus: ShowcaseStatus | null;
      readonly updatedAt: string;
    }[];
  };
  readonly failedProcessing: readonly {
    readonly leadId: string;
    readonly step: string;
    readonly errorCode: string | null;
    readonly createdAt: string;
  }[];
  readonly recentActivity: readonly {
    readonly leadId: string;
    readonly fromStatus: LifecycleStatus | null;
    readonly toStatus: LifecycleStatus;
    readonly actorType: 'SYSTEM' | 'USER';
    readonly reason: string | null;
    readonly timestamp: string;
  }[];
  readonly calendar: {
    readonly status: 'available' | 'unavailable';
    readonly warning: string | null;
    readonly events: readonly {
      readonly eventId: string;
      readonly title: string;
      readonly startAt: string;
      readonly endAt: string | null;
      readonly relatedLeadId: string | null;
    }[];
  };
}

export function getMonitoringOverview(accessToken: string): Promise<MonitoringOverview> {
  return apiFetch<MonitoringOverview>('/monitoring/overview', { accessToken });
}
