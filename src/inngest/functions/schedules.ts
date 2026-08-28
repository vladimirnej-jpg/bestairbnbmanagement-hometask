import 'server-only';

import { inngest } from '../client';
import { gmailSyncRequested, masterDataSyncRequested } from '../events';

export const gmailSyncSchedule = inngest.createFunction(
  {
    id: 'schedule-gmail-sync',
    concurrency: 1,
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async ({ step }) =>
    step.sendEvent('request-gmail-sync', gmailSyncRequested.create({ trigger: 'schedule' })),
);

export const masterDataSyncSchedule = inngest.createFunction(
  {
    id: 'schedule-master-data-sync',
    concurrency: 1,
    triggers: [{ cron: '*/15 * * * *' }],
  },
  async ({ step }) =>
    step.sendEvent(
      'request-master-data-sync',
      masterDataSyncRequested.create({ trigger: 'schedule' }),
    ),
);
