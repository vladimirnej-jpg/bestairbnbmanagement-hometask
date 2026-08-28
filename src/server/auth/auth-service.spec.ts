import type { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import { ApplicationError } from '../errors/application-error';
import { AuthService } from './auth-service';

function makeTokenService(): { sign: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> } {
  return {
    sign: vi.fn().mockResolvedValue('signed-token'),
    verify: vi.fn(),
  };
}

describe('AuthService', () => {
  it('authenticates an active user and returns a role-bearing response', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'ops@example.com',
          passwordHash,
          role: 'OPS' as UserRole,
          isActive: true,
        }),
      },
    };
    const tokenService = makeTokenService();
    const service = new AuthService(prisma as never, tokenService as never);

    await expect(
      service.login({ email: ' OPS@EXAMPLE.COM ', password: 'correct-password' }),
    ).resolves.toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: { id: 'user-1', email: 'ops@example.com', role: 'OPS' },
    });
    expect(tokenService.sign).toHaveBeenCalledWith({ id: 'user-1', email: 'ops@example.com' });
  });

  it('rejects invalid credentials without revealing whether the user exists', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new AuthService(prisma as never, makeTokenService() as never);

    await expect(
      service.login({ email: 'missing@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rate limits repeated failed login attempts for one email', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new AuthService(prisma as never, makeTokenService() as never);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login({ email: 'blocked@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(ApplicationError);
    }

    await expect(
      service.login({ email: 'blocked@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ status: 429, code: 'LOGIN_RATE_LIMITED' });
  });

  it('reloads the active user and enforces roles for bearer requests', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'monitor@example.com',
          role: 'MONITOR' as UserRole,
          isActive: true,
        }),
      },
    };
    const tokenService = makeTokenService();
    tokenService.verify.mockResolvedValue({ sub: 'user-1', email: 'monitor@example.com' });
    const service = new AuthService(prisma as never, tokenService as never);
    const request = new Request('http://localhost/api/monitoring/overview', {
      headers: { authorization: 'Bearer signed-token' },
    });

    await expect(service.authorizeRequest(request, ['MONITOR'])).resolves.toEqual({
      id: 'user-1',
      email: 'monitor@example.com',
      role: 'MONITOR',
    });
    await expect(service.authorizeRequest(request, ['OPS'])).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
