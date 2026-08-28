import type { Prisma } from '@prisma/client';
import { type MasterDataSyncRun, type PrismaClient } from '@prisma/client';

import type { MasterDataSnapshot } from './master-data-provider';

const MASTER_DATA_SOURCE = 'google-sheets';

export interface ProjectionCounts {
  readonly propertyCount: number;
  readonly zoneCount: number;
  readonly serviceCount: number;
  readonly assignmentCount: number;
}

export class MasterDataRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public createSyncRun(trigger: string, triggeredBy?: string): Promise<MasterDataSyncRun> {
    return this.prisma.masterDataSyncRun.create({
      data: {
        status: 'RUNNING',
        trigger,
        ...(triggeredBy === undefined ? {} : { triggeredBy }),
      },
    });
  }

  public markSyncRunFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<MasterDataSyncRun> {
    return this.prisma.masterDataSyncRun.update({
      where: { id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorCode,
        errorMessage: errorMessage.slice(0, 1000),
      },
    });
  }

  public async applyProjection(
    id: string,
    snapshot: MasterDataSnapshot,
  ): Promise<ProjectionCounts> {
    return this.prisma.$transaction(async (transaction) => {
      await this.syncProperties(transaction, snapshot);
      await this.syncServiceZones(transaction, snapshot);
      await this.syncServices(transaction, snapshot);
      const assignmentCount = await this.syncZoneServices(transaction, snapshot);
      const counts: ProjectionCounts = {
        propertyCount: snapshot.properties.length,
        zoneCount: snapshot.serviceZones.length,
        serviceCount: snapshot.services.length,
        assignmentCount,
      };

      await transaction.masterDataSyncRun.update({
        where: { id },
        data: {
          status: 'SUCCEEDED',
          finishedAt: new Date(),
          ...counts,
          errorCode: null,
          errorMessage: null,
        },
      });
      return counts;
    });
  }

  public getLatestSyncRun(): Promise<MasterDataSyncRun | null> {
    return this.prisma.masterDataSyncRun.findFirst({ orderBy: { startedAt: 'desc' } });
  }

  public getLatestSuccessfulSyncRun(): Promise<MasterDataSyncRun | null> {
    return this.prisma.masterDataSyncRun.findFirst({
      where: { status: 'SUCCEEDED' },
      orderBy: { startedAt: 'desc' },
    });
  }

  private async syncProperties(
    transaction: Prisma.TransactionClient,
    snapshot: MasterDataSnapshot,
  ): Promise<void> {
    const externalIds = snapshot.properties.map((property) => property.externalId);
    await transaction.masterProperty.updateMany({
      where: {
        source: MASTER_DATA_SOURCE,
        ...(externalIds.length === 0 ? {} : { externalId: { notIn: externalIds } }),
      },
      data: { isActive: false, isMissing: true },
    });

    for (const property of snapshot.properties) {
      const normalizedPostcode = property.postcode.replace(/\s+/g, '').toUpperCase();
      await transaction.masterProperty.upsert({
        where: {
          source_externalId: {
            source: MASTER_DATA_SOURCE,
            externalId: property.externalId,
          },
        },
        create: {
          source: MASTER_DATA_SOURCE,
          externalId: property.externalId,
          addressLine1: property.addressLine1,
          city: property.city,
          postcode: property.postcode,
          normalizedStreet: property.addressLine1.toLowerCase(),
          normalizedCity: property.city.toLowerCase(),
          normalizedPostcode,
          contactEmail: property.contactEmail?.trim().toLowerCase() ?? null,
          sourceUpdatedAt: this.parseDate(property.sourceUpdatedAt) ?? null,
          isActive: property.isActive ?? true,
          isMissing: false,
        },
        update: {
          addressLine1: property.addressLine1,
          city: property.city,
          postcode: property.postcode,
          normalizedStreet: property.addressLine1.toLowerCase(),
          normalizedCity: property.city.toLowerCase(),
          normalizedPostcode,
          contactEmail: property.contactEmail?.trim().toLowerCase() ?? null,
          sourceUpdatedAt: this.parseDate(property.sourceUpdatedAt) ?? null,
          lastSyncedAt: new Date(),
          isActive: property.isActive ?? true,
          isMissing: false,
        },
      });
    }
  }

  private async syncServiceZones(
    transaction: Prisma.TransactionClient,
    snapshot: MasterDataSnapshot,
  ): Promise<void> {
    const externalIds = snapshot.serviceZones.map((zone) => zone.externalId);
    await transaction.serviceZone.updateMany({
      where: {
        source: MASTER_DATA_SOURCE,
        ...(externalIds.length === 0 ? {} : { externalId: { notIn: externalIds } }),
      },
      data: { isActive: false, isMissing: true },
    });

    for (const zone of snapshot.serviceZones) {
      await transaction.serviceZone.upsert({
        where: {
          source_externalId: {
            source: MASTER_DATA_SOURCE,
            externalId: zone.externalId,
          },
        },
        create: {
          source: MASTER_DATA_SOURCE,
          externalId: zone.externalId,
          name: zone.name,
          city: zone.city ?? null,
          normalizedCity: zone.city?.toLowerCase() ?? null,
          postcodePrefixes: [...zone.postcodePrefixes],
          isActive: zone.isActive ?? true,
          isMissing: false,
        },
        update: {
          name: zone.name,
          city: zone.city ?? null,
          normalizedCity: zone.city?.toLowerCase() ?? null,
          postcodePrefixes: [...zone.postcodePrefixes],
          isActive: zone.isActive ?? true,
          isMissing: false,
        },
      });
    }
  }

  private async syncServices(
    transaction: Prisma.TransactionClient,
    snapshot: MasterDataSnapshot,
  ): Promise<void> {
    const externalIds = snapshot.services.map((service) => service.externalId);
    await transaction.service.updateMany({
      where: {
        source: MASTER_DATA_SOURCE,
        ...(externalIds.length === 0 ? {} : { externalId: { notIn: externalIds } }),
      },
      data: { isActive: false, isMissing: true },
    });

    for (const service of snapshot.services) {
      await transaction.service.upsert({
        where: {
          source_externalId: {
            source: MASTER_DATA_SOURCE,
            externalId: service.externalId,
          },
        },
        create: {
          source: MASTER_DATA_SOURCE,
          externalId: service.externalId,
          name: service.name,
          description: service.description ?? null,
          isActive: service.isActive ?? true,
          isMissing: false,
        },
        update: {
          name: service.name,
          description: service.description ?? null,
          isActive: service.isActive ?? true,
          isMissing: false,
        },
      });
    }
  }

  private async syncZoneServices(
    transaction: Prisma.TransactionClient,
    snapshot: MasterDataSnapshot,
  ): Promise<number> {
    await transaction.zoneService.updateMany({ data: { isActive: false } });
    const [zones, services] = await Promise.all([
      transaction.serviceZone.findMany({ where: { source: MASTER_DATA_SOURCE } }),
      transaction.service.findMany({ where: { source: MASTER_DATA_SOURCE } }),
    ]);
    const zoneIds = new Map(zones.map((zone) => [zone.externalId, zone.id]));
    const serviceIds = new Map(services.map((service) => [service.externalId, service.id]));

    for (const assignment of snapshot.zoneServices) {
      const serviceZoneId = zoneIds.get(assignment.serviceZoneExternalId);
      const serviceId = serviceIds.get(assignment.serviceExternalId);
      if (serviceZoneId === undefined || serviceId === undefined) {
        throw new Error('Validated assignment references a missing master-data record');
      }

      await transaction.zoneService.upsert({
        where: { serviceZoneId_serviceId: { serviceZoneId, serviceId } },
        create: { serviceZoneId, serviceId, isActive: assignment.isActive ?? true },
        update: { isActive: assignment.isActive ?? true },
      });
    }
    return snapshot.zoneServices.length;
  }

  private parseDate(value: string | undefined): Date | undefined {
    return value === undefined ? undefined : new Date(value);
  }
}
