import { afterEach, describe, expect, it, vi } from 'vitest';

import { setContainerForTests, type AppContainer } from '../../../../server/container';
import { GET } from './route';

describe('GET /api/health/ready', () => {
  afterEach(() => {
    setContainerForTests(undefined);
  });

  it('reports database readiness after SELECT 1 succeeds', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ result: 1 }]);
    setContainerForTests({
      prisma: { $queryRaw: queryRaw } as never,
      authService: {} as never,
    } as unknown as AppContainer);

    const response = await GET(new Request('http://localhost/api/health/ready'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', database: 'ok' });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('returns a database-unavailable error when the readiness query fails', async () => {
    setContainerForTests({
      prisma: { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) } as never,
      authService: {} as never,
    } as unknown as AppContainer);

    const response = await GET(new Request('http://localhost/api/health/ready'));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('DATABASE_UNAVAILABLE');
  });
});
