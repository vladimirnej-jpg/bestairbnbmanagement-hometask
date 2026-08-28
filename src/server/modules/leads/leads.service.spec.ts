import { describe, expect, it, vi } from 'vitest';

import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  it('returns paginated lead list metadata', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ items: [{ id: 'lead-1' }], total: 26 }),
    };
    const service = new LeadsService(repository as never);

    await expect(
      service.list({
        page: 2,
        pageSize: 25,
        lifecycleStatus: undefined,
        qualificationStatus: undefined,
      }),
    ).resolves.toMatchObject({ page: 2, pageSize: 25, total: 26, totalPages: 2 });
  });

  it('writes a lifecycle transition with the authenticated actor', async () => {
    const lead = { id: 'lead-1', lifecycleStatus: 'WARM' };
    const repository = {
      updateLifecycle: vi.fn().mockResolvedValue(lead),
      findById: vi.fn().mockResolvedValue({ ...lead, property: null }),
      findServiceContext: vi.fn().mockResolvedValue({ zone: 'unknown', services: [] }),
    };
    const service = new LeadsService(repository as never);

    await expect(
      service.updateLifecycle('lead-1', 'WARM', 'Follow-up booked', 'user-1'),
    ).resolves.toMatchObject({ id: 'lead-1', serviceZone: 'unknown', services: [] });
    expect(repository.updateLifecycle).toHaveBeenCalledWith(
      'lead-1',
      'WARM',
      'Follow-up booked',
      'user-1',
    );
  });

  it('returns a structured not-found application error', async () => {
    const repository = { updateLifecycle: vi.fn().mockResolvedValue(null) };
    const service = new LeadsService(repository as never);

    await expect(service.updateLifecycle('missing', 'WARM', null, 'user-1')).rejects.toMatchObject({
      status: 404,
      code: 'LEAD_NOT_FOUND',
    });
  });
});
