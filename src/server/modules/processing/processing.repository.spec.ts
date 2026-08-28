import { describe, expect, it, vi } from 'vitest';

import { ProcessingRepository } from './processing.repository';

describe('ProcessingRepository', () => {
  it('stores the extraction prompt version alongside token usage', async () => {
    const update = vi.fn().mockResolvedValue({});
    const repository = new ProcessingRepository({ processingRun: { update } } as never);

    await repository.succeed('run-1', {
      provider: 'openrouter',
      model: 'liquid/lfm-2.5-2.6b:free',
      promptVersion: 'extract-lead-v1-ab12cd34',
      tokenUsage: { input: 10, output: 20 },
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        provider: 'openrouter',
        model: 'liquid/lfm-2.5-2.6b:free',
        tokenUsage: {
          input: 10,
          output: 20,
          promptVersion: 'extract-lead-v1-ab12cd34',
        },
      }),
    });
  });
});
