import type { ShowcaseContent as SharedShowcaseContent } from '@/emails/showcase-email.types';

import { apiFetch } from './client';
import type { QueuedWorkflow } from './sync';

export type LifecycleStatus = 'INCOMING' | 'SCHEDULED_INITIAL_APPOINTMENT' | 'WARM' | 'GONE_COLD';
export type QualificationStatus = 'NEEDS_INFO' | 'NEEDS_REVIEW' | 'QUALIFIED' | 'OUT_OF_ZONE';
export type ShowcaseStatus = 'NOT_READY' | 'READY' | 'BLOCKED' | 'DRAFT_CREATED' | 'FAILED';

export interface LeadListItem {
  readonly id: string;
  readonly contactEmail: string | null;
  readonly contactName: string | null;
  readonly lifecycleStatus: LifecycleStatus;
  readonly qualificationStatus: QualificationStatus;
  readonly qualificationReason: string | null;
  readonly showcaseStatus: ShowcaseStatus | null;
  readonly processingStatus: string | null;
  readonly updatedAt: string;
}

export interface LeadListResponse {
  readonly items: readonly LeadListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface LeadMessage {
  readonly id: string;
  readonly gmailMessageId: string;
  readonly sender: string;
  readonly subject: string;
  readonly body: string;
  readonly receivedAt: string;
}

export interface MasterProperty {
  readonly id: string;
  readonly addressLine1: string;
  readonly city: string;
  readonly postcode: string;
  readonly normalizedStreet: string | null;
  readonly normalizedHouseNumber: string | null;
  readonly normalizedCity: string | null;
  readonly normalizedPostcode: string | null;
  readonly isActive: boolean;
  readonly isMissing: boolean;
}

export interface PropertyMatchCandidate {
  readonly id: string;
  readonly masterPropertyId: string;
  readonly matchType: 'EXACT_ADDRESS' | 'CONTACT_HISTORY' | 'AMBIGUOUS';
  readonly confidence: number;
  readonly reviewStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  readonly createdAt: string;
  readonly masterProperty: MasterProperty;
}

export interface LeadProperty {
  readonly id: string;
  readonly leadId: string;
  readonly rawAddress: string;
  readonly country: string | null;
  readonly unit: string | null;
  readonly normalizedStreet: string | null;
  readonly normalizedHouseNumber: string | null;
  readonly normalizedCity: string | null;
  readonly normalizedPostcode: string | null;
  readonly canonicalAddress: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly confidence: number | null;
  readonly enrichmentStatus: 'NOT_ATTEMPTED' | 'SUCCEEDED' | 'NOT_FOUND' | 'FAILED';
  readonly enrichmentSource: string | null;
  readonly enrichmentErrorCode: string | null;
  readonly enrichedAt: string | null;
  readonly masterPropertyId: string | null;
  readonly manuallyConfirmedAt: string | null;
  readonly masterProperty: MasterProperty | null;
  readonly matchCandidates: readonly PropertyMatchCandidate[];
}

export type ShowcaseContent = SharedShowcaseContent;

export interface Showcase {
  readonly id: string;
  readonly leadId: string;
  readonly status: ShowcaseStatus;
  readonly blockingReason: string | null;
  readonly structuredContent: ShowcaseContent | null;
  readonly renderedHtml: string | null;
  readonly gmailDraftId: string | null;
  readonly manuallyEditedAt: string | null;
  readonly updatedAt: string;
}

export interface ProcessingRun {
  readonly id: string;
  readonly leadId: string;
  readonly step: string;
  readonly status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  readonly attempt: number;
  readonly errorCode: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly tokenUsage: unknown;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
}

export interface LifecycleEvent {
  readonly id: string;
  readonly fromStatus: LifecycleStatus | null;
  readonly toStatus: LifecycleStatus;
  readonly actorType: 'SYSTEM' | 'USER';
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly timestamp: string;
  readonly actor?: {
    readonly id: string;
    readonly email: string;
    readonly role: 'OPS' | 'MONITOR';
  } | null;
}

export interface LeadDetail {
  readonly id: string;
  readonly gmailThreadId: string;
  readonly contactEmail: string | null;
  readonly contactName: string | null;
  readonly lifecycleStatus: LifecycleStatus;
  readonly qualificationStatus: QualificationStatus;
  readonly qualificationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly LeadMessage[];
  readonly property: LeadProperty | null;
  readonly showcase: Showcase | null;
  readonly processingRuns: readonly ProcessingRun[];
  readonly lifecycleEvents: readonly LifecycleEvent[];
  readonly serviceZone: 'inside' | 'outside' | 'unknown';
  readonly services: readonly string[];
}

export interface LeadFilters {
  readonly lifecycleStatus?: LifecycleStatus;
  readonly qualificationStatus?: QualificationStatus;
  readonly showcaseStatus?: ShowcaseStatus;
  readonly search?: string;
}

export async function listLeads(
  accessToken: string,
  filters: LeadFilters = {},
): Promise<LeadListResponse> {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value.length > 0) params.set(key, value);
  }
  return apiFetch<LeadListResponse>(`/leads?${params.toString()}`, { accessToken });
}

export function getLead(accessToken: string, leadId: string): Promise<LeadDetail> {
  return apiFetch<LeadDetail>(`/leads/${encodeURIComponent(leadId)}`, { accessToken });
}

export function updateLifecycle(
  accessToken: string,
  leadId: string,
  status: LifecycleStatus,
  reason?: string,
): Promise<LeadDetail> {
  return apiFetch<LeadDetail>(`/leads/${encodeURIComponent(leadId)}/lifecycle`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify({ status, ...(reason === undefined ? {} : { reason }) }),
  });
}

export function reprocessLead(accessToken: string, leadId: string): Promise<QueuedWorkflow> {
  return apiFetch<QueuedWorkflow>(`/leads/${encodeURIComponent(leadId)}/reprocess`, {
    method: 'POST',
    accessToken,
  });
}

export function confirmPropertyMatch(
  accessToken: string,
  leadId: string,
  masterPropertyId: string,
): Promise<void> {
  return apiFetch<void>(`/leads/${encodeURIComponent(leadId)}/property-match`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ masterPropertyId }),
  });
}

export function generateShowcase(
  accessToken: string,
  leadId: string,
  overwriteManual = false,
): Promise<Showcase> {
  return apiFetch<Showcase>(`/leads/${encodeURIComponent(leadId)}/showcase/generate`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ overwriteManual }),
  });
}

export function saveShowcase(
  accessToken: string,
  leadId: string,
  content: ShowcaseContent,
): Promise<Showcase> {
  return apiFetch<Showcase>(`/leads/${encodeURIComponent(leadId)}/showcase`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(content),
  });
}

export function syncShowcaseToGmail(
  accessToken: string,
  leadId: string,
): Promise<{ readonly draftId: string }> {
  return apiFetch<{ readonly draftId: string }>(
    `/leads/${encodeURIComponent(leadId)}/showcase/sync-to-gmail`,
    { method: 'POST', accessToken },
  );
}
