import { InngestTestEngine } from '@inngest/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setContainerForTests, type AppContainer } from '../../server/container';
import { masterDataSyncRequested } from '../events';
import { masterDataSync } from './master-data-sync';

describe('masterDataSync', () => {
  afterEach(() => {
    setContainerForTests(undefined);
  });

  it('runs the existing atomic sync service as one durable operation', async () => {
    const syncMasterData = vi.fn().mockResolvedValue({ runId: 'sync-1', status: 'SUCCEEDED' });
    setContainerForTests({ syncService: { syncMasterData } as never } as unknown as AppContainer);
    const engine = new InngestTestEngine({
      function: masterDataSync,
      events: [masterDataSyncRequested.create({ trigger: 'manual', actorId: 'user-1' })],
    });

    const execution = await engine.execute();

    expect(execution.error).toBeUndefined();
    expect(syncMasterData).toHaveBeenCalledWith('manual', 'user-1');
    expect(execution.result).toMatchObject({ runId: 'sync-1', status: 'SUCCEEDED' });
    expect(masterDataSync.opts).toMatchObject({ retries: 2, concurrency: 1 });
  });
});
