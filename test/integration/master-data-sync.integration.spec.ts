import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MasterDataRepository } from '../../src/server/modules/master-data/master-data.repository';
import {
  type MasterDataProvider,
  type MasterDataSnapshot,
} from '../../src/server/modules/master-data/master-data-provider';
import { MasterDataService } from '../../src/server/modules/master-data/master-data.service';
import { SyncLeaseRepository } from '../../src/server/modules/sync/sync-lease.repository';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl === undefined ? describe.skip : describe;
const testPrefix = `web-master-data-${Date.now()}`;

const validSnapshot: MasterDataSnapshot = {
  properties: [
    {
      externalId: `${testPrefix}-property`,
      addressLine1: '10 Integration Street',
      city: 'Amsterdam',
      postcode: '1012 AB',
    },
  ],
  serviceZones: [
    {
      externalId: `${testPrefix}-zone`,
      name: 'Integration zone',
      postcodePrefixes: ['10'],
    },
  ],
  services: [{ externalId: `${testPrefix}-service`, name: 'Integration service' }],
  zoneServices: [
    {
      serviceZoneExternalId: `${testPrefix}-zone`,
      serviceExternalId: `${testPrefix}-service`,
    },
  ],
};

integrationDescribe('master-data PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let service: MasterDataService;
  let provider: MasterDataProvider & { readonly fetchSnapshot: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    await prisma.$connect();
    provider = { fetchSnapshot: vi.fn().mockResolvedValue(structuredClone(validSnapshot)) };
    service = new MasterDataService(
      provider,
      new MasterDataRepository(prisma),
      new SyncLeaseRepository(prisma),
    );
  });

  beforeEach(async () => {
    provider.fetchSnapshot.mockReset();
    provider.fetchSnapshot.mockResolvedValue(structuredClone(validSnapshot));
    await prisma.masterDataSyncRun.deleteMany({ where: { trigger: testPrefix } });
    await prisma.zoneService.deleteMany({
      where: { serviceZone: { source: 'google-sheets', externalId: `${testPrefix}-zone` } },
    });
    await prisma.masterProperty.deleteMany({ where: { externalId: `${testPrefix}-property` } });
    await prisma.serviceZone.deleteMany({ where: { externalId: `${testPrefix}-zone` } });
    await prisma.service.deleteMany({ where: { externalId: `${testPrefix}-service` } });
    await prisma.syncLease.deleteMany({ where: { key: 'master-data-sync' } });
  });

  afterAll(async () => {
    await prisma.masterDataSyncRun.deleteMany({ where: { trigger: testPrefix } });
    await prisma.masterProperty.deleteMany({ where: { externalId: `${testPrefix}-property` } });
    await prisma.serviceZone.deleteMany({ where: { externalId: `${testPrefix}-zone` } });
    await prisma.service.deleteMany({ where: { externalId: `${testPrefix}-service` } });
    await prisma.syncLease.deleteMany({ where: { key: 'master-data-sync' } });
    await prisma.$disconnect();
  });

  it('applies a validated snapshot atomically and records the successful run', async () => {
    await expect(service.sync(testPrefix)).resolves.toMatchObject({
      status: 'SUCCEEDED',
      propertyCount: 1,
      serviceCount: 1,
    });
    await expect(
      prisma.masterDataSyncRun.findFirst({ where: { trigger: testPrefix } }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    await expect(
      prisma.masterProperty.findFirst({ where: { externalId: `${testPrefix}-property` } }),
    ).resolves.toMatchObject({ addressLine1: '10 Integration Street', isMissing: false });
  });
});
