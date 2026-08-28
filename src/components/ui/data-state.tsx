import Link from 'next/link';

export function LoadingState({
  label = 'Loading workspace',
}: {
  readonly label?: string;
}): React.JSX.Element {
  return (
    <div className="inline-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}...
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        ○
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  readonly message: string;
  readonly retry?: () => void;
}): React.JSX.Element {
  return (
    <div className="error-state" role="alert">
      <strong>Could not load this view</strong>
      <p>{message}</p>
      {retry ? (
        <button className="button button-secondary" type="button" onClick={retry}>
          Try again
        </button>
      ) : (
        <Link className="button button-secondary" href="/ops">
          Back to operations
        </Link>
      )}
    </div>
  );
}
