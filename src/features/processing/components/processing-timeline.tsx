import { formatDate } from '../../../api/client';
import type { ProcessingRun } from '../../../api/leads';
import { StatusBadge } from '../../../components/ui/status-badge';

export function ProcessingTimeline({
  runs,
}: {
  readonly runs: readonly ProcessingRun[];
}): React.JSX.Element {
  return (
    <section className="panel" aria-labelledby="processing-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Automation trace</span>
          <h2 id="processing-title">Processing timeline</h2>
        </div>
      </div>
      {runs.length === 0 ? (
        <p className="muted">No processing runs recorded.</p>
      ) : (
        <ol className="timeline">
          {runs.map((run) => (
            <li key={run.id}>
              <span
                className={`timeline-dot timeline-${run.status.toLowerCase()}`}
                aria-hidden="true"
              />
              <div className="timeline-content">
                <div>
                  <strong>{run.step.replaceAll('_', ' ')}</strong>
                  <StatusBadge value={run.status} />
                </div>
                <p>
                  {run.errorCode
                    ? `Error: ${run.errorCode}`
                    : `${run.provider ?? 'System'}${run.model ? ` · ${run.model}` : ''}`}
                </p>
                <time dateTime={run.createdAt}>
                  {formatDate(run.finishedAt ?? run.startedAt ?? run.createdAt)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
