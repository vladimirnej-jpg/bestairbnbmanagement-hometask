import type { Lead, LeadMessage } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { GmailMessage, GmailProvider } from '../../integrations/google/gmail.provider';
import { GmailIngestionService } from './gmail-ingestion.service';
import type { LeadsRepository } from './leads.repository';

const messages: GmailMessage[] = [
  {
    messageId: 'message-1',
    threadId: 'thread-1',
    from: 'lead@example.com',
    subject: 'First',
    body: 'incomplete',
    receivedAt: new Date('2026-08-25T08:00:00.000Z'),
  },
  {
    messageId: 'message-2',
    threadId: 'thread-1',
    from: 'lead@example.com',
    subject: 'Follow-up',
    body: 'address',
    receivedAt: new Date('2026-08-25T08:01:00.000Z'),
  },
  {
    messageId: 'message-3',
    threadId: 'thread-2',
    from: 'other@example.com',
    subject: 'New lead',
    body: 'complete',
    receivedAt: new Date('2026-08-25T08:02:00.000Z'),
  },
];

describe('GmailIngestionService', () => {
  it('merges follow-ups and skips already ingested message ids', async () => {
    const messageIds = new Set<string>();
    const threadLeads = new Map<string, string>();
    const repository = {
      findMessageByGmailId: vi.fn(async (messageId: string) =>
        messageIds.has(messageId) ? ({} as LeadMessage) : null,
      ),
      findByThreadId: vi.fn(async (threadId: string) => {
        const id = threadLeads.get(threadId);
        return id === undefined
          ? null
          : ({ id } as unknown as Awaited<ReturnType<LeadsRepository['findById']>>);
      }),
      createLeadWithMessage: vi.fn(async (message: GmailMessage) => {
        const id = `lead-${threadLeads.size + 1}`;
        threadLeads.set(message.threadId, id);
        messageIds.add(message.messageId);
        return { id } as unknown as Lead;
      }),
      appendMessage: vi.fn(async (_leadId: string, message: GmailMessage) => {
        messageIds.add(message.messageId);
        return {} as LeadMessage;
      }),
    } as unknown as LeadsRepository;
    const provider: GmailProvider = {
      listLeadMessages: vi.fn().mockResolvedValue(messages),
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
    };
    const service = new GmailIngestionService(provider, repository);

    await expect(service.sync()).resolves.toMatchObject({
      received: 3,
      created: 2,
      updated: 1,
      skipped: 0,
      failed: 0,
      affectedLeadIds: ['lead-1', 'lead-2'],
    });
    await expect(service.sync()).resolves.toMatchObject({
      received: 3,
      created: 0,
      updated: 0,
      skipped: 3,
      failed: 0,
      affectedLeadIds: [],
    });
  });
});
