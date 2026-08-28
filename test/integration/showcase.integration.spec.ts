import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  GmailDraftResult,
  GmailProvider,
} from '../../src/server/integrations/google/gmail.provider';
import { GmailDraftService } from '../../src/server/modules/showcases/gmail-draft.service';
import { ShowcaseRendererService } from '../../src/server/modules/showcases/showcase-renderer.service';
import { ShowcasesRepository } from '../../src/server/modules/showcases/showcases.repository';
import { ShowcasesService } from '../../src/server/modules/showcases/showcases.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl === undefined ? describe.skip : describe;
const testPrefix = `web-showcase-${Date.now()}`;

integrationDescribe('showcase PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let showcases: ShowcasesService;
  let leadId: string;
  let gmail: GmailProvider & {
    readonly createDraft: ReturnType<typeof vi.fn>;
    readonly updateDraft: ReturnType<typeof vi.fn>;
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    await prisma.$connect();
    gmail = {
      listLeadMessages: vi.fn().mockResolvedValue([]),
      createDraft: vi
        .fn()
        .mockResolvedValue({ draftId: `${testPrefix}-draft` } satisfies GmailDraftResult),
      updateDraft: vi
        .fn()
        .mockResolvedValue({ draftId: `${testPrefix}-draft` } satisfies GmailDraftResult),
    };
    const repository = new ShowcasesRepository(prisma);
    showcases = new ShowcasesService(
      repository,
      new ShowcaseRendererService(),
      new GmailDraftService(gmail, repository),
    );
  });

  beforeEach(async () => {
    await prisma.lead.deleteMany({ where: { gmailThreadId: { startsWith: testPrefix } } });
    await prisma.masterDataSyncRun.deleteMany({ where: { trigger: testPrefix } });
    await prisma.zoneService.deleteMany({ where: { serviceZone: { source: testPrefix } } });
    await prisma.serviceZone.deleteMany({ where: { source: testPrefix } });
    await prisma.service.deleteMany({ where: { source: testPrefix } });
    gmail.createDraft.mockClear();
    gmail.updateDraft.mockClear();
    leadId = await seedReadyLead();
  });

  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { gmailThreadId: { startsWith: testPrefix } } });
    await prisma.masterDataSyncRun.deleteMany({ where: { trigger: testPrefix } });
    await prisma.zoneService.deleteMany({ where: { serviceZone: { source: testPrefix } } });
    await prisma.serviceZone.deleteMany({ where: { source: testPrefix } });
    await prisma.service.deleteMany({ where: { source: testPrefix } });
    await prisma.$disconnect();
  });

  it('persists one showcase and updates its linked Gmail draft on repeated sync', async () => {
    await expect(showcases.generate(leadId)).resolves.toMatchObject({ status: 'READY' });
    await expect(showcases.syncDraft(leadId)).resolves.toEqual({
      draftId: `${testPrefix}-draft`,
    });
    await expect(showcases.syncDraft(leadId)).resolves.toEqual({
      draftId: `${testPrefix}-draft`,
    });
    expect(gmail.createDraft).toHaveBeenCalledTimes(1);
    expect(gmail.updateDraft).toHaveBeenCalledTimes(1);
    await expect(prisma.showcase.findUnique({ where: { leadId } })).resolves.toMatchObject({
      status: 'DRAFT_CREATED',
      gmailDraftId: `${testPrefix}-draft`,
      draftSyncIntentKey: null,
    });
  });

  async function seedReadyLead(): Promise<string> {
    const service = await prisma.service.create({
      data: {
        source: testPrefix,
        externalId: `${testPrefix}-service`,
        name: 'Integration Cleaning',
      },
    });
    await prisma.serviceZone.create({
      data: {
        source: testPrefix,
        externalId: `${testPrefix}-zone`,
        name: 'Integration zone',
        normalizedCity: 'amsterdam',
        postcodePrefixes: ['1012'],
        zoneServices: { create: { serviceId: service.id } },
      },
    });
    await prisma.masterDataSyncRun.create({
      data: { status: 'SUCCEEDED', trigger: testPrefix, finishedAt: new Date() },
    });
    const lead = await prisma.lead.create({
      data: {
        gmailThreadId: `${testPrefix}-thread`,
        contactEmail: `${testPrefix}@example.com`,
        contactName: 'Integration lead',
        qualificationStatus: 'QUALIFIED',
      },
    });
    await prisma.leadProperty.create({
      data: {
        leadId: lead.id,
        rawAddress: '10 Integration Street',
        normalizedCity: 'amsterdam',
        normalizedPostcode: '1012AB',
      },
    });
    return lead.id;
  }
});
