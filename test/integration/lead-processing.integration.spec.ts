import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl === undefined ? describe.skip : describe;

integrationDescribe('lead processing database integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists processing runs with Inngest correlation fields and lifecycle audit tables', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ProcessingRun'
        AND column_name = 'orchestrationRunId'
    `;
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('ProcessingRun', 'LifecycleEvent', 'sync_leases')
    `;
    expect(columns).toHaveLength(1);
    expect(tables.map((row) => row.table_name).sort()).toEqual([
      'LifecycleEvent',
      'ProcessingRun',
      'sync_leases',
    ]);
  });
});
