import Link from 'next/link';

import { formatDate } from '../../../api/client';
import type { MonitoringOverview as Overview } from '../../../api/monitoring';
import { SectionHeading, StatusBadge, formatStatus } from '../../../components/ui/status-badge';

export function MonitoringOverview({
  overview,
  canOpenLeads = true,
}: {
  readonly overview: Overview;
  readonly canOpenLeads?: boolean;
}): React.JSX.Element {
  const metrics = [
    {
      label: 'Total leads',
      value: overview.leads.total,
      note: 'Across all lifecycle stages',
      tone: 'neutral',
    },
    {
      label: 'Needs review',
      value: overview.leads.attention.needsReview,
      note: 'Qualification decisions waiting',
      tone: 'warning',
    },
    {
      label: 'Blocked showcases',
      value: overview.leads.attention.blockedShowcases,
      note: 'Readiness gates closed',
      tone: 'danger',
    },
    {
      label: 'Failed processing',
      value: overview.leads.attention.failedProcessing,
      note: 'Runs needing attention',
      tone: 'danger',
    },
  ];
  return (
    <div className="monitoring-stack">
      <div className="metric-grid">
        {metrics.map((metric) => (
          <div className={`metric-card metric-${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </div>
        ))}
      </div>
      <div className="monitoring-grid">
        <section className="panel" aria-labelledby="pipeline-title">
          <SectionHeading eyebrow="Pipeline" title="Lead distribution" />
          <div className="distribution-list">
            {Object.entries(overview.leads.byQualification).map(([status, count]) => (
              <div className="distribution-row" key={status}>
                <span>
                  <StatusBadge value={status} />
                </span>
                <strong>{count}</strong>
                <div className="distribution-track">
                  <span
                    style={{
                      width: `${overview.leads.total === 0 ? 0 : Math.min(100, (count / overview.leads.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="sources-title">
          <SectionHeading eyebrow="Providers" title="Source health" />
          <div className="health-list">
            <HealthRow
              label="Google Sheets"
              detail={
                overview.sync.hasSuccessfulProjection
                  ? `Synced ${formatDate(overview.sync.lastSuccessfulAt)}`
                  : 'No successful projection'
              }
              healthy={overview.sync.hasSuccessfulProjection}
            />
            {/* TODO: derive Gmail health from provider status instead of hardcoding true. */}
            <HealthRow
              label="Gmail ingestion"
              detail={`${overview.sync.gmail.messageCount} messages · ${formatDate(overview.sync.gmail.lastMessageAt)}`}
              healthy={true}
            />
            <HealthRow
              label="Google Calendar"
              detail={overview.calendar.warning ?? 'Upcoming events available'}
              healthy={overview.calendar.status === 'available'}
            />
          </div>
        </section>
      </div>
      <div className="monitoring-grid">
        <section className="panel" aria-labelledby="failures-title">
          <SectionHeading eyebrow="Action queue" title="Processing failures" />
          {overview.failedProcessing.length === 0 ? (
            <p className="muted">No failed processing runs.</p>
          ) : (
            <div className="compact-list">
              {overview.failedProcessing.slice(0, 6).map((failure) => {
                const content = (
                  <>
                    <span>
                      <strong>{failure.step.replaceAll('_', ' ')}</strong>
                      <small>
                        {failure.errorCode ?? 'Unknown error'} · {formatDate(failure.createdAt)}
                      </small>
                    </span>
                    {canOpenLeads ? <span aria-hidden="true">→</span> : null}
                  </>
                );
                return canOpenLeads ? (
                  <Link
                    className="compact-row"
                    key={`${failure.leadId}-${failure.createdAt}`}
                    href={`/ops/leads/${failure.leadId}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="compact-row" key={`${failure.leadId}-${failure.createdAt}`}>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="panel" aria-labelledby="calendar-title">
          <SectionHeading eyebrow="Next up" title="Calendar" />
          {overview.calendar.warning ? (
            <div className="provider-warning" role="status">
              {overview.calendar.warning}
            </div>
          ) : overview.calendar.events.length === 0 ? (
            <p className="muted">No upcoming events found.</p>
          ) : (
            <div className="compact-list">
              {overview.calendar.events.slice(0, 6).map((event) => (
                <div className="compact-row" key={event.eventId}>
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {formatDate(event.startAt)}
                      {event.relatedLeadId ? ' · linked lead' : ''}
                    </small>
                  </span>
                  {event.relatedLeadId && canOpenLeads ? (
                    <Link className="table-link" href={`/ops/leads/${event.relatedLeadId}`}>
                      Open
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="panel" aria-labelledby="activity-title">
        <SectionHeading eyebrow="Audit trail" title="Recent lifecycle activity" />
        {overview.recentActivity.length === 0 ? (
          <p className="muted">No lifecycle events yet.</p>
        ) : (
          <div className="activity-list">
            {overview.recentActivity.slice(0, 8).map((event, index) => (
              <div className="activity-row" key={`${event.leadId}-${event.timestamp}-${index}`}>
                <span className="activity-dot" aria-hidden="true" />
                <div>
                  <strong>
                    {event.fromStatus ? `${formatStatus(event.fromStatus)} → ` : ''}
                    {formatStatus(event.toStatus)}
                  </strong>
                  <small>
                    {event.reason ?? `${event.actorType.toLowerCase()} update`} ·{' '}
                    {formatDate(event.timestamp)}
                  </small>
                </div>
                {canOpenLeads ? (
                  <Link className="table-link" href={`/ops/leads/${event.leadId}`}>
                    Lead →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HealthRow({
  label,
  detail,
  healthy,
}: {
  readonly label: string;
  readonly detail: string;
  readonly healthy: boolean;
}): React.JSX.Element {
  return (
    <div className="health-row">
      <span
        className={`health-icon ${healthy ? 'health-ok' : 'health-warning'}`}
        aria-hidden="true"
      >
        {healthy ? '✓' : '!'}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <StatusBadge value={healthy ? 'SUCCEEDED' : 'FAILED'} />
    </div>
  );
}
