import type { ReactNode } from 'react';

export function StatusBadge({
  value,
  tone,
}: {
  readonly value: string;
  readonly tone?: string;
}): React.JSX.Element {
  return (
    <span className={`status-badge status-${tone ?? toneFor(value)}`}>{formatStatus(value)}</span>
  );
}

export function formatStatus(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly action?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="section-heading">
      {' '}
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function toneFor(value: string): string {
  if (value.includes('FAILED') || value.includes('BLOCKED') || value.includes('OUT_OF_ZONE'))
    return 'danger';
  if (value.includes('NEEDS') || value.includes('RUNNING') || value.includes('PENDING'))
    return 'warning';
  if (
    value.includes('QUALIFIED') ||
    value.includes('READY') ||
    value.includes('SUCCEEDED') ||
    value.includes('DRAFT')
  )
    return 'success';
  return 'neutral';
}
