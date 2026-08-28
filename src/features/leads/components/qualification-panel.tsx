import type { LeadDetail } from '../../../api/leads';
import { StatusBadge } from '../../../components/ui/status-badge';

export function QualificationPanel({ lead }: { readonly lead: LeadDetail }): React.JSX.Element {
  const property = lead.property;
  const checks = [
    {
      label: 'Contact email',
      value: lead.contactEmail,
      ready: (lead.contactEmail?.trim().length ?? 0) > 0,
      required: true,
    },
    {
      label: 'Contact name',
      value: lead.contactName,
      ready: (lead.contactName?.trim().length ?? 0) > 0,
      required: false,
    },
    {
      label: 'Property address',
      value: property?.rawAddress,
      ready: (property?.rawAddress?.trim().length ?? 0) > 0,
      required: true,
    },
    {
      label: 'Country',
      value: property?.country,
      ready: property?.country !== null && property?.country !== undefined,
      required: false,
    },
    {
      label: 'City',
      value: property?.normalizedCity,
      ready: property?.normalizedCity !== null && property?.normalizedCity !== undefined,
      required: true,
    },
    {
      label: 'Postcode',
      value: property?.normalizedPostcode,
      ready: property?.normalizedPostcode !== null && property?.normalizedPostcode !== undefined,
      required: true,
    },
    {
      label: 'Street',
      value: property?.normalizedStreet,
      ready: property?.normalizedStreet !== null && property?.normalizedStreet !== undefined,
      required: true,
    },
    {
      label: 'House number',
      value: property?.normalizedHouseNumber,
      ready:
        property?.normalizedHouseNumber !== null && property?.normalizedHouseNumber !== undefined,
      required: true,
    },
    {
      label: 'Unit',
      value: property?.unit,
      ready: property?.unit !== null && property?.unit !== undefined,
      required: false,
    },
  ];
  return (
    <section className="panel" aria-labelledby="qualification-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Decision gate</span>
          <h2 id="qualification-title">Qualification</h2>
        </div>
        <StatusBadge value={lead.qualificationStatus} />
      </div>
      <p className="panel-copy">
        {lead.qualificationReason ?? 'No qualification reason has been recorded yet.'}
      </p>
      <ul className="check-list">
        {checks.map((check) => (
          <li key={check.label} className={check.ready ? 'check-ready' : 'check-missing'}>
            <span className="check-icon" aria-hidden="true">
              {check.ready ? '✓' : '!'}
            </span>
            <span>
              <strong>{check.label}</strong>
              <small>
                {check.ready
                  ? check.value
                  : check.required
                    ? 'Required before a showcase can be created'
                    : 'Optional'}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
