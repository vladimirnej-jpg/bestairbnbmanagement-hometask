import { formatDate } from '../../../api/client';
import type { MasterDataStatus } from '../../../api/sync';

export function SyncActions({
  status,
  gmailSyncing,
  masterDataSyncing,
  gmailQueued,
  masterDataQueued,
  onGmailSync,
  onMasterDataSync,
}: {
  readonly status: MasterDataStatus | undefined;
  readonly gmailSyncing: boolean;
  readonly masterDataSyncing: boolean;
  readonly gmailQueued: boolean;
  readonly masterDataQueued: boolean;
  readonly onGmailSync: () => void;
  readonly onMasterDataSync: () => void;
}): React.JSX.Element {
  const latest = status?.latestRun;
  return (
    <section className="sync-card panel" aria-labelledby="sync-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Connected sources</span>
          <h2 id="sync-title">Keep sources fresh</h2>
        </div>
        <span
          className={`sync-dot ${latest?.status === 'FAILED' ? 'sync-dot-danger' : ''}`}
          aria-label={latest?.status ?? 'No sync yet'}
        />
      </div>
      <p className="panel-copy">
        Leads and the service catalogue stay owned by Gmail and Google Sheets. Sync them here before
        reviewing new work.
      </p>
      <div className="sync-status-grid">
        <div>
          <span>Master data</span>
          <strong>
            {status?.lastSuccessfulSyncAt
              ? formatDate(status.lastSuccessfulSyncAt)
              : 'Never synced'}
          </strong>
          <small>
            {latest?.status === 'FAILED'
              ? (latest.errorMessage ?? 'Last run failed')
              : status?.hasSuccessfulProjection
                ? 'Projection available'
                : 'Waiting for first projection'}
          </small>
        </div>
        <div>
          <span>Last run</span>
          <strong>
            {latest ? formatDate(latest.finishedAt ?? latest.startedAt) : 'No run yet'}
          </strong>
          <small>{latest?.trigger ?? 'Manual sync'}</small>
        </div>
      </div>
      <div className="button-row">
        <button
          className="button button-secondary"
          type="button"
          onClick={onMasterDataSync}
          disabled={masterDataSyncing || masterDataQueued}
        >
          {masterDataSyncing
            ? 'Starting Sheet sync...'
            : masterDataQueued
              ? 'Sheet sync queued...'
              : 'Sync master data'}
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={onGmailSync}
          disabled={gmailSyncing || gmailQueued}
        >
          {gmailSyncing
            ? 'Starting Gmail sync...'
            : gmailQueued
              ? 'Gmail sync queued...'
              : 'Sync Gmail'}
        </button>
      </div>
      {masterDataQueued || gmailQueued ? (
        <p className="sync-queued" role="status" aria-live="polite">
          {masterDataQueued && gmailQueued
            ? 'Both background syncs are queued. This page will update when they finish.'
            : masterDataQueued
              ? 'Master data is queued. The projection status will update when it finishes.'
              : 'Gmail is queued. Lead changes will appear when ingestion and processing finish.'}
        </p>
      ) : null}
    </section>
  );
}
