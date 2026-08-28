import { google, type gmail_v1 } from 'googleapis';

import type { AppConfig } from '../../runtime/config';
import { createGmailOAuthClient, GoogleClientConfigurationError } from './google-client.factory';
import {
  GmailProviderError,
  type GmailDraftInput,
  type GmailDraftResult,
  type GmailMessage,
  type GmailMessageImportResult,
  type GmailProvider,
} from './gmail.provider';
import { encodeRfc822Message } from './gmail-import';

const REQUEST_TIMEOUT_MS = 30_000;

export class GoogleGmailProvider implements GmailProvider {
  public constructor(private readonly config: AppConfig) {}

  public async listLeadMessages(): Promise<readonly GmailMessage[]> {
    const config = this.config;
    let gmail: gmail_v1.Gmail;
    try {
      const auth = createGmailOAuthClient({
        GOOGLE_GMAIL_CLIENT_ID: config.GOOGLE_GMAIL_CLIENT_ID,
        GOOGLE_GMAIL_CLIENT_SECRET: config.GOOGLE_GMAIL_CLIENT_SECRET,
        GOOGLE_GMAIL_REFRESH_TOKEN: config.GOOGLE_GMAIL_REFRESH_TOKEN,
      });
      gmail = google.gmail({ version: 'v1', auth });
    } catch (error) {
      if (error instanceof GoogleClientConfigurationError) {
        throw new GmailProviderError('PROVIDER_CONFIGURATION', error.message, { cause: error });
      }
      throw error;
    }

    try {
      const messages: GmailMessage[] = [];
      const leadQuery = [config.GOOGLE_GMAIL_QUERY?.trim(), '-from:me']
        .filter((part): part is string => part !== undefined && part.length > 0)
        .join(' ');
      let pageToken: string | undefined;
      do {
        const listResponse = await this.withTimeout(
          gmail.users.messages.list({
            userId: config.GOOGLE_GMAIL_USER_ID,
            q: leadQuery,
            maxResults: config.GOOGLE_GMAIL_MAX_RESULTS,
            ...(pageToken === undefined ? {} : { pageToken }),
          }),
        );
        const messageRefs = listResponse.data.messages ?? [];
        const pageMessages = await Promise.all(
          messageRefs
            .filter(
              (reference): reference is { id: string; threadId?: string | null } =>
                typeof reference.id === 'string',
            )
            .map((reference) => this.fetchMessage(gmail, reference.id)),
        );
        messages.push(...pageMessages);
        pageToken =
          typeof listResponse.data.nextPageToken === 'string'
            ? listResponse.data.nextPageToken
            : undefined;
      } while (pageToken !== undefined);
      return messages;
    } catch (error) {
      if (error instanceof GmailProviderError) {
        throw error;
      }
      throw new GmailProviderError('PROVIDER_UNAVAILABLE', 'Gmail provider request failed', {
        cause: error,
      });
    }
  }

  public async createDraft(input: GmailDraftInput): Promise<GmailDraftResult> {
    return this.writeDraft(input);
  }

  public async updateDraft(draftId: string, input: GmailDraftInput): Promise<GmailDraftResult> {
    return this.writeDraft(input, draftId);
  }

  public async getMailboxEmail(): Promise<string> {
    let gmail: gmail_v1.Gmail;
    try {
      gmail = this.gmailClient();
    } catch (error) {
      if (error instanceof GoogleClientConfigurationError) {
        throw new GmailProviderError('PROVIDER_CONFIGURATION', error.message, { cause: error });
      }
      throw error;
    }

    try {
      const response = await this.withTimeout(
        gmail.users.getProfile({ userId: this.config.GOOGLE_GMAIL_USER_ID }),
      );
      const emailAddress = response.data.emailAddress;
      if (typeof emailAddress !== 'string' || emailAddress.trim().length === 0) {
        throw new GmailProviderError(
          'PROVIDER_INVALID_RESPONSE',
          'Gmail profile response is missing the mailbox email address',
        );
      }
      return emailAddress.trim().toLowerCase();
    } catch (error) {
      if (error instanceof GmailProviderError) throw error;
      throw new GmailProviderError('PROVIDER_UNAVAILABLE', 'Gmail profile lookup failed', {
        cause: error,
      });
    }
  }

