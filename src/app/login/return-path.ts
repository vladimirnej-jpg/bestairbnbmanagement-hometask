export function getSafeReturnPath(value: string | null): string | null {
  if (value === null || value.length === 0 || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  try {
    const parsed = new URL(value, 'http://bestairbnb.internal');
    return parsed.origin === 'http://bestairbnb.internal' && !value.includes('\\') ? value : null;
  } catch {
    return null;
  }
}
