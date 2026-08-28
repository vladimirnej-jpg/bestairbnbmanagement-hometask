import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getProfileMock, importMessageMock, listMessagesMock, getMessageMock, oauthClientMock } =
  vi.hoisted(() => ({
    getProfileMock: vi.fn(),
    importMessageMock: vi.fn(),
    listMessagesMock: vi.fn(),
    getMessageMock: vi.fn(),
    oauthClientMock: vi.fn(),
  }));

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: oauthClientMock },
    gmail: vi.fn(() => ({
      users: {
        getProfile: getProfileMock,
        messages: { import: importMessageMock, list: listMessagesMock, get: getMessageMock },
      },
    })),
  },
}));

import { GoogleGmailProvider } from './google-gmail.provider';

describe('GoogleGmailProvider.importMessage', () => {
  beforeEach(() => {
    getProfileMock.mockReset();
    importMessageMock.mockReset();
    listMessagesMock.mockReset();
    getMessageMock.mockReset();
    oauthClientMock.mockReset();
    oauthClientMock.mockImplementation(() => ({ setCredentials: vi.fn() }));
  });

  it('loads every page of messages', async () => {
    listMessagesMock
      .mockResolvedValueOnce({
        data: { messages: [{ id: 'message-1' }], nextPageToken: 'page-2' },
      })
      .mockResolvedValueOnce({ data: { messages: [{ id: 'message-2' }] } });
    getMessageMock.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({
        data: {
          id,
          threadId: `thread-${id}`,
          internalDate: '1700000000000',
          payload: {
            headers: [
              { name: 'From', value: 'sender@example.test' },
              { name: 'To', value: 'qa@example.test' },
              { name: 'Subject', value: `Subject ${id}` },
            ],
            mimeType: 'text/plain',
            body: { data: Buffer.from(`Body ${id}`).toString('base64url') },
          },
        },
      }),
    );

    await expect(new GoogleGmailProvider(config()).listLeadMessages()).resolves.toHaveLength(2);
    expect(listMessagesMock).toHaveBeenNthCalledWith(1, {
      userId: 'qa@example.test',
      q: undefined,
      maxResults: 50,
    });
    expect(listMessagesMock).toHaveBeenNthCalledWith(2, {
      userId: 'qa@example.test',
      q: undefined,
      maxResults: 50,
      pageToken: 'page-2',
    });
    expect(getMessageMock).toHaveBeenCalledTimes(2);
  });

  it('returns the authenticated mailbox address for confirmation', async () => {
    getProfileMock.mockResolvedValue({ data: { emailAddress: 'QA-Mailbox@Example.Test' } });

    await expect(new GoogleGmailProvider(config()).getMailboxEmail()).resolves.toBe(
      'qa-mailbox@example.test',
    );
    expect(getProfileMock).toHaveBeenCalledWith({ userId: 'qa@example.test' });
  });

  it('imports an RFC822 message and returns Gmail ids', async () => {
    importMessageMock.mockResolvedValue({
      data: { id: 'gmail-message-1', threadId: 'gmail-thread-1' },
    });
    const provider = new GoogleGmailProvider(config());
    const rawMessage = 'From: alex@example.test\r\n\r\nHello';

    await expect(provider.importMessage(rawMessage)).resolves.toEqual({
      messageId: 'gmail-message-1',
      threadId: 'gmail-thread-1',
    });
    expect(importMessageMock).toHaveBeenCalledWith({
      userId: 'qa@example.test',
      internalDateSource: 'dateHeader',
      processForCalendar: false,
      requestBody: { raw: Buffer.from(rawMessage, 'utf8').toString('base64url') },
    });
  });

  it('recovers a missing thread id from the imported message', async () => {
    importMessageMock.mockResolvedValue({ data: { id: 'gmail-message-1' } });
    getMessageMock.mockResolvedValue({
      data: { id: 'gmail-message-1', threadId: 'gmail-thread-1' },
    });

    await expect(
      new GoogleGmailProvider(config()).importMessage('From: a@example.test\n\nHi'),
    ).resolves.toEqual({ messageId: 'gmail-message-1', threadId: 'gmail-thread-1' });
    expect(getMessageMock).toHaveBeenCalledWith({
      userId: 'qa@example.test',
      id: 'gmail-message-1',
      format: 'minimal',
    });
  });

  it('rejects an import response without a Gmail message id', async () => {
    importMessageMock.mockResolvedValue({ data: {} });

    await expect(
      new GoogleGmailProvider(config()).importMessage('From: a@example.test\n\nHi'),
    ).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_RESPONSE',
      message: 'Gmail import response is missing a message id (received fields: none)',
    });
  });

  it('preserves the Gmail API status and reason when import is rejected', async () => {
    importMessageMock.mockRejectedValue({
      response: {
        status: 403,
        data: {
          error: {
            message: 'Request had insufficient authentication scopes.',
            errors: [{ reason: 'insufficientPermissions' }],
          },
        },
      },
    });

    await expect(
      new GoogleGmailProvider(config()).importMessage('From: a@example.test\n\nHi'),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message:
        'Gmail message import failed: HTTP 403 insufficientPermissions: Request had insufficient authentication scopes.',
    });
  });
});

function config() {
  return {
    NODE_ENV: 'development',
    PORT: 3000,
    PROVIDER_MODE: 'live',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/bestairbnb',
    DIRECT_URL: 'postgresql://user:password@localhost:5432/bestairbnb',
    JWT_SECRET: 'local-development-secret-change-before-sharing-123456',
    CORS_ORIGIN: 'http://localhost:3000',
    LOG_LEVEL: 'info',
    GOOGLE_GMAIL_USER_ID: 'qa@example.test',
    GOOGLE_GMAIL_CLIENT_ID: 'client-id',
    GOOGLE_GMAIL_CLIENT_SECRET: 'client-secret',
    GOOGLE_GMAIL_REFRESH_TOKEN: 'refresh-token',
    GOOGLE_GMAIL_MAX_RESULTS: 50,
    GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-id',
    GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64: 'base64-credentials',
    GOOGLE_CALENDAR_ID: 'primary',
    GOOGLE_CALENDAR_MAX_RESULTS: 25,
    OPENROUTER_API_KEY: 'openrouter-key',
    OPENROUTER_MODEL: 'test-model',
    NOMINATIM_BASE_URL: 'https://nominatim.openstreetmap.org',
  } as const;
}