  public async importMessage(rawMessage: string): Promise<GmailMessageImportResult> {
    const encodedMessage = encodeRfc822Message(rawMessage);
    let gmail: gmail_v1.Gmail;
    try {
      gmail = this.gmailClient();
    } catch (error) {
      if (error instanceof GoogleClientConfigurationError) {
        throw new GmailProviderError('PROVIDER_CONFIGURATION', error.message, { cause: error });
      }
      throw error;
    }

    try {
      const response = await this.withTimeout(
        gmail.users.messages.import({
          userId: this.config.GOOGLE_GMAIL_USER_ID,
          internalDateSource: 'dateHeader',
          processForCalendar: false,
          requestBody: { raw: encodedMessage },
        }),
      );
      const messageId = response.data.id;
      if (typeof messageId !== 'string' || messageId.length === 0) {
        throw new GmailProviderError(
          'PROVIDER_INVALID_RESPONSE',
          `Gmail import response is missing a message id (received fields: ${responseFields(response.data)})`,
        );
      }
      let threadId = response.data.threadId;
      if (typeof threadId !== 'string' || threadId.length === 0) {
        const fetchedMessage = await this.withTimeout(
          gmail.users.messages.get({
            userId: this.config.GOOGLE_GMAIL_USER_ID,
            id: messageId,
            format: 'minimal',
          }),
        );
        threadId = fetchedMessage.data.threadId;
      }
      if (typeof threadId !== 'string' || threadId.length === 0) {
        throw new GmailProviderError(
          'PROVIDER_INVALID_RESPONSE',
          `Gmail import response is missing a thread id (received fields: ${responseFields(response.data)})`,
        );
      }
      return { messageId, threadId };
    } catch (error) {
      if (error instanceof GmailProviderError) throw error;
      throw new GmailProviderError(
        'PROVIDER_UNAVAILABLE',
        `Gmail message import failed: ${describeGmailApiError(error)}`,
        { cause: error },
      );
    }
  }

  private async writeDraft(input: GmailDraftInput, draftId?: string): Promise<GmailDraftResult> {
    let gmail: gmail_v1.Gmail;
    try {
      gmail = this.gmailClient();
    } catch (error) {
      if (error instanceof GoogleClientConfigurationError) {
        throw new GmailProviderError('PROVIDER_CONFIGURATION', error.message, { cause: error });
      }
      throw error;
    }
    if (draftId === undefined && input.idempotencyKey !== undefined) {
      const existingDraftId = await this.findDraftByIdempotencyKey(gmail, input.idempotencyKey);
      if (existingDraftId !== null) return { draftId: existingDraftId };
    }
    const messageId =
      input.idempotencyKey === undefined
        ? undefined
        : this.messageIdForIdempotencyKey(input.idempotencyKey);
    const raw = Buffer.from(
      `To: ${this.headerValue(input.to)}\r\nSubject: ${this.headerValue(input.subject)}\r\n${
        messageId === undefined ? '' : `Message-ID: ${messageId}\r\n`
      }MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${input.html}`,
    ).toString('base64url');
    try {
      const response =
        draftId === undefined
          ? await this.withTimeout(
              gmail.users.drafts.create({
                userId: this.config.GOOGLE_GMAIL_USER_ID,
                requestBody: { message: { raw } },
              }),
            )
          : await this.withTimeout(
              gmail.users.drafts.update({
                userId: this.config.GOOGLE_GMAIL_USER_ID,
                id: draftId,
                requestBody: { message: { raw } },
              }),
            );
      if (typeof response.data.id !== 'string')
        throw new GmailProviderError(
          'PROVIDER_INVALID_RESPONSE',
          'Gmail draft response is missing an id',
        );
      return { draftId: response.data.id };
    } catch (error) {
      if (error instanceof GmailProviderError) throw error;
      throw new GmailProviderError('PROVIDER_UNAVAILABLE', 'Gmail draft request failed', {
        cause: error,
      });
    }
  }

  private gmailClient(): gmail_v1.Gmail {
    const auth = createGmailOAuthClient({
      GOOGLE_GMAIL_CLIENT_ID: this.config.GOOGLE_GMAIL_CLIENT_ID,
      GOOGLE_GMAIL_CLIENT_SECRET: this.config.GOOGLE_GMAIL_CLIENT_SECRET,
      GOOGLE_GMAIL_REFRESH_TOKEN: this.config.GOOGLE_GMAIL_REFRESH_TOKEN,
    });
    return google.gmail({ version: 'v1', auth });
  }

