import 'server-only';

import { AuthService } from './auth/auth-service';
import { TokenService } from './auth/token-service';
import { InngestWorkflowDispatcher } from '../inngest/dispatcher';
import { getPrisma } from './database/prisma';
import { getRuntimeConfig } from './runtime/config';
import type { PrismaClient } from '@prisma/client';
import {
  testCalendarProvider,
  testGeocodingProvider,
  testLeadIntelligenceProvider,
  createStagedTestGmailProvider,
  createTestMasterDataProvider,
} from './integrations/fake/deterministic-providers';
import { GoogleCalendarProvider } from './integrations/google/google-calendar.provider';
import { GoogleGmailProvider } from './integrations/google/google-gmail.provider';
import { GoogleSheetsMasterDataProvider } from './integrations/google-sheets-master-data.provider';
import { NominatimGeocodingProvider } from './integrations/geocoding/nominatim-geocoding.provider';
import { OpenRouterLeadIntelligenceProvider } from './integrations/openrouter/openrouter-lead-intelligence.provider';
import { LeadsRepository } from './modules/leads/leads.repository';
import { GmailIngestionService } from './modules/leads/gmail-ingestion.service';
import { LeadsService } from './modules/leads/leads.service';
import { MasterDataRepository } from './modules/master-data/master-data.repository';
import { MasterDataService } from './modules/master-data/master-data.service';
import { MonitoringRepository } from './modules/monitoring/monitoring.repository';
import { MonitoringService } from './modules/monitoring/monitoring.service';
import { ProcessingRepository } from './modules/processing/processing.repository';
import { ProcessingService } from './modules/processing/processing.service';
import { PropertiesRepository } from './modules/properties/properties.repository';
import { PropertiesService } from './modules/properties/properties.service';
import { PropertyEnrichmentService } from './modules/properties/property-enrichment.service';
import { PropertyMatchingService } from './modules/properties/property-matching.service';
import { QualificationService } from './modules/qualification/qualification.service';
import { GmailDraftService } from './modules/showcases/gmail-draft.service';
import { ShowcaseRendererService } from './modules/showcases/showcase-renderer.service';
import { ShowcasesRepository } from './modules/showcases/showcases.repository';
import { ShowcasesService } from './modules/showcases/showcases.service';
import { SyncLeaseRepository } from './modules/sync/sync-lease.repository';
import { SyncService } from './modules/sync/sync.service';
import type { WorkflowDispatcher } from './modules/workflows/workflow-dispatcher';
import type { CalendarProvider } from './integrations/google/calendar.provider';
import type { GmailProvider } from './integrations/google/gmail.provider';
import type { GeocodingProvider } from './integrations/geocoding/geocoding.provider';
import type { LeadIntelligenceProvider } from './integrations/openrouter/lead-intelligence.provider';
import type { MasterDataProvider } from './modules/master-data/master-data-provider';

export interface AppContainer {
  readonly prisma: PrismaClient;
  readonly authService: AuthService;
  readonly leadsService: LeadsService;
  readonly gmailIngestionService: GmailIngestionService;
  readonly processingService: ProcessingService;
  readonly masterDataService: MasterDataService;
  readonly propertiesService: PropertiesService;
  readonly showcasesService: ShowcasesService;
  readonly syncService: SyncService;
  readonly monitoringService: MonitoringService;
  readonly workflowDispatcher: WorkflowDispatcher;
}

let container: AppContainer | undefined;

export function createContainer(): AppContainer {
  const config = getRuntimeConfig();
  const prisma = getPrisma();
  const authService = new AuthService(prisma, new TokenService(config));
  const gmail: GmailProvider =
    config.PROVIDER_MODE === 'fake'
      ? createStagedTestGmailProvider()
      : new GoogleGmailProvider(config);
  const masterData: MasterDataProvider =
    config.PROVIDER_MODE === 'fake'
      ? createTestMasterDataProvider()
      : new GoogleSheetsMasterDataProvider(config);
  const geocoding: GeocodingProvider =
    config.PROVIDER_MODE === 'fake'
      ? testGeocodingProvider
      : new NominatimGeocodingProvider(config);
  const intelligence: LeadIntelligenceProvider =
    config.PROVIDER_MODE === 'fake'
      ? testLeadIntelligenceProvider
      : new OpenRouterLeadIntelligenceProvider(config);
  const calendar: CalendarProvider =
    config.PROVIDER_MODE === 'fake' ? testCalendarProvider : new GoogleCalendarProvider(config);

  const leaseRepository = new SyncLeaseRepository(prisma);
  const leadsRepository = new LeadsRepository(prisma);
  const masterDataRepository = new MasterDataRepository(prisma);
  const masterDataService = new MasterDataService(
    masterData,
    masterDataRepository,
    leaseRepository,
  );
  const propertyMatchingService = new PropertyMatchingService();
  const propertiesRepository = new PropertiesRepository(prisma);
  const propertyEnrichmentService = new PropertyEnrichmentService(
    geocoding,
    leadsRepository,
    propertyMatchingService,
  );
  const propertiesService = new PropertiesService(
    leadsRepository,
    propertiesRepository,
    propertyMatchingService,
    propertyEnrichmentService,
  );
  const qualificationService = new QualificationService();
  const processingRepository = new ProcessingRepository(prisma);
  const processingService = new ProcessingService(
    intelligence,
    leadsRepository,
    propertiesService,
    qualificationService,
    processingRepository,
  );
  const gmailIngestionService = new GmailIngestionService(gmail, leadsRepository);
  const leadsService = new LeadsService(leadsRepository);
  const syncService = new SyncService(masterDataService, gmailIngestionService);
  const showcasesRepository = new ShowcasesRepository(prisma);
  const showcasesService = new ShowcasesService(
    showcasesRepository,
    new ShowcaseRendererService(),
    new GmailDraftService(gmail, showcasesRepository),
  );
  const monitoringService = new MonitoringService(new MonitoringRepository(prisma), calendar);

  return {
    prisma,
    authService,
    leadsService,
    gmailIngestionService,
    processingService,
    masterDataService,
    propertiesService,
    showcasesService,
    syncService,
    monitoringService,
    workflowDispatcher: new InngestWorkflowDispatcher(),
  };
}

export function getContainer(): AppContainer {
  container ??= createContainer();
  return container;
}

export function setContainerForTests(next: AppContainer | undefined): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test override is test-only');
  }
  container = next;
}
