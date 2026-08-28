import { describe, expect, it, vi } from 'vitest';

import { InngestWorkflowDispatcher } from './dispatcher';

describe('InngestWorkflowDispatcher', () => {
  it('sends a versioned Gmail request and returns the provider event id', async () => {
    const send = vi.fn().mockResolvedValue({ ids: ['event-1'] });
    const dispatcher = new InngestWorkflowDispatcher({ send } as never);

    await expect(dispatcher.requestGmailSync('manual', 'user-1')).resolves.toEqual({
      eventId: 'event-1',
      status: 'QUEUED',
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'bestairbnb/gmail.sync.requested.v1',
        data: { trigger: 'manual', actorId: 'user-1' },
      }),
    );
  });

  it('fails explicitly if Inngest accepts an event without returning its id', async () => {
    const dispatcher = new InngestWorkflowDispatcher({
      send: vi.fn().mockResolvedValue({ ids: [] }),
    } as never);

    await expect(dispatcher.requestLeadProcessing('lead-1', 'manual')).rejects.toMatchObject({
      status: 502,
      code: 'EVENT_DISPATCH_FAILED',
    });
  });
});
