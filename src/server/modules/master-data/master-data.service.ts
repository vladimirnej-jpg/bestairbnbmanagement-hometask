import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

import { ApplicationError } from '../../errors/application-error';
import type { SyncLeaseRepository } from '../sync/sync-lease.repository';
import {
  MasterDataProviderError,
  type MasterDataProvider,
  type MasterDataSnapshot,
} from './master-data-provider';
import { normalizeMasterData } from './master-data.mapper';
import type { MasterDataRepository } from './master-data.repository';
import { type ProjectionCounts } from './master-data.repository';
import { validatedMasterDataSnapshotSchema } from './master-data.schemas';

const MASTER_DATA_LEASE_KEY = 'master-data-sync';
const MASTER_DATA_LEASE_SECONDS = 15 * 60;
const MASTER_DATA_FETCH_TIMEOUT_MS = 10 * 60 * 1_000;

export interface MasterDataSyncResult extends ProjectionCounts {
  readonly runId: string;
  readonly status: 'SUCCEEDED';
}

export interface MasterDataStatus {
  readonly latestRun: {
    readonly id: string;
    readonly status: string;
    readonly trigger: string;
    readonly startedAt: Date;
    readonly finishedAt: Date | null;
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
  } | null;
  readonly lastSuccessfulSyncAt: Date | null;
  readonly hasSuccessfulProjection: boolean;
}

export class MasterDataService {
  public constructor(
    private readonly provider: MasterDataProvider,
    private readonly repository: MasterDataRepository,
    private readonly leaseRepository: SyncLeaseRepository,
  ) {}

  public async sync(trigger: string, triggeredBy?: string): Promise<MasterDataSyncResult> {
    const ownerId = randomUUID();
    await this.leaseRepository.acquire(MASTER_DATA_LEASE_KEY, ownerId, MASTER_DATA_LEASE_SECONDS);

    let runId: string | undefined;
    try {
      const run = await this.repository.createSyncRun(trigger, triggeredBy);
      runId = run.id;
      const rawSnapshot = await this.fetchSnapshotWithinLease();
      const parsedSnapshot = validatedMasterDataSnapshotSchema.parse(rawSnapshot);
      const snapshot = normalizeMasterData(parsedSnapshot);
      const counts = await this.repository.applyProjection(run.id, snapshot);
      return { runId: run.id, status: 'SUCCEEDED', ...counts };
    } catch (error) {
      if (runId !== undefined) {
        await this.markFailedSafely(runId, error);
      }
      throw this.toApplicationError(error);
    } finally {
      await this.leaseRepository.release(MASTER_DATA_LEASE_KEY, ownerId);
    }
  }

  public async getStatus(): Promise<MasterDataStatus> {
    const [latestRun, latestSuccessfulRun] = await Promise.all([
      this.repository.getLatestSyncRun(),
      this.repository.getLatestSuccessfulSyncRun(),
    ]);

    return {
      latestRun:
        latestRun === null
          ? null
          : {
              id: latestRun.id,
              status: latestRun.status,
              trigger: latestRun.trigger,
              startedAt: latestRun.startedAt,
              finishedAt: latestRun.finishedAt,
              errorCode: latestRun.errorCode,
              errorMessage: latestRun.errorMessage,
            },
      lastSuccessfulSyncAt: latestSuccessfulRun?.finishedAt ?? null,
      hasSuccessfulProjection: latestSuccessfulRun !== null,
    };
  }

  private async markFailedSafely(runId: string, error: unknown): Promise<void> {
    try {
      await this.repository.markSyncRunFailed(
        runId,
        this.errorCode(error),
        this.errorMessage(error),
      );
    } catch {
      // Preserve the original provider or validation error if recording the run fails.
    }
  }

  private async fetchSnapshotWithinLease(): Promise<MasterDataSnapshot> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new MasterDataProviderError(
            'PROVIDER_TIMEOUT',
            'Master-data provider exceeded the synchronization time limit',
          ),
        );
      }, MASTER_DATA_FETCH_TIMEOUT_MS);
    });

    try {
      return await Promise.race([this.provider.fetchSnapshot(), timeoutPromise]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  private toApplicationError(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) return error;
    if (error instanceof ZodError) {
      return new ApplicationError(
        400,
        'MASTER_DATA_INVALID',
        'Google Sheet data failed validation',
        error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        { cause: error },
      );
    }
    if (error instanceof MasterDataProviderError) {
      if (error.code === 'PROVIDER_CONFIGURATION') {
        return new ApplicationError(503, error.code, error.message, undefined, { cause: error });
      }
      return new ApplicationError(502, error.code, error.message, undefined, { cause: error });
    }
    return new ApplicationError(
      500,
      'MASTER_DATA_SYNC_FAILED',
      error instanceof Error ? error.message : 'Master-data synchronization failed',
      undefined,
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  private errorCode(error: unknown): string {
    if (error instanceof ZodError) {
      return 'MASTER_DATA_INVALID';
    }
    if (error instanceof MasterDataProviderError) {
      return error.code;
    }
    return 'MASTER_DATA_SYNC_FAILED';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Master-data synchronization failed';
  }
}
