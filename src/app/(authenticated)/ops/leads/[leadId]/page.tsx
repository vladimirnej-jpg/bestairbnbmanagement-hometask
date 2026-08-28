'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { ApiError, formatDate } from '../../../../../api/client';
import {
  getLead,
  confirmPropertyMatch,
  generateShowcase,
  reprocessLead,
  saveShowcase,
  syncShowcaseToGmail,
  updateLifecycle,
  type LifecycleStatus,
  type ShowcaseContent,
} from '../../../../../api/leads';
import { ConversationPanel } from '../../../../../features/leads/components/conversation-panel';
import { QualificationPanel } from '../../../../../features/leads/components/qualification-panel';
import { PropertyHistory } from '../../../../../features/properties/components/property-history';
import { ProcessingTimeline } from '../../../../../features/processing/components/processing-timeline';
import { ShowcaseEditor } from '../../../../../features/showcases/components/showcase-editor';
import { ShowcasePreview } from '../../../../../features/showcases/components/showcase-preview';
import { useAuth } from '../../../../../providers/auth-provider';
import { ErrorState, LoadingState } from '../../../../../components/ui/data-state';
import {
  SectionHeading,
  StatusBadge,
  formatStatus,
} from '../../../../../components/ui/status-badge';
import { Toast } from '../../../../../components/ui/toast';
import { ProtectedPage } from '../../../../../components/auth/protected-page';

export default function LeadWorkspaceRoute(): React.JSX.Element {
  return (
    <ProtectedPage allowedRoles={['OPS']}>
      <LeadWorkspacePage />
    </ProtectedPage>
  );
}

