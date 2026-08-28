import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl === undefined ? describe.skip : describe;

integrationDescribe('monitoring database integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('can read the source tables used by the monitoring overview', async () => {
    await expect(prisma.lead.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.masterDataSyncRun.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.processingRun.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
