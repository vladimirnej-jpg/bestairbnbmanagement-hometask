'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, formatDate } from '../../../api/client';
import {
  listLeads,
  type LeadFilters,
  type LifecycleStatus,
  type QualificationStatus,
  type ShowcaseStatus,
} from '../../../api/leads';
import { getSyncStatus, syncGmail, syncMasterData } from '../../../api/sync';
import { LeadQueue } from '../../../features/leads/components/lead-queue';
import { SyncActions } from '../../../features/sync/components/sync-actions';
import { useAuth } from '../../../providers/auth-provider';
import { ErrorState, LoadingState } from '../../../components/ui/data-state';
import { SectionHeading, StatusBadge } from '../../../components/ui/status-badge';
import { Toast } from '../../../components/ui/toast';
import { ProtectedPage } from '../../../components/auth/protected-page';

export default function OperationsRoute(): React.JSX.Element {
  return (
    <ProtectedPage allowedRoles={['OPS']}>
      <OperationsPage />
    </ProtectedPage>
  );
}

function OperationsPage(): React.JSX.Element {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<LeadFilters>({});
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [gmailQueuedAt, setGmailQueuedAt] = useState<number | null>(null);
  const [gmailBaseline, setGmailBaseline] = useState<string | null>(null);
  const [masterDataQueuedAt, setMasterDataQueuedAt] = useState<number | null>(null);
  const [masterDataBaselineRunId, setMasterDataBaselineRunId] = useState<string | null>(null);
  const token = auth?.accessToken ?? '';
  const leadsQuery = useQuery({
    queryKey: ['leads', filters],
    queryFn: () => listLeads(token, filters),
    enabled: auth !== null,
    refetchInterval: gmailQueuedAt === null ? false : 2_000,
  });
  const syncQuery = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => getSyncStatus(token),
    enabled: auth !== null,
    refetchInterval: masterDataQueuedAt === null ? 60_000 : 2_000,
  });
  const notify = (message: string, tone: 'success' | 'error' = 'success'): void => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 5_000);
  };
  const gmailMutation = useMutation({
    mutationFn: () => syncGmail(token),
    onSuccess: async (result) => {
      setGmailBaseline(leadSignature(leadsQuery.data?.items ?? []));
      setGmailQueuedAt(Date.now());
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      notify(`Gmail sync queued (${result.eventId}). Lead changes will update shortly.`);
    },
    onError: (error) =>
      notify(error instanceof ApiError ? error.message : 'Gmail sync failed.', 'error'),
  });
  const masterMutation = useMutation({
    mutationFn: () => syncMasterData(token),
    onSuccess: async (result) => {
      setMasterDataBaselineRunId(syncQuery.data?.latestRun?.id ?? null);
      setMasterDataQueuedAt(Date.now());
      await queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      await queryClient.invalidateQueries({ queryKey: ['lead'] });
      notify(`Master-data sync queued (${result.eventId}). The projection will update shortly.`);
    },
    onError: (error) =>
      notify(error instanceof ApiError ? error.message : 'Master-data sync failed.', 'error'),
  });
  useEffect(() => {
    if (gmailQueuedAt === null) return;
    const timeout = window.setTimeout(() => {
      setGmailQueuedAt(null);
      setGmailBaseline(null);
      notify('Gmail sync is still queued. The lead queue will refresh on the next poll.', 'error');
    }, 60_000);
    return () => window.clearTimeout(timeout);
  }, [gmailQueuedAt]);
  useEffect(() => {
    if (gmailQueuedAt === null || leadsQuery.isFetching || gmailBaseline === null) return;
    if (leadSignature(leadsQuery.data?.items ?? []) === gmailBaseline) return;
    setGmailQueuedAt(null);
    setGmailBaseline(null);
    notify('Gmail sync and lead processing completed.');
    void queryClient.invalidateQueries({ queryKey: ['sync-status'] });
  }, [gmailBaseline, gmailQueuedAt, leadsQuery.data, leadsQuery.isFetching, queryClient]);
  useEffect(() => {
    if (masterDataQueuedAt === null) return;
    const timeout = window.setTimeout(() => {
      setMasterDataQueuedAt(null);
      setMasterDataBaselineRunId(null);
      notify(
        'Master-data sync is still queued. The projection status will refresh shortly.',
        'error',
      );
    }, 60_000);
    return () => window.clearTimeout(timeout);
  }, [masterDataQueuedAt]);
  useEffect(() => {
    const latestRun = syncQuery.data?.latestRun;
    if (
      masterDataQueuedAt === null ||
      latestRun === null ||
      latestRun === undefined ||
      latestRun.id === masterDataBaselineRunId ||
      latestRun.status === 'RUNNING'
    ) {
      return;
    }
    setMasterDataQueuedAt(null);
    setMasterDataBaselineRunId(null);
    notify(
      latestRun.status === 'FAILED'
        ? 'Master-data sync failed. Check the latest run details.'
        : 'Master-data sync completed.',
      latestRun.status === 'FAILED' ? 'error' : 'success',
    );
  }, [masterDataBaselineRunId, masterDataQueuedAt, syncQuery.data?.latestRun]);
  if (leadsQuery.isPending || syncQuery.isPending)
    return (
      <div className="page-wrap">
        <LoadingState label="Loading operations" />
      </div>
    );
  if (leadsQuery.isError)
    return (
      <div className="page-wrap">
        <ErrorState
          message={
            leadsQuery.error instanceof ApiError
              ? leadsQuery.error.message
              : 'The lead queue is unavailable.'
          }
          retry={() => {
            void leadsQuery.refetch();
          }}
        />
      </div>
    );
  return (
    <div className="page-wrap">
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
      <header className="page-header">
        <div>
          <span className="eyebrow">Operations / live queue</span>
          <h1>Lead operations</h1>
          <p>Make the next decision clear before anything reaches a customer.</p>
        </div>
        <div className="header-meta">
          <span className="live-indicator">
            <span aria-hidden="true" /> Live workspace
          </span>
          <span className="muted">Updated {formatDate(new Date().toISOString())}</span>
        </div>
      </header>
      <div className="ops-top-grid">
        <SyncActions
          status={syncQuery.data}
          gmailSyncing={gmailMutation.isPending}
          masterDataSyncing={masterMutation.isPending}
          gmailQueued={gmailQueuedAt !== null}
          masterDataQueued={masterDataQueuedAt !== null}
          onGmailSync={() => gmailMutation.mutate()}
          onMasterDataSync={() => masterMutation.mutate()}
        />
        <div className="queue-summary panel">
          <span className="eyebrow">Queue pulse</span>
          <strong>{leadsQuery.data.total}</strong>
          <p>leads in the current view</p>
          <div className="summary-statuses">
            <span>
              <StatusBadge value="NEEDS_REVIEW" /> review
            </span>
            <span>
              <StatusBadge value="QUALIFIED" /> ready
            </span>
          </div>
        </div>
      </div>
      <section className="queue-section" aria-labelledby="queue-title">
        <SectionHeading
          eyebrow="Human-in-the-loop"
          title="Lead queue"
          action={
            <span className="muted">
              Showing {leadsQuery.data.items.length} of {leadsQuery.data.total}
            </span>
          }
        />
        <div className="filter-bar" role="search">
          <div className="form-field form-field-search">
            <label htmlFor="lead-search">Search leads</label>
            <input
              id="lead-search"
              type="search"
              value={filters.search ?? ''}
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value || undefined }))
              }
              placeholder="Name, email, address..."
            />
          </div>
          <FilterSelect
            id="qualification-filter"
            label="Qualification"
            value={filters.qualificationStatus ?? ''}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                qualificationStatus: (value as QualificationStatus) || undefined,
              }))
            }
            options={['NEEDS_INFO', 'NEEDS_REVIEW', 'QUALIFIED', 'OUT_OF_ZONE']}
          />
          <FilterSelect
            id="showcase-filter"
            label="Showcase"
            value={filters.showcaseStatus ?? ''}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                showcaseStatus: (value as ShowcaseStatus) || undefined,
              }))
            }
            options={['NOT_READY', 'READY', 'BLOCKED', 'DRAFT_CREATED', 'FAILED']}
          />
          <FilterSelect
            id="lifecycle-filter"
            label="Lifecycle"
            value={filters.lifecycleStatus ?? ''}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                lifecycleStatus: (value as LifecycleStatus) || undefined,
              }))
            }
            options={['INCOMING', 'SCHEDULED_INITIAL_APPOINTMENT', 'WARM', 'GONE_COLD']}
          />
          <button
            className="button button-quiet filter-reset"
            type="button"
            onClick={() => setFilters({})}
          >
            Reset
          </button>
        </div>
        <LeadQueue leads={leadsQuery.data.items} />
      </section>
    </div>
  );
}

function leadSignature(
  leads: readonly { readonly id: string; readonly updatedAt: string }[],
): string {
  return leads.map((lead) => `${lead.id}:${lead.updatedAt}`).join('|');
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </div>
  );
}
