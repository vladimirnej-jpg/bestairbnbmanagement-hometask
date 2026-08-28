import 'server-only';

import { getContainer } from '../../server/container';
import { inngest } from '../client';
import { gmailSyncRequested, leadProcessingRequested } from '../events';

export const gmailSync = inngest.createFunction(
  {
    id: 'gmail-sync',
    concurrency: 1,
    triggers: [{ event: gmailSyncRequested }],
  },
  async ({ event, step }) => {
    const result = await step.run('ingest-gmail', () =>
      getContainer().gmailIngestionService.sync(),
    );
    if (result.affectedLeadIds.length > 0) {
      await step.sendEvent(
        'request-lead-processing',
        result.affectedLeadIds.map((leadId) =>
          leadProcessingRequested.create({ leadId, reason: 'ingestion' }),
        ),
      );
    }
    return { ...result, trigger: event.data.trigger };
  },
);