function LeadWorkspacePage(): React.JSX.Element {
  const params = useParams<{ readonly leadId: string | string[] }>();
  const leadId = typeof params.leadId === 'string' ? params.leadId : params.leadId?.[0];
  const { auth } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [processingQueuedAt, setProcessingQueuedAt] = useState<number | null>(null);
  const [processingBaseline, setProcessingBaseline] = useState<string | null>(null);
  const token = auth?.accessToken ?? '';
  const leadQuery = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => getLead(token, leadId ?? ''),
    enabled: auth !== null && leadId !== undefined,
    refetchInterval: processingQueuedAt === null ? false : 2_000,
  });
  const notify = (message: string, tone: 'success' | 'error' = 'success'): void => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 5_000);
  };
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
    await queryClient.invalidateQueries({ queryKey: ['leads'] });
  };
  const mutationError =
    (message: string) =>
    (error: unknown): void =>
      notify(error instanceof ApiError ? error.message : message, 'error');
  const lifecycleMutation = useMutation({
    mutationFn: (status: LifecycleStatus) => updateLifecycle(token, leadId ?? '', status),
    onSuccess: async () => {
      await refresh();
      notify('Lifecycle updated.');
    },
    onError: mutationError('Could not update lifecycle.'),
  });
  const reprocessMutation = useMutation({
    mutationFn: () => reprocessLead(token, leadId ?? ''),
    onSuccess: (result) => {
      setProcessingBaseline(processingRunSignature(leadQuery.data?.processingRuns ?? []));
      setProcessingQueuedAt(Date.now());
      notify(`Lead processing queued (${result.eventId}).`);
    },
    onError: mutationError('Reprocessing failed.'),
  });
  useEffect(() => {
    if (processingQueuedAt === null) return;
    const timeout = window.setTimeout(() => {
      setProcessingQueuedAt(null);
      notify('Processing is still queued. The timeline will refresh on the next poll.', 'error');
    }, 60_000);
    return () => window.clearTimeout(timeout);
  }, [processingQueuedAt]);
  useEffect(() => {
    if (processingQueuedAt === null || processingBaseline === null || leadQuery.isFetching) return;
    if (processingRunSignature(leadQuery.data?.processingRuns ?? []) === processingBaseline) return;
    setProcessingQueuedAt(null);
    setProcessingBaseline(null);
    notify('Lead processing completed.');
  }, [leadQuery.data, leadQuery.isFetching, processingBaseline, processingQueuedAt]);
  const matchMutation = useMutation({
    mutationFn: (masterPropertyId: string) =>
      confirmPropertyMatch(token, leadId ?? '', masterPropertyId),
    onSuccess: async () => {
      await refresh();
      notify('Property match confirmed.');
    },
    onError: mutationError('Could not confirm this match.'),
  });
  const generateMutation = useMutation({
    mutationFn: (overwriteManual: boolean) =>
      generateShowcase(token, leadId ?? '', overwriteManual),
    onSuccess: async () => {
      await refresh();
      notify('Showcase generated from the current evidence.');
    },
    onError: mutationError('Showcase generation failed.'),
  });
  const saveMutation = useMutation({
    mutationFn: (content: ShowcaseContent) => saveShowcase(token, leadId ?? '', content),
    onSuccess: async () => {
      await refresh();
      notify('Showcase edits saved.');
    },
    onError: mutationError('Could not save showcase edits.'),
  });
  const gmailMutation = useMutation({
    mutationFn: () => syncShowcaseToGmail(token, leadId ?? ''),
    onSuccess: async (result) => {
      await refresh();
      notify('Gmail draft is ready to review.');
      window.open(
        `https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(result.draftId)}`,
        '_blank',
        'noopener,noreferrer',
      );
    },
    onError: mutationError('Could not create the Gmail draft.'),
  });
  const lead = leadQuery.data;
  const showcaseContent = useMemo(
    () => lead?.showcase?.structuredContent ?? null,
    [lead?.showcase?.structuredContent],
  );
  if (leadQuery.isPending)
    return (
      <div className="page-wrap">
        <LoadingState label="Loading lead workspace" />
      </div>
    );
  if (leadQuery.isError || lead === undefined)
    return (
      <div className="page-wrap">
        <ErrorState
          message={
            leadQuery.error instanceof ApiError
              ? leadQuery.error.message
              : 'This lead could not be loaded.'
          }
          retry={() => {
            void leadQuery.refetch();
          }}
        />
      </div>
    );
  const isQualified = lead.qualificationStatus === 'QUALIFIED';
  const showcaseReady =
    lead.showcase?.status === 'READY' || lead.showcase?.status === 'DRAFT_CREATED';
  const hasManualEdits =
    lead.showcase?.manuallyEditedAt !== null && lead.showcase?.manuallyEditedAt !== undefined;
  const gateMessage = !isQualified
    ? `Showcase actions are held while this lead is ${formatStatus(lead.qualificationStatus).toLowerCase()}. ${lead.qualificationReason ?? 'Required information is still missing.'}`
    : (lead.showcase?.blockingReason ?? null);
  return (
    <div className="page-wrap workspace-wrap">
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
      <div className="workspace-topline">
        <Link className="back-link" href="/ops">
          ← Back to queue
        </Link>
        <span className="muted">Lead ID {lead.id}</span>
      </div>
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Lead workspace</span>
          <h1>{lead.contactName ?? 'Unknown contact'}</h1>
          <p>
            {lead.contactEmail ?? 'No contact email captured'} · received{' '}
            {formatDate(lead.createdAt)}
          </p>
        </div>
        <div className="workspace-statuses">
          <StatusBadge value={lead.qualificationStatus} />
          <StatusBadge value={lead.lifecycleStatus} />
          <StatusBadge value={lead.showcase?.status ?? 'NOT_READY'} />
        </div>
      </header>
      {gateMessage ? (
        <div
          className={`decision-banner ${isQualified ? 'decision-banner-warning' : 'decision-banner-danger'}`}
          role="status"
        >
          <strong>{isQualified ? 'Showcase gate' : 'More information needed'}</strong>
          <span>{gateMessage}</span>
        </div>
      ) : null}
      <div className="workspace-grid">
        <div className="workspace-main">
          <ConversationPanel messages={lead.messages} />
          <section className="panel" aria-labelledby="property-title">
            <SectionHeading
              eyebrow="Master-data resolution"
              title="Property context"
              action={
                <StatusBadge
                  value={
                    lead.serviceZone === 'inside'
                      ? 'IN_ZONE'
                      : lead.serviceZone === 'outside'
                        ? 'OUT_OF_ZONE'
                        : 'UNKNOWN_ZONE'
                  }
                />
              }
            />
            <PropertyHistory
              property={lead.property}
              onConfirm={(masterPropertyId) => matchMutation.mutate(masterPropertyId)}
            />
            <div className="service-context">
              <div>
                <span className="eyebrow">Service zone</span>
                <strong>
                  {lead.serviceZone === 'inside'
                    ? 'Inside service area'
                    : lead.serviceZone === 'outside'
                      ? 'Outside service area'
                      : 'Not resolved'}
                </strong>
              </div>
              <div>
                <span className="eyebrow">Available services</span>
                <p>
                  {lead.services.length > 0
                    ? lead.services.join(' · ')
                    : 'No services resolved yet'}
                </p>
              </div>
            </div>
          </section>
          <ProcessingTimeline runs={lead.processingRuns} />
        </div>
        <aside className="workspace-side">
          <QualificationPanel lead={lead} />
          <section className="panel lifecycle-panel" aria-labelledby="lifecycle-title">
            <SectionHeading eyebrow="Human decision" title="Lifecycle" />
            <div className="form-field">
              <label htmlFor="lifecycle-status">Current lifecycle</label>
              <select
                id="lifecycle-status"
                value={lead.lifecycleStatus}
                onChange={(event) =>
                  lifecycleMutation.mutate(event.target.value as LifecycleStatus)
                }
                disabled={lifecycleMutation.isPending}
              >
                {['INCOMING', 'SCHEDULED_INITIAL_APPOINTMENT', 'WARM', 'GONE_COLD'].map(
                  (status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="button-row">
              <button
                className="button button-secondary button-full"
                type="button"
                onClick={() => reprocessMutation.mutate()}
                disabled={reprocessMutation.isPending}
              >
                {reprocessMutation.isPending ? 'Retrying...' : 'Retry processing'}
              </button>
            </div>
          </section>
        </aside>
      </div>
      <section className="showcase-section" aria-labelledby="showcase-title">
        <div className="showcase-section-heading">
          <div>
            <span className="eyebrow">Customer-ready output</span>
            <h2 id="showcase-title">Showcase studio</h2>
            <p>
              Generate only after qualification. Manual edits stay visible and are never silently
              overwritten.
            </p>
          </div>
          <div className="button-row">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                const overwrite = hasManualEdits
                  ? window.confirm('This showcase has manual edits. Regenerate and replace them?')
                  : false;
                if (!hasManualEdits || overwrite) generateMutation.mutate(overwrite);
              }}
              disabled={!isQualified || generateMutation.isPending}
            >
              {generateMutation.isPending
                ? 'Generating...'
                : hasManualEdits
                  ? 'Regenerate'
                  : 'Generate showcase'}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => gmailMutation.mutate()}
              disabled={!isQualified || !showcaseReady || gmailMutation.isPending}
            >
              {gmailMutation.isPending
                ? 'Creating draft...'
                : lead.showcase?.gmailDraftId
                  ? 'Update Gmail draft'
                  : 'Save to Gmail'}
            </button>
            {lead.showcase?.gmailDraftId ? (
              <a
                className="button button-quiet"
                href={`https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(lead.showcase.gmailDraftId)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open Gmail <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </div>
        </div>
        <div className="showcase-grid">
          <ShowcaseEditor
            content={showcaseContent}
            saving={saveMutation.isPending}
            disabled={!showcaseReady}
            onSave={(content) => saveMutation.mutate(content)}
          />
          <ShowcasePreview
            content={showcaseContent}
            renderedHtml={lead.showcase?.renderedHtml ?? null}
          />
        </div>
      </section>
      <button
        className="button button-quiet mobile-back"
        type="button"
        onClick={() => router.push('/ops')}
      >
        Back to queue
      </button>
    </div>
  );
}

function processingRunSignature(
  runs: readonly { readonly id: string; readonly status: string }[],
): string {
  return runs.map((run) => `${run.id}:${run.status}`).join('|');
}
