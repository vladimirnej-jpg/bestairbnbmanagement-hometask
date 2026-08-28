import 'server-only';

import { getContainer } from '../../server/container';
import { inngest } from '../client';
import { leadProcessingRequested } from '../events';

export const processLead = inngest.createFunction(
  {
    id: 'process-lead',
    concurrency: { limit: 1, key: 'event.data.leadId' },
    retries: 2,
    triggers: [{ event: leadProcessingRequested }],
  },
  async ({ attempt, event, runId, step }) => {
    const context = { orchestrationRunId: runId, attempt: attempt + 1 };
    const processing = getContainer().processingService;
    await step.run('extract-lead', () => processing.extract(event.data.leadId, context));
    await step.run('resolve-property', () =>
      processing.resolveProperty(event.data.leadId, context),
    );
    const qualificationStatus = await step.run('qualify-lead', () =>
      processing.qualify(event.data.leadId, context),
    );
    if (qualificationStatus === 'QUALIFIED') {
      await step.run('generate-showcase', () =>
        getContainer().showcasesService.generate(event.data.leadId),
      );
    }
    return { leadId: event.data.leadId, reason: event.data.reason };
  },
);
