import type { LifecycleStatus, QualificationStatus, ShowcaseStatus } from '@prisma/client';

import {
  CalendarProviderError,
  type CalendarEvent,
  type CalendarProvider,
} from '../../integrations/google/calendar.provider';
import type { MonitoringRepository } from './monitoring.repository';
import { type MonitoringSnapshot } from './monitoring.repository';

export interface MonitoringOverview {
  readonly generatedAt: Date;
  readonly sync: MonitoringSnapshot['masterData'] & {
    readonly gmail: MonitoringSnapshot['gmail'];
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
    readonly recent: MonitoringSnapshot['recentLeads'];
  };
  readonly failedProcessing: MonitoringSnapshot['failedProcessing'];
  readonly recentActivity: MonitoringSnapshot['recentActivity'];
  readonly calendar: {
    readonly status: 'available' | 'unavailable';
    readonly warning: string | null;
    readonly events: readonly {
      readonly eventId: string;
      readonly title: string;
      readonly startAt: Date;
      readonly endAt: Date | null;
      readonly relatedLeadId: string | null;
    }[];
  };
}

export class MonitoringService {
  public constructor(
    private readonly repository: MonitoringRepository,
    private readonly calendar: CalendarProvider,
  ) {}

  public async getOverview(): Promise<MonitoringOverview> {
    const [snapshot, calendarResult] = await Promise.all([
      this.repository.getSnapshot(),
      this.readCalendar(),
    ]);
    const leadIdsByEmail = await this.repository.findLeadIdsByEmails(
      calendarResult.events.flatMap((event) => event.attendeeEmails),
    );
    return {
      generatedAt: new Date(),
      sync: { ...snapshot.masterData, gmail: snapshot.gmail },
      leads: {
        total: snapshot.totalLeads,
        byLifecycle: snapshot.lifecycleCounts,
        byQualification: snapshot.qualificationCounts,
        byShowcase: snapshot.showcaseCounts,
        attention: {
          needsReview: snapshot.qualificationCounts.NEEDS_REVIEW,
          blockedShowcases: snapshot.showcaseCounts.BLOCKED,
          failedProcessing: snapshot.failedProcessingCount,
        },
        recent: snapshot.recentLeads,
      },
      failedProcessing: snapshot.failedProcessing,
      recentActivity: snapshot.recentActivity,
      calendar: {
        status: calendarResult.warning === null ? 'available' : 'unavailable',
        warning: calendarResult.warning,
        events: calendarResult.events.map((event) => ({
          eventId: event.eventId,
          title: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
          relatedLeadId:
            event.attendeeEmails
              .map((email) => leadIdsByEmail.get(email.toLowerCase()))
              .find((leadId): leadId is string => leadId !== undefined) ?? null,
        })),
      },
    };
  }

  private async readCalendar(): Promise<{
    readonly events: readonly CalendarEvent[];
    readonly warning: string | null;
  }> {
    try {
      return { events: await this.calendar.listUpcomingEvents(), warning: null };
    } catch (error) {
      return {
        events: [],
        warning: error instanceof CalendarProviderError ? error.code : 'PROVIDER_UNAVAILABLE',
      };
    }
  }
}
