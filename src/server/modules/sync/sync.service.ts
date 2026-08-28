import type { MasterDataService } from '../master-data/master-data.service';
import {
  type MasterDataStatus,
  type MasterDataSyncResult,
} from '../master-data/master-data.service';
import type { GmailIngestionResult, GmailIngestionService } from '../leads/gmail-ingestion.service';

export class SyncService {
  public constructor(
    private readonly masterDataService: MasterDataService,
    private readonly gmailIngestionService: GmailIngestionService,
  ) {}

  public syncMasterData(trigger: string, actorId?: string): Promise<MasterDataSyncResult> {
    return this.masterDataService.sync(trigger, actorId);
  }

  public getStatus(): Promise<MasterDataStatus> {
    return this.masterDataService.getStatus();
  }

  public syncGmail(): Promise<GmailIngestionResult> {
    return this.gmailIngestionService.sync();
  }
}
