export interface QueuedWorkflow {
  readonly eventId: string;
  readonly status: 'QUEUED';
}

export interface WorkflowDispatcher {
  requestGmailSync(trigger: 'manual' | 'schedule', actorId?: string): Promise<QueuedWorkflow>;
  requestMasterDataSync(trigger: 'manual' | 'schedule', actorId?: string): Promise<QueuedWorkflow>;
  requestLeadProcessing(leadId: string, reason: 'ingestion' | 'manual'): Promise<QueuedWorkflow>;
}

export class FakeWorkflowDispatcher implements WorkflowDispatcher {
  private sequence = 0;

  public readonly requests: Array<{
    readonly eventId: string;
    readonly type: 'gmail' | 'master-data' | 'lead-processing';
    readonly actorId?: string;
    readonly leadId?: string;
    readonly trigger?: 'manual' | 'schedule';
    readonly reason?: 'ingestion' | 'manual';
  }> = [];

  public requestGmailSync(
    trigger: 'manual' | 'schedule',
    actorId?: string,
  ): Promise<QueuedWorkflow> {
    return Promise.resolve(
      this.queue({ type: 'gmail', trigger, ...(actorId === undefined ? {} : { actorId }) }),
    );
  }

  public requestMasterDataSync(
    trigger: 'manual' | 'schedule',
    actorId?: string,
  ): Promise<QueuedWorkflow> {
    return Promise.resolve(
      this.queue({ type: 'master-data', trigger, ...(actorId === undefined ? {} : { actorId }) }),
    );
  }

  public requestLeadProcessing(
    leadId: string,
    reason: 'ingestion' | 'manual',
  ): Promise<QueuedWorkflow> {
    return Promise.resolve(this.queue({ type: 'lead-processing', leadId, reason }));
  }

  private queue(request: Omit<(typeof this.requests)[number], 'eventId'>): QueuedWorkflow {
    this.sequence += 1;
    const eventId = `fake-workflow-${this.sequence}`;
    this.requests.push({ eventId, ...request });
    return { eventId, status: 'QUEUED' };
  }
}
