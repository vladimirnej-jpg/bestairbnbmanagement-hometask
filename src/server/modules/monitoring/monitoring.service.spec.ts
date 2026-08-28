import { describe, expect, it, vi } from 'vitest';

import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  it('associates upcoming calendar events with known lead contacts', async () => {
    const repository = {
      getSnapshot: vi.fn().mockResolvedValue({
        totalLeads: 1,
        lifecycleCounts: {
          INCOMING: 1,
          SCHEDULED_INITIAL_APPOINTMENT: 0,
          WARM: 0,
          GONE_COLD: 0,
        },
        qualificationCounts: { NEEDS_INFO: 0, NEEDS_REVIEW: 1, QUALIFIED: 0, OUT_OF_ZONE: 0 },
        showcaseCounts: { NOT_READY: 0, READY: 0, BLOCKED: 1, DRAFT_CREATED: 0, FAILED: 0 },
        failedProcessingCount: 0,
        recentLeads: [],
        failedProcessing: [],
        recentActivity: [],
        masterData: { latestRun: null, lastSuccessfulAt: null },
        gmail: { messageCount: 1, lastMessageAt: new Date('2026-08-26T08:00:00Z') },
      }),
      findLeadIdsByEmails: vi.fn().mockResolvedValue(new Map([['lead@example.com', 'lead-1']])),
    };
    const calendar = {
      listUpcomingEvents: vi.fn().mockResolvedValue([
        {
          eventId: 'event-1',
          title: 'Call',
          startAt: new Date('2026-08-28T10:00:00Z'),
          endAt: null,
          attendeeEmails: ['lead@example.com'],
        },
      ]),
    };
    const service = new MonitoringService(repository as never, calendar as never);

    await expect(service.getOverview()).resolves.toMatchObject({
      calendar: {
        status: 'available',
        events: [{ eventId: 'event-1', relatedLeadId: 'lead-1' }],
      },
      leads: { attention: { needsReview: 1, blockedShowcases: 1 } },
    });
  });

  it('keeps monitoring available when Calendar is temporarily unavailable', async () => {
    const repository = {
      getSnapshot: vi.fn().mockResolvedValue({
        totalLeads: 0,
        lifecycleCounts: {
          INCOMING: 0,
          SCHEDULED_INITIAL_APPOINTMENT: 0,
          WARM: 0,
          GONE_COLD: 0,
        },
        qualificationCounts: { NEEDS_INFO: 0, NEEDS_REVIEW: 0, QUALIFIED: 0, OUT_OF_ZONE: 0 },
        showcaseCounts: { NOT_READY: 0, READY: 0, BLOCKED: 0, DRAFT_CREATED: 0, FAILED: 0 },
        failedProcessingCount: 0,
        recentLeads: [],
        failedProcessing: [],
        recentActivity: [],
        masterData: { latestRun: null, lastSuccessfulAt: null },
        gmail: { messageCount: 0, lastMessageAt: null },
      }),
      findLeadIdsByEmails: vi.fn().mockResolvedValue(new Map()),
    };
    const service = new MonitoringService(repository as never, {
      listUpcomingEvents: vi.fn().mockRejectedValue(new Error('calendar down')),
    });

    await expect(service.getOverview()).resolves.toMatchObject({
      calendar: { status: 'unavailable', warning: 'PROVIDER_UNAVAILABLE', events: [] },
    });
  });
});
