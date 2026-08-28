import type { QualificationStatus } from '@prisma/client';

import { ApplicationError } from '../../errors/application-error';
import {
  LeadIntelligenceProviderError,
  type LeadIntelligenceProvider,
} from '../../integrations/openrouter/lead-intelligence.provider';
import type { LeadsRepository, LeadWithContext } from '../leads/leads.repository';
import type { PropertiesService } from '../properties/properties.service';
import type { QualificationService } from '../qualification/qualification.service';
import type { ProcessingRepository } from './processing.repository';

export interface ProcessingContext {
  readonly orchestrationRunId: string;
  readonly attempt: number;
}

export interface LeadProcessingSteps {
  extract(leadId: string, context: ProcessingContext): Promise<void>;
  resolveProperty(leadId: string, context: ProcessingContext): Promise<void>;
  qualify(leadId: string, context: ProcessingContext): Promise<QualificationStatus>;
}

export class ProcessingService implements LeadProcessingSteps {
  public constructor(
    private readonly intelligence: LeadIntelligenceProvider,
    private readonly leadsRepository: LeadsRepository,
    private readonly propertiesService: PropertiesService,
    private readonly qualificationService: QualificationService,
    private readonly processingRepository: ProcessingRepository,
  ) {}

  public async extract(leadId: string, context: ProcessingContext): Promise<void> {
    const lead = await this.requireLead(leadId);
    const run = await this.processingRepository.createRunning(leadId, 'extract', context);
    try {
      const extractionResult = await this.intelligence.extractLead({
        conversation: this.conversation(lead),
        currentContactEmail: lead.contactEmail,
        currentContactName: lead.contactName,
        currentRawAddress: lead.property?.rawAddress,
      });
      await this.leadsRepository.updateExtraction(leadId, {
        contactEmail: extractionResult.extraction.contactEmail ?? undefined,
        contactName: extractionResult.extraction.contactName ?? undefined,
        propertyAddress: extractionResult.extraction.propertyAddress,
      });
      await this.processingRepository.succeed(run.id, {
        provider: extractionResult.provider,
        model: extractionResult.model,
        promptVersion: extractionResult.promptVersion,
        tokenUsage: extractionResult.tokenUsage,
      });
    } catch (error) {
      await this.processingRepository.fail(run.id, this.errorCode(error), {
        message: this.errorMessage(error),
      });
      throw this.toApplicationError(error);
    }
  }

  public async resolveProperty(leadId: string, context: ProcessingContext): Promise<void> {
    const lead = await this.requireLead(leadId);
    const run = await this.processingRepository.createRunning(leadId, 'property', context);
    try {
      await this.propertiesService.resolve(
        leadId,
        lead.property?.rawAddress ?? null,
        lead.property?.normalizedCity,
        lead.contactEmail,
      );
      await this.processingRepository.succeed(run.id, { provider: 'master-data-and-geocoder' });
    } catch (error) {
      await this.processingRepository.fail(run.id, this.errorCode(error), {
        message: this.errorMessage(error),
      });
      throw this.toApplicationError(error);
    }
  }

  public async qualify(leadId: string, context: ProcessingContext): Promise<QualificationStatus> {
    const lead = await this.requireLead(leadId);
    const run = await this.processingRepository.createRunning(leadId, 'qualification', context);
    try {
      const resolution = await this.propertiesService.resolve(
        leadId,
        lead.property?.rawAddress ?? null,
        lead.property?.normalizedCity,
        lead.contactEmail,
      );
      const current = await this.requireLead(leadId);
      const decision = this.qualificationService.decide({
        contactEmail: current.contactEmail,
        rawAddress: current.property?.rawAddress ?? null,
        normalizedPostcode: current.property?.normalizedPostcode ?? null,
        normalizedStreet: current.property?.normalizedStreet ?? null,
        normalizedHouseNumber: current.property?.normalizedHouseNumber ?? null,
        zone: resolution.zone,
      });
      await this.leadsRepository.updateQualification(
        leadId,
        decision.status,
        decision.reason,
        decision.status === 'OUT_OF_ZONE' ? 'GONE_COLD' : current.lifecycleStatus,
      );
      await this.processingRepository.succeed(run.id, { provider: 'rules' });
      return decision.status;
    } catch (error) {
      await this.processingRepository.fail(run.id, this.errorCode(error), {
        message: this.errorMessage(error),
      });
      throw this.toApplicationError(error);
    }
  }

  private async requireLead(leadId: string): Promise<LeadWithContext> {
    const lead = await this.leadsRepository.findById(leadId);
    if (lead === null) {
      throw new ApplicationError(409, 'LEAD_NOT_FOUND', 'Lead disappeared during processing');
    }
    return lead;
  }

  private conversation(lead: LeadWithContext): string {
    return lead.messages
      .map((message) => `From: ${message.sender}\nSubject: ${message.subject}\n${message.body}`)
      .join('\n\n')
      .slice(0, 20_000);
  }

  private toApplicationError(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) return error;
    if (error instanceof LeadIntelligenceProviderError) {
      return new ApplicationError(502, error.code, error.message, undefined, { cause: error });
    }
    return new ApplicationError(
      500,
      'PROCESSING_FAILED',
      error instanceof Error ? error.message : 'Lead processing failed',
      undefined,
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  private errorCode(error: unknown): string {
    if (error instanceof LeadIntelligenceProviderError) return error.code;
    return error instanceof Error ? error.name : 'PROCESSING_FAILED';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Lead processing failed';
  }
}

export { ProcessingService as LeadProcessingService };
