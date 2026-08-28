const API_BASE_URL = '/api';
const AUTH_STORAGE_KEY = 'bestairbnb.auth.v1';

export interface StoredAuth {
  readonly accessToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly role: 'OPS' | 'MONITOR';
  };
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;

  public constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function readStoredAuth(): StoredAuth | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredAuth(parsed)) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredAuth(auth: StoredAuth): void {
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // A private browsing context may reject storage. The in-memory auth state still works.
  }
}

export function clearStoredAuth(): void {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage errors during logout.
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { readonly accessToken?: string } = {},
): Promise<T> {
  const { accessToken, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set('Accept', 'application/json');
  if (requestOptions.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken !== undefined && accessToken.length > 0) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...requestOptions, headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The API is unavailable. Check the backend connection.');
  }

  const text = await response.text();
  let payload: unknown = undefined;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const envelope = getErrorEnvelope(payload);
    throw new ApiError(
      response.status,
      envelope?.code ?? `HTTP_${response.status}`,
      envelope?.message ?? 'The request could not be completed.',
      envelope?.details,
    );
  }

  return payload as T;
}

function getErrorEnvelope(value: unknown): {
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
} | null {
  if (!isRecord(value)) return null;
  const nested = isRecord(value.error) ? value.error : value;
  return {
    code: typeof nested.code === 'string' ? nested.code : undefined,
    message: typeof nested.message === 'string' ? nested.message : undefined,
    details: nested.details,
  };
}

function isStoredAuth(value: unknown): value is StoredAuth {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  return (
    typeof value.accessToken === 'string' &&
    typeof value.user.id === 'string' &&
    typeof value.user.email === 'string' &&
    (value.user.role === 'OPS' || value.user.role === 'MONITOR')
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function formatDate(value: string | null | undefined, fallback = 'Not available'): string {
  if (value === null || value === undefined) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}
