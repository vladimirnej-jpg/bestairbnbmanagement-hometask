import type { LeadExtraction } from './lead-extraction.schema';

export interface LeadIntelligenceInput {
  readonly conversation: string;
  readonly currentContactEmail?: string | null;
  readonly currentContactName?: string | null;
  readonly currentRawAddress?: string | null;
}

export interface LeadIntelligenceResult {
  readonly extraction: LeadExtraction;
  readonly provider: string;
  readonly model?: string;
  readonly tokenUsage?: { readonly input?: number; readonly output?: number };
}

export interface LeadIntelligenceProvider {
  extractLead(input: LeadIntelligenceInput): Promise<LeadIntelligenceResult>;
}

export const LEAD_INTELLIGENCE_PROVIDER = Symbol('LEAD_INTELLIGENCE_PROVIDER');

export class LeadIntelligenceProviderError extends Error {
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
    this.name = 'LeadIntelligenceProviderError';
  }
}
