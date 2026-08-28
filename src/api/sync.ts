import { apiFetch } from './client';

export interface MasterDataStatus {
  readonly latestRun: {
    readonly id: string;
    readonly status: string;
    readonly trigger: string;
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
  } | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly hasSuccessfulProjection: boolean;
}

export interface QueuedWorkflow {
  readonly eventId: string;
  readonly status: 'QUEUED';
}

export function getSyncStatus(accessToken: string): Promise<MasterDataStatus> {
  return apiFetch<MasterDataStatus>('/sync/status', { accessToken });
}

export function syncMasterData(accessToken: string): Promise<QueuedWorkflow> {
  return apiFetch<QueuedWorkflow>('/sync/master-data', { method: 'POST', accessToken });
}

export function syncGmail(accessToken: string): Promise<QueuedWorkflow> {
  return apiFetch<QueuedWorkflow>('/sync/gmail', { method: 'POST', accessToken });
}
