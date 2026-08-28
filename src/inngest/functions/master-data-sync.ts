import 'server-only';

import { getContainer } from '../../server/container';
import { inngest } from '../client';
import { masterDataSyncRequested } from '../events';

export const masterDataSync = inngest.createFunction(
  {
    id: 'master-data-sync',
    concurrency: 1,
    retries: 2,
    triggers: [{ event: masterDataSyncRequested }],
  },
  async ({ event, step }) =>
    step.run('sync-master-data', () =>
      getContainer().syncService.syncMasterData(event.data.trigger, event.data.actorId),
    ),
);
