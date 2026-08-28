import { afterEach, describe, expect, it, vi } from 'vitest';

import { setContainerForTests, type AppContainer } from '../../../../server/container';
import { POST } from './route';

describe('POST /api/auth/login', () => {
  afterEach(() => {
    setContainerForTests(undefined);
  });

  it('returns the existing bearer-token login contract', async () => {
    const login = vi.fn().mockResolvedValue({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: { id: 'user-1', email: 'ops@example.com', role: 'OPS' },
    });
    setContainerForTests({
      prisma: {} as never,
      authService: { login } as never,
    } as unknown as AppContainer);

    const response = await POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ops@example.com', password: 'x' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: { id: 'user-1', email: 'ops@example.com', role: 'OPS' },
    });
    expect(login).toHaveBeenCalledWith({ email: 'ops@example.com', password: 'x' });
  });

  it('returns a validation envelope for an invalid strict body', async () => {
    setContainerForTests({
      prisma: {} as never,
      authService: {} as never,
    } as unknown as AppContainer);

    const response = await POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'not-an-email', password: 'short', extra: true }),
      }),
    );
    const payload = (await response.json()) as {
      statusCode: number;
      error: { code: string; message: string; details: unknown };
      requestId: string;
    };

    expect(response.status).toBe(400);
    expect(payload.statusCode).toBe(400);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(payload.error.message).toBe('Request validation failed');
    expect(payload.error.details).toEqual(expect.any(Array));
    expect(payload.requestId).toBe(response.headers.get('x-request-id'));
  });
});
