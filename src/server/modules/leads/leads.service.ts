import type { LifecycleStatus } from '@prisma/client';

import { ApplicationError } from '../../errors/application-error';

import type { LeadsRepository } from './leads.repository';
import { type LeadListFilters, type LeadWithContext } from './leads.repository';

export type LeadDetail = LeadWithContext & {
  readonly serviceZone: 'inside' | 'outside' | 'unknown';
  readonly services: readonly string[];
};

export interface LeadListResponse {
  readonly items: Awaited<ReturnType<LeadsRepository['list']>>['items'];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export class LeadsService {
  public constructor(private readonly repository: LeadsRepository) {}

  public async list(filters: LeadListFilters): Promise<LeadListResponse> {
    const result = await this.repository.list(filters);
    return {
      ...result,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.ceil(result.total / filters.pageSize),
    };
  }

  public async getById(leadId: string): Promise<LeadDetail> {
    const lead = await this.repository.findById(leadId);
    if (lead === null) {
      throw new ApplicationError(404, 'LEAD_NOT_FOUND', 'Lead was not found');
    }
    const serviceContext = await this.repository.findServiceContext(
      lead.property?.normalizedPostcode ?? null,
      lead.property?.normalizedCity ?? null,
    );
    return { ...lead, serviceZone: serviceContext.zone, services: serviceContext.services };
  }

  public async updateLifecycle(
    leadId: string,
    status: LifecycleStatus,
    reason: string | null,
    actorId: string,
  ): Promise<LeadDetail> {
    const lead = await this.repository.updateLifecycle(leadId, status, reason, actorId);
    if (lead === null) {
      throw new ApplicationError(404, 'LEAD_NOT_FOUND', 'Lead was not found');
    }
    return this.getById(leadId);
  }
}
