import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApplicationError } from '../../src/server/errors/application-error';
import { setContainerForTests, type AppContainer } from '../../src/server/container';
import { GET as getLeads } from '../../src/app/api/leads/route';
import { GET as getLead } from '../../src/app/api/leads/[leadId]/route';
import { POST as reprocessLead } from '../../src/app/api/leads/[leadId]/reprocess/route';
import { PATCH as updateShowcase } from '../../src/app/api/leads/[leadId]/showcase/route';
import { POST as syncMasterData } from '../../src/app/api/sync/master-data/route';

const user = { id: 'ops-1', email: 'ops@example.com', role: 'OPS' as const };

function request(url: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${url}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-token',
      ...init.headers,
    },
  });
}

function container(): AppContainer {
  const authService = {
    authorizeRequest: vi.fn(async (incoming: Request, roles: readonly string[]) => {
      if (incoming.headers.get('authorization') === null) {
        throw new ApplicationError(401, 'UNAUTHORIZED', 'Authentication is required');
      }
      const role = incoming.headers.get('x-test-role') ?? 'OPS';
      if (roles.length > 0 && !roles.includes(role)) {
        throw new ApplicationError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      return { ...user, role: role as typeof user.role };
    }),
  };

  return {
    prisma: {} as never,
    authService: authService as never,
    leadsService: {
      list: vi
        .fn()
        .mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 }),
      getById: vi.fn().mockResolvedValue({ id: 'lead-1' }),
    } as never,
    gmailIngestionService: {} as never,
    processingService: {} as never,
    masterDataService: {} as never,
    propertiesService: {} as never,
    showcasesService: { edit: vi.fn() } as never,
    syncService: {} as never,
    monitoringService: {} as never,
    workflowDispatcher: {
      requestLeadProcessing: vi.fn().mockResolvedValue({
        eventId: 'event-lead-1',
        status: 'QUEUED',
      }),
      requestMasterDataSync: vi.fn().mockResolvedValue({
        eventId: 'event-master-data-1',
        status: 'QUEUED',
      }),
      requestGmailSync: vi.fn(),
    },
  };
}

describe('Next.js API contracts', () => {
  afterEach(() => {
    setContainerForTests(undefined);
  });

  it('returns a 401 envelope before accessing a protected service', async () => {
    setContainerForTests(container());

    const response = await getLeads(new Request('http://localhost/api/leads'));
    const payload = (await response.json()) as { statusCode: number; error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({ statusCode: 401, error: { code: 'UNAUTHORIZED' } });
  });

  it('returns a 403 envelope when the authenticated role is insufficient', async () => {
    setContainerForTests(container());

    const response = await getLeads(
      request('/api/leads', { headers: { 'x-test-role': 'MONITOR' } }),
    );
    const payload = (await response.json()) as { statusCode: number; error: { code: string } };

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({ statusCode: 403, error: { code: 'FORBIDDEN' } });
  });

  it('validates strict query input and keeps the success list contract', async () => {
    const app = container();
    setContainerForTests(app);

    const invalid = await getLeads(request('/api/leads?unexpected=true'));
    expect(invalid.status).toBe(400);

    const response = await getLeads(request('/api/leads'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ items: [], page: 1, pageSize: 25 });
    expect(app.leadsService.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      lifecycleStatus: undefined,
      qualificationStatus: undefined,
      showcaseStatus: undefined,
      search: undefined,
    });
  });

  it('queues background commands and returns 202 with the event contract', async () => {
    const app = container();
    setContainerForTests(app);

    const reprocess = await reprocessLead(request('/api/leads/lead-1/reprocess'), {
      params: Promise.resolve({ leadId: 'lead-1' }),
    });
    const masterData = await syncMasterData(request('/api/sync/master-data', { method: 'POST' }));

    expect(reprocess.status).toBe(202);
    await expect(reprocess.json()).resolves.toEqual({
      eventId: 'event-lead-1',
      status: 'QUEUED',
    });
    expect(masterData.status).toBe(202);
    await expect(masterData.json()).resolves.toEqual({
      eventId: 'event-master-data-1',
      status: 'QUEUED',
    });
    expect(app.workflowDispatcher.requestMasterDataSync).toHaveBeenCalledWith('manual', 'ops-1');
  });

  it('rejects extra fields in a showcase edit body', async () => {
    const app = container();
    setContainerForTests(app);

    const response = await updateShowcase(
      request('/api/leads/lead-1/showcase', {
        method: 'PATCH',
        body: JSON.stringify({
          subject: 'Subject',
          greeting: 'Hello',
          propertySummary: 'Summary',
          selectedServices: ['Cleaning'],
          observations: ['Observation'],
          callToAction: 'Reply',
          extra: true,
        }),
      }),
      { params: Promise.resolve({ leadId: 'lead-1' }) },
    );

    expect(response.status).toBe(400);
    expect(app.showcasesService.edit).not.toHaveBeenCalled();
  });

  it('passes a validated route parameter to the lead detail service', async () => {
    const app = container();
    setContainerForTests(app);

    const response = await getLead(request('/api/leads/lead-1'), {
      params: Promise.resolve({ leadId: 'lead-1' }),
    });

    expect(response.status).toBe(200);
    expect(app.leadsService.getById).toHaveBeenCalledWith('lead-1');
  });
});
