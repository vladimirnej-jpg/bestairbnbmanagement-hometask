export function Toast({
  message,
  tone = 'success',
}: {
  readonly message: string | null;
  readonly tone?: 'success' | 'error';
}): React.JSX.Element | null {
  if (message === null) return null;
  return (
    <div
      className={`toast toast-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {message}
    </div>
  );
}
