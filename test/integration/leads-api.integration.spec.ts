import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl === undefined ? describe.skip : describe;

integrationDescribe('lead operations database integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has the lead read model and lifecycle/showcase relations', async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Lead', 'LeadMessage', 'LifecycleEvent', 'ProcessingRun', 'Showcase')
    `;
    expect(tables.map((row) => row.table_name).sort()).toEqual([
      'Lead',
      'LeadMessage',
      'LifecycleEvent',
      'ProcessingRun',
      'Showcase',
    ]);
  });
});
