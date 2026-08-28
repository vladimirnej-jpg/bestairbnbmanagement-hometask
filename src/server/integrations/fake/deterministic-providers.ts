import type { CalendarEvent, CalendarProvider } from '../google/calendar.provider';
import type {
  GmailDraftInput,
  GmailDraftResult,
  GmailMessage,
  GmailProvider,
} from '../google/gmail.provider';
import type { GeocodingProvider, GeocodingResult } from '../geocoding/geocoding.provider';
import type {
  LeadIntelligenceInput,
  LeadIntelligenceProvider,
  LeadIntelligenceResult,
} from '../openrouter/lead-intelligence.provider';
import type {
  MasterDataProvider,
  MasterDataSnapshot,
} from '../../modules/master-data/master-data-provider';
import { parseAddressComponents } from '../../modules/properties/address-normalizer';
import { emptyPropertyAddress } from '../../shared/address-components';

export const testMasterDataSnapshot: MasterDataSnapshot = {
  properties: [
    {
      externalId: 'test-property-001',
      addressLine1: '10 Example Street',
      city: 'Amsterdam',
      postcode: '1012 AB',
      contactEmail: 'owner@example.test',
    },
  ],
  serviceZones: [
    {
      externalId: 'test-zone-amsterdam',
      name: 'Amsterdam',
      city: 'Amsterdam',
      postcodePrefixes: ['10'],
    },
  ],
  services: [
    {
      externalId: 'test-service-cleaning',
      name: 'Professional cleaning',
      description: 'Turnover cleaning between guest stays.',
    },
  ],
  zoneServices: [
    {
      serviceZoneExternalId: 'test-zone-amsterdam',
      serviceExternalId: 'test-service-cleaning',
    },
  ],
};

export function createTestMasterDataProvider(): MasterDataProvider {
  return { fetchSnapshot: async () => structuredClone(testMasterDataSnapshot) };
}

export function createStagedTestGmailProvider(): GmailProvider {
  let syncCount = 0;
  const draftsByKey = new Map<string, string>();
  const drafts = new Map<string, GmailDraftInput>();
  const firstMessage: GmailMessage = {
    messageId: 'test-message-alex-001',
    threadId: 'test-thread-alex',
    from: 'Alex Example <alex@example.test>',
    to: 'sales@bestairbnb.test',
    subject: 'Cleaning request',
    body: 'Name: Alex Example\nHello, I will send the address shortly.',
    receivedAt: new Date('2026-08-25T08:00:00.000Z'),
  };
  const followUp: GmailMessage = {
    messageId: 'test-message-alex-002',
    threadId: 'test-thread-alex',
    from: 'Alex Example <alex@example.test>',
    to: 'sales@bestairbnb.test',
    subject: 'Re: Cleaning request',
    body: 'Address: 10 Example Street, Amsterdam, 1012 AB\nPlease share next steps.',
    receivedAt: new Date('2026-08-25T08:05:00.000Z'),
  };
  return {
    async listLeadMessages(): Promise<readonly GmailMessage[]> {
      syncCount += 1;
      return syncCount === 1 ? [firstMessage] : [firstMessage, followUp];
    },
    async createDraft(input: GmailDraftInput): Promise<GmailDraftResult> {
      const key = input.idempotencyKey ?? `draft-${drafts.size + 1}`;
      const draftId = draftsByKey.get(key) ?? `test-draft-${drafts.size + 1}`;
      draftsByKey.set(key, draftId);
      drafts.set(draftId, input);
      return { draftId };
    },
    async updateDraft(draftId: string, input: GmailDraftInput): Promise<GmailDraftResult> {
      drafts.set(draftId, input);
      return { draftId };
    },
  };
}

export const testLeadIntelligenceProvider: LeadIntelligenceProvider = {
  async extractLead(input: LeadIntelligenceInput): Promise<LeadIntelligenceResult> {
    const email =
      input.currentContactEmail ??
      input.conversation.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ??
      null;
    const name =
      input.currentContactName ?? input.conversation.match(/name:\s*(.+)/i)?.[1]?.trim() ?? null;
    const rawAddress =
      input.currentRawAddress ?? input.conversation.match(/address:\s*(.+)/i)?.[1]?.trim() ?? null;
    const propertyAddress =
      rawAddress === null ? emptyPropertyAddress : parseAddressComponents(rawAddress);
    return {
      extraction: { contactEmail: email, contactName: name, propertyAddress, confidence: 0.92 },
      provider: 'test',
      model: 'deterministic-test-double',
    };
  },
};

export const testGeocodingProvider: GeocodingProvider = {
  source: 'test',
  async geocode(address: string): Promise<GeocodingResult | null> {
    const normalized = address.trim().replace(/\s+/g, ' ');
    return normalized.length === 0
      ? null
      : { canonicalAddress: normalized, confidence: 0.9, source: 'test' };
  },
};

export const testCalendarProvider: CalendarProvider = {
  async listUpcomingEvents(): Promise<readonly CalendarEvent[]> {
    return [
      {
        eventId: 'test-calendar-001',
        title: 'Initial property call',
        startAt: new Date('2026-08-28T10:00:00.000Z'),
        endAt: new Date('2026-08-28T10:30:00.000Z'),
        attendeeEmails: ['alex@example.test'],
      },
    ];
  },
};

export function setTestProviderEnvironment(): void {
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID ??= 'test-spreadsheet';
  process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64 ??= 'dGVzdA==';
  process.env.GOOGLE_GMAIL_CLIENT_ID ??= 'test-client-id';
  process.env.GOOGLE_GMAIL_CLIENT_SECRET ??= 'test-client-secret';
  process.env.GOOGLE_GMAIL_REFRESH_TOKEN ??= 'test-refresh-token';
  process.env.OPENROUTER_API_KEY ??= 'test-openrouter-key';
}
