import { formatDate } from '../../../api/client';
import type { LeadProperty } from '../../../api/leads';

export function PropertyHistory({
  property,
  onConfirm,
}: {
  readonly property: LeadProperty | null;
  readonly onConfirm: (masterPropertyId: string) => void;
}): React.JSX.Element {
  if (property === null)
    return (
      <div className="property-history">
        <p className="muted">No property candidates yet. Add an address to start matching.</p>
      </div>
    );
  if (property.matchCandidates.length === 0)
    return (
      <div className="property-history">
        <p className="muted">No candidate matches found for this address.</p>
      </div>
    );
  return (
    <div className="property-history">
      <div className="subsection-heading">
        <strong>Match candidates</strong>
        <span className="muted">{property.matchCandidates.length} found</span>
      </div>
      {property.matchCandidates.map((candidate) => (
        <div className="candidate-row" key={candidate.id}>
          <div>
            <strong>{candidate.masterProperty.addressLine1}</strong>
            <span>
              {candidate.masterProperty.city}, {candidate.masterProperty.postcode}
            </span>
            <small>
              {candidate.matchType.replaceAll('_', ' ')} · {Math.round(candidate.confidence * 100)}%
              confidence · {formatDate(candidate.createdAt ?? undefined)}
            </small>
          </div>
          <button
            className="button button-secondary button-small"
            type="button"
            disabled={candidate.reviewStatus === 'CONFIRMED'}
            onClick={() => onConfirm(candidate.masterPropertyId)}
          >
            {candidate.reviewStatus === 'CONFIRMED' ? 'Confirmed' : 'Confirm match'}
          </button>
        </div>
      ))}
    </div>
  );
}
