import { type GmailProvider } from '../../integrations/google/gmail.provider';
import type { ShowcasesRepository } from './showcases.repository';

export class GmailDraftService {
  public constructor(
    private readonly gmail: GmailProvider,
    private readonly repository: ShowcasesRepository,
  ) {}
  public async sync(
    leadId: string,
    email: string,
    subject: string,
    html: string,
    draftId: string | null,
  ): Promise<string> {
    const preparation = await this.repository.prepareDraftSync(leadId);
    const effectiveDraftId = preparation.draftId ?? draftId;
    try {
      const result =
        effectiveDraftId === null
          ? await this.gmail.createDraft({
              to: email,
              subject,
              html,
              idempotencyKey: preparation.intentKey,
            })
          : await this.gmail.updateDraft(effectiveDraftId, {
              to: email,
              subject,
              html,
              idempotencyKey: preparation.intentKey,
            });
      await this.repository.setDraftResult(leadId, result.draftId);
      return result.draftId;
    } catch (error) {
      await this.repository.setDraftFailed(
        leadId,
        error instanceof Error ? error.message : 'Gmail draft synchronization failed',
      );
      throw error;
    }
  }
}