  private async fetchMessage(gmail: gmail_v1.Gmail, messageId: string): Promise<GmailMessage> {
    const response = await this.withTimeout(
      gmail.users.messages.get({
        userId: this.config.GOOGLE_GMAIL_USER_ID,
        id: messageId,
        format: 'full',
      }),
    );
    const data = response.data;
    const headers = new Map(
      (data.payload?.headers ?? [])
        .filter(
          (header): header is { name: string; value: string } =>
            typeof header.name === 'string' && typeof header.value === 'string',
        )
        .map((header) => [header.name.toLowerCase(), header.value]),
    );
    const body = this.extractBody(data.payload);
    const receivedAt =
      data.internalDate === undefined ? new Date() : new Date(Number(data.internalDate));
    const sender = headers.get('from');
    if (typeof data.id !== 'string' || typeof data.threadId !== 'string' || sender === undefined) {
      throw new GmailProviderError(
        'PROVIDER_INVALID_RESPONSE',
        'Gmail message is missing required fields',
      );
    }
    return {
      messageId: data.id,
      threadId: data.threadId,
      from: sender,
      ...(headers.get('to') === undefined ? {} : { to: headers.get('to') }),
      subject: headers.get('subject') ?? '(no subject)',
      body,
      receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    };
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (payload === undefined) {
      return '';
    }
    if (payload.mimeType === 'text/plain' && typeof payload.body?.data === 'string') {
      return this.decodeBody(payload.body.data);
    }
    for (const part of payload.parts ?? []) {
      const body = this.extractBody(part);
      if (body.length > 0) {
        return body;
      }
    }
    return typeof payload.body?.data === 'string' ? this.decodeBody(payload.body.data) : '';
  }

  private decodeBody(data: string): string {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  }

  private headerValue(value: string): string {
    return value.replace(/[\r\n]+/g, ' ');
  }

  private messageIdForIdempotencyKey(key: string): string {
    const safeKey = key.replace(/[^A-Za-z0-9._-]/g, '-');
    return `<showcase-${safeKey}@bestairbnb.local>`;
  }

  private async findDraftByIdempotencyKey(
    gmail: gmail_v1.Gmail,
    key: string,
  ): Promise<string | null> {
    try {
      const response = await this.withTimeout(
        gmail.users.drafts.list({
          userId: this.config.GOOGLE_GMAIL_USER_ID,
          q: `rfc822msgid:${this.messageIdForIdempotencyKey(key)}`,
          maxResults: 1,
        }),
      );
      const draftId = response.data.drafts?.[0]?.id;
      return typeof draftId === 'string' ? draftId : null;
    } catch (error) {
      if (error instanceof GmailProviderError) throw error;
      throw new GmailProviderError('PROVIDER_UNAVAILABLE', 'Gmail draft lookup failed', {
        cause: error,
      });
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(new GmailProviderError('PROVIDER_TIMEOUT', 'Gmail provider request timed out')),
        REQUEST_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}

function describeGmailApiError(error: unknown): string {
  const response = isRecord(error) ? toRecord(error.response) : undefined;
  const responseData = response === undefined ? undefined : toRecord(response.data);
  const apiError = responseData === undefined ? undefined : toRecord(responseData.error);
  const apiErrors = apiError?.errors;
  const firstReason =
    Array.isArray(apiErrors) && apiErrors.length > 0 && isRecord(apiErrors[0])
      ? apiErrors[0].reason
      : undefined;
  const status = typeof response?.status === 'number' ? `HTTP ${response.status}` : undefined;
  const reason = typeof firstReason === 'string' ? firstReason : undefined;
  const message = typeof apiError?.message === 'string' ? apiError.message : undefined;
  const fallback = error instanceof Error ? error.message : undefined;
  const prefix = [status, reason].filter(isNonEmptyString).join(' ');
  if (message !== undefined) return prefix.length > 0 ? `${prefix}: ${message}` : message;
  return [prefix, fallback ?? 'unknown error'].filter(isNonEmptyString).join(' ');
}

function responseFields(value: unknown): string {
  if (!isRecord(value)) return 'none';
  const fields = Object.keys(value).sort();
  return fields.length === 0 ? 'none' : fields.join(', ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}
