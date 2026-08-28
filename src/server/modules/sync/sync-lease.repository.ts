import { Prisma, type PrismaClient } from '@prisma/client';

import { ApplicationError } from '../../errors/application-error';

interface LeaseRow {
  readonly lease_key: string;
  readonly owner_id: string;
  readonly expires_at: Date;
}

export class SyncLeaseRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async acquire(
    key: string,
    ownerId: string,
    leaseSeconds: number,
    conflictMessage = 'A master-data synchronization is already running',
  ): Promise<void> {
    const rows = await this.prisma.$queryRaw<LeaseRow[]>(Prisma.sql`
      INSERT INTO "sync_leases" ("lease_key", "owner_id", "acquired_at", "expires_at")
      VALUES (${key}, ${ownerId}, NOW(), NOW() + (${leaseSeconds} * INTERVAL '1 second'))
      ON CONFLICT ("lease_key") DO UPDATE
      SET "owner_id" = EXCLUDED."owner_id",
          "acquired_at" = EXCLUDED."acquired_at",
          "expires_at" = EXCLUDED."expires_at"
      WHERE "sync_leases"."expires_at" <= NOW()
      RETURNING "lease_key", "owner_id", "expires_at"
    `);

    if (rows.length === 0) {
      throw new ApplicationError(409, 'SYNC_ALREADY_RUNNING', conflictMessage);
    }
  }

  public async release(key: string, ownerId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "sync_leases"
      WHERE "lease_key" = ${key} AND "owner_id" = ${ownerId}
    `);
  }
}
