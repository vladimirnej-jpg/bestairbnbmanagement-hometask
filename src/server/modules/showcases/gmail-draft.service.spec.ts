import { describe, expect, it, vi } from 'vitest';

import { GmailDraftService } from './gmail-draft.service';

describe('GmailDraftService', () => {
  const input = ['lead-1', 'lead@example.com', 'Subject', '<p>Content</p>'] as const;

  it('creates a draft once and updates the known draft on a retry', async () => {
    const gmail = {
      listLeadMessages: vi.fn().mockResolvedValue([]),
      createDraft: vi.fn().mockResolvedValue({ draftId: 'draft-1' }),
      updateDraft: vi.fn().mockResolvedValue({ draftId: 'draft-1' }),
    };
    const repository = {
      prepareDraftSync: vi.fn().mockResolvedValue({ intentKey: 'intent-1', draftId: null }),
      setDraftResult: vi.fn().mockResolvedValue(undefined),
      setDraftFailed: vi.fn().mockResolvedValue(undefined),
    };
    const service = new GmailDraftService(gmail, repository as never);

    await expect(service.sync(...input, null)).resolves.toBe('draft-1');
    await expect(service.sync(...input, 'draft-1')).resolves.toBe('draft-1');

    expect(gmail.createDraft).toHaveBeenCalledTimes(1);
    expect(gmail.createDraft).toHaveBeenCalledWith({
      to: 'lead@example.com',
      subject: 'Subject',
      html: '<p>Content</p>',
      idempotencyKey: 'intent-1',
    });
    expect(gmail.updateDraft).toHaveBeenCalledWith('draft-1', {
      to: 'lead@example.com',
      subject: 'Subject',
      html: '<p>Content</p>',
      idempotencyKey: 'intent-1',
    });
    expect(repository.setDraftResult).toHaveBeenCalledTimes(2);
  });

  it('keeps synchronization retryable after a provider error', async () => {
    const providerError = new Error('Gmail unavailable');
    const gmail = {
      listLeadMessages: vi.fn().mockResolvedValue([]),
      createDraft: vi
        .fn()
        .mockRejectedValueOnce(providerError)
        .mockResolvedValue({ draftId: 'draft-2' }),
      updateDraft: vi.fn(),
    };
    const repository = {
      prepareDraftSync: vi.fn().mockResolvedValue({ intentKey: 'intent-2', draftId: null }),
      setDraftResult: vi.fn().mockResolvedValue(undefined),
      setDraftFailed: vi.fn().mockResolvedValue(undefined),
    };
    const service = new GmailDraftService(gmail, repository as never);

    await expect(service.sync(...input, null)).rejects.toBe(providerError);
    await expect(service.sync(...input, null)).resolves.toBe('draft-2');
    expect(repository.setDraftFailed).toHaveBeenCalledWith('lead-1', 'Gmail unavailable');
    expect(gmail.createDraft).toHaveBeenCalledTimes(2);
  });
});
