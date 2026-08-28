import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthService } from '../../src/server/auth/auth-service';
import { TokenService } from '../../src/server/auth/token-service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl === undefined ? describe.skip : describe;
const testEmailDomain = '@auth-integration.test';

integrationDescribe('authentication database integration', () => {
  let prisma: PrismaClient;
  let authService: AuthService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    await prisma.$connect();
    authService = new AuthService(
      prisma,
      new TokenService({ JWT_SECRET: 'integration-test-secret-that-is-long-enough' }),
    );
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
    await prisma.$disconnect();
  });

  it('authenticates an active user and returns the persisted role', async () => {
    const email = `ops${testEmailDomain}`;
    await createUser(email, UserRole.OPS);

    await expect(authService.login({ email, password: 'correct-password' })).resolves.toMatchObject(
      {
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresInSeconds: 900,
        user: { email, role: UserRole.OPS, id: expect.any(String) },
      },
    );
  });

  it('rejects inactive users and role-incompatible authorization', async () => {
    const email = `monitor${testEmailDomain}`;
    await createUser(email, UserRole.MONITOR);
    await prisma.user.update({ where: { email }, data: { isActive: false } });
    await expect(authService.login({ email, password: 'correct-password' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    await prisma.user.update({ where: { email }, data: { isActive: true } });
    const result = await authService.login({ email, password: 'correct-password' });
    await expect(
      authService.authorizeRequest(
        new Request('http://localhost/api/sync/master-data', {
          headers: { authorization: `Bearer ${result.accessToken}` },
        }),
        [UserRole.OPS],
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  async function createUser(email: string, role: UserRole): Promise<void> {
    await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('correct-password', 4), role },
    });
  }
});
