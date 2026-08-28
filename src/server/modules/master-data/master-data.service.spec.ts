import { describe, expect, it, vi } from 'vitest';

import type { ApplicationError } from '../../errors/application-error';
import type { MasterDataProvider } from './master-data-provider';
import { MasterDataService } from './master-data.service';

const snapshot = {
  properties: [
    {
      externalId: 'property-1',
      addressLine1: '10 Example Street',
      city: 'Amsterdam',
      postcode: '1012 AB',
    },
  ],
  serviceZones: [{ externalId: 'zone-1', name: 'Amsterdam', postcodePrefixes: ['10'] }],
  services: [{ externalId: 'service-1', name: 'Cleaning' }],
  zoneServices: [{ serviceZoneExternalId: 'zone-1', serviceExternalId: 'service-1' }],
};

describe('MasterDataService', () => {
  it('validates, normalizes, projects, and releases the lease', async () => {
    const provider: MasterDataProvider = { fetchSnapshot: vi.fn().mockResolvedValue(snapshot) };
    const repository = {
      createSyncRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      applyProjection: vi.fn().mockResolvedValue({
        propertyCount: 1,
        zoneCount: 1,
        serviceCount: 1,
        assignmentCount: 1,
      }),
    };
    const lease = { acquire: vi.fn(), release: vi.fn() };
    const service = new MasterDataService(provider, repository as never, lease as never);

    await expect(service.sync('manual', 'user-1')).resolves.toEqual({
      runId: 'run-1',
      status: 'SUCCEEDED',
      propertyCount: 1,
      zoneCount: 1,
      serviceCount: 1,
      assignmentCount: 1,
    });
    expect(repository.applyProjection).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        properties: [expect.objectContaining({ postcode: '1012AB', contactEmail: undefined })],
      }),
    );
    expect(lease.release).toHaveBeenCalled();
  });

  it('marks a failed run and releases the lease when validation fails', async () => {
    const provider: MasterDataProvider = {
      fetchSnapshot: vi.fn().mockResolvedValue({
        ...snapshot,
        zoneServices: [{ serviceZoneExternalId: 'missing-zone', serviceExternalId: 'service-1' }],
      }),
    };
    const repository = {
      createSyncRun: vi.fn().mockResolvedValue({ id: 'run-2' }),
      applyProjection: vi.fn(),
      markSyncRunFailed: vi.fn(),
    };
    const lease = { acquire: vi.fn(), release: vi.fn() };
    const service = new MasterDataService(provider, repository as never, lease as never);

    await expect(service.sync('manual')).rejects.toMatchObject({
      status: 400,
      code: 'MASTER_DATA_INVALID',
    } satisfies Partial<ApplicationError>);
    expect(repository.applyProjection).not.toHaveBeenCalled();
    expect(repository.markSyncRunFailed).toHaveBeenCalledWith(
      'run-2',
      'MASTER_DATA_INVALID',
      expect.any(String),
    );
    expect(lease.release).toHaveBeenCalled();
  });
});
