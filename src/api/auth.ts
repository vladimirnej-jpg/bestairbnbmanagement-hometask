import { apiFetch, type StoredAuth } from './client';

export interface LoginResponse extends StoredAuth {
  readonly tokenType: 'Bearer';
  readonly expiresInSeconds: number;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
