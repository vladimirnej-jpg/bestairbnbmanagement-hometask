import 'server-only';

import { ApplicationError } from '../server/errors/application-error';
import type {
  QueuedWorkflow,
  WorkflowDispatcher,
} from '../server/modules/workflows/workflow-dispatcher';
import { inngest } from './client';
import { gmailSyncRequested, leadProcessingRequested, masterDataSyncRequested } from './events';

type EventSender = Pick<typeof inngest, 'send'>;

export class InngestWorkflowDispatcher implements WorkflowDispatcher {
  public constructor(private readonly client: EventSender = inngest) {}

  public async requestGmailSync(
    trigger: 'manual' | 'schedule',
    actorId?: string,
  ): Promise<QueuedWorkflow> {
    return this.queue(
      gmailSyncRequested.create({ trigger, ...(actorId === undefined ? {} : { actorId }) }),
    );
  }

  public async requestMasterDataSync(
    trigger: 'manual' | 'schedule',
    actorId?: string,
  ): Promise<QueuedWorkflow> {
    return this.queue(
      masterDataSyncRequested.create({ trigger, ...(actorId === undefined ? {} : { actorId }) }),
    );
  }

  public async requestLeadProcessing(
    leadId: string,
    reason: 'ingestion' | 'manual',
  ): Promise<QueuedWorkflow> {
    return this.queue(leadProcessingRequested.create({ leadId, reason }));
  }

  private async queue(event: Parameters<EventSender['send']>[0]): Promise<QueuedWorkflow> {
    const response = await this.client.send(event);
    const eventId = response.ids[0];
    if (typeof eventId !== 'string' || eventId.length === 0) {
      throw new ApplicationError(
        502,
        'EVENT_DISPATCH_FAILED',
        'Inngest did not return an event id',
      );
    }
    return { eventId, status: 'QUEUED' };
  }
}
