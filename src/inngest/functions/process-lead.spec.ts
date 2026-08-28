import { InngestTestEngine } from '@inngest/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setContainerForTests, type AppContainer } from '../../server/container';
import { leadProcessingRequested } from '../events';
import { processLead } from './process-lead';

describe('processLead', () => {
  afterEach(() => {
    setContainerForTests(undefined);
  });

  it('runs durable steps in order and forwards one orchestration context', async () => {
    const calls: string[] = [];
    const extract = vi.fn(async () => {
      calls.push('extract');
    });
    const resolveProperty = vi.fn(async () => {
      calls.push('property');
    });
    const qualify = vi.fn(async () => {
      calls.push('qualification');
    });
    setContainerForTests({
      processingService: { extract, resolveProperty, qualify } as never,
    } as unknown as AppContainer);
    const engine = new InngestTestEngine({
      function: processLead,
      events: [leadProcessingRequested.create({ leadId: 'lead-1', reason: 'ingestion' })],
    });

    const execution = await engine.execute();

    expect(execution.error).toBeUndefined();
    expect(calls).toEqual(['extract', 'property', 'qualification']);
    expect(extract).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({ orchestrationRunId: expect.any(String), attempt: 1 }),
    );
    expect(resolveProperty).toHaveBeenCalledWith('lead-1', expect.any(Object));
    expect(qualify).toHaveBeenCalledWith('lead-1', expect.any(Object));
    expect(processLead.opts).toMatchObject({ retries: 2, concurrency: { limit: 1 } });
  });

  it('stops at the failing durable step so later steps are not run', async () => {
    const extract = vi.fn().mockRejectedValue(new Error('OpenRouter unavailable'));
    const resolveProperty = vi.fn();
    const qualify = vi.fn();
    setContainerForTests({
      processingService: { extract, resolveProperty, qualify } as never,
    } as unknown as AppContainer);
    const engine = new InngestTestEngine({
      function: processLead,
      events: [leadProcessingRequested.create({ leadId: 'lead-1', reason: 'manual' })],
    });

    const execution = await engine.execute();

    expect(execution.error).toBeTruthy();
    expect(resolveProperty).not.toHaveBeenCalled();
    expect(qualify).not.toHaveBeenCalled();
  });
});
