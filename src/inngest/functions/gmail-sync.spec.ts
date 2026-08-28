import { InngestTestEngine } from '@inngest/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setContainerForTests, type AppContainer } from '../../server/container';
import { gmailSyncRequested } from '../events';
import { gmailSync } from './gmail-sync';

describe('gmailSync', () => {
  afterEach(() => {
    setContainerForTests(undefined);
  });

  it('ingests once and fans out only affected lead ids', async () => {
    const sync = vi.fn().mockResolvedValue({
      received: 3,
      created: 2,
      updated: 1,
      skipped: 0,
      failed: 0,
      affectedLeadIds: ['lead-1', 'lead-2'],
    });
    setContainerForTests({ gmailIngestionService: { sync } as never } as unknown as AppContainer);
    const engine = new InngestTestEngine({
      function: gmailSync,
      events: [gmailSyncRequested.create({ trigger: 'schedule' })],
      steps: [
        {
          id: 'request-lead-processing',
          handler: vi.fn(() => ({ ids: ['event-lead-1', 'event-lead-2'] })),
        },
      ],
    });

    const execution = await engine.execute();

    expect(execution.error).toBeUndefined();
    expect(sync).toHaveBeenCalledOnce();
    expect(execution.result).toMatchObject({ affectedLeadIds: ['lead-1', 'lead-2'] });
  });

  it('does not fan out when every message was already ingested', async () => {
    const sync = vi.fn().mockResolvedValue({
      received: 1,
      created: 0,
      updated: 0,
      skipped: 1,
      failed: 0,
      affectedLeadIds: [],
    });
    setContainerForTests({ gmailIngestionService: { sync } as never } as unknown as AppContainer);
    const engine = new InngestTestEngine({
      function: gmailSync,
      events: [gmailSyncRequested.create({ trigger: 'manual', actorId: 'user-1' })],
    });

    const execution = await engine.execute();

    expect(execution.error).toBeUndefined();
    expect(sync).toHaveBeenCalledOnce();
    expect(execution.state['request-lead-processing']).toBeUndefined();
  });
});
