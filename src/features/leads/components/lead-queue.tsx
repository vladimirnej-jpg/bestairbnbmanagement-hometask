import Link from 'next/link';

import { formatDate } from '../../../api/client';
import type { LeadListItem } from '../../../api/leads';
import { EmptyState } from '../../../components/ui/data-state';
import { StatusBadge } from '../../../components/ui/status-badge';

export function LeadQueue({
  leads,
}: {
  readonly leads: readonly LeadListItem[];
}): React.JSX.Element {
  if (leads.length === 0)
    return (
      <EmptyState
        title="No leads match these filters"
        description="Try widening the queue filters or run a Gmail sync to ingest new conversations."
      />
    );
  return (
    <div className="table-wrap">
      <table className="lead-table">
        <caption className="sr-only">Lead operations queue</caption>
        <thead>
          <tr>
            <th scope="col">Lead</th>
            <th scope="col">Qualification</th>
            <th scope="col">Showcase</th>
            <th scope="col">Lifecycle</th>
            <th scope="col">Updated</th>
            <th scope="col">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td>
                <div className="lead-cell">
                  <strong>{lead.contactName ?? 'Unknown contact'}</strong>
                  <span>{lead.contactEmail ?? 'No email captured'}</span>
                </div>
              </td>
              <td>
                <div className="qualification-cell">
                  <StatusBadge value={lead.qualificationStatus} />
                  {lead.qualificationReason ? (
                    <small className="qualification-reason">{lead.qualificationReason}</small>
                  ) : null}
                </div>
              </td>
              <td>
                {lead.showcaseStatus ? (
                  <StatusBadge value={lead.showcaseStatus} />
                ) : (
                  <span className="muted">Not started</span>
                )}
              </td>
              <td>
                <StatusBadge value={lead.lifecycleStatus} />
              </td>
              <td className="muted">{formatDate(lead.updatedAt)}</td>
              <td>
                <Link className="table-link" href={`/ops/leads/${lead.id}`}>
                  Review <span aria-hidden="true">→</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
