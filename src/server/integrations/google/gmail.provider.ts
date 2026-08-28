export interface GmailMessage {
  readonly messageId: string;
  readonly threadId: string;
  readonly from: string;
  readonly to?: string;
  readonly subject: string;
  readonly body: string;
  readonly receivedAt: Date;
}

export interface GmailProvider {
  listLeadMessages(): Promise<readonly GmailMessage[]>;
  createDraft(input: GmailDraftInput): Promise<GmailDraftResult>;
  updateDraft(draftId: string, input: GmailDraftInput): Promise<GmailDraftResult>;
}

export interface GmailDraftInput {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly idempotencyKey?: string;
}
export interface GmailDraftResult {
  readonly draftId: string;
}

export interface GmailMessageImportResult {
  readonly messageId: string;
  readonly threadId: string;
}

export const GMAIL_PROVIDER = Symbol('GMAIL_PROVIDER');

export class GmailProviderError extends Error {
  public constructor(
    public readonly code:
      | 'PROVIDER_CONFIGURATION'
      | 'PROVIDER_UNAVAILABLE'
      | 'PROVIDER_TIMEOUT'
      | 'PROVIDER_INVALID_RESPONSE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GmailProviderError';
  }
}
