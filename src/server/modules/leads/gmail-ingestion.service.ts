import { Prisma } from '@prisma/client';

import { GmailProviderError, type GmailProvider } from '../../integrations/google/gmail.provider';
import type { LeadsRepository } from './leads.repository';

export interface GmailIngestionResult {
  readonly received: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly affectedLeadIds: readonly string[];
}

export class GmailIngestionService {
  public constructor(
    private readonly provider: GmailProvider,
    private readonly repository: LeadsRepository,
  ) {}

  public async sync(): Promise<GmailIngestionResult> {
    const messages = await this.provider.listLeadMessages();
    const affectedLeadIds = new Set<string>();
    const result = {
      received: messages.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      affectedLeadIds: [] as string[],
    };
    for (const message of messages) {
      try {
        const existingMessage = await this.repository.findMessageByGmailId(message.messageId);
        if (existingMessage !== null) {
          result.skipped += 1;
          continue;
        }
        const existingLead = await this.repository.findByThreadId(message.threadId);
        let leadId: string;
        if (existingLead === null) {
          try {
            const lead = await this.repository.createLeadWithMessage(message);
            leadId = lead.id;
            result.created += 1;
          } catch (error) {
            if (!this.isUniqueViolation(error)) {
              throw error;
            }
            const racedLead = await this.repository.findByThreadId(message.threadId);
            if (racedLead === null) {
              throw error;
            }
            try {
              await this.repository.appendMessage(racedLead.id, message);
            } catch (appendError) {
              if (!this.isUniqueViolation(appendError)) {
                throw appendError;
              }
              result.skipped += 1;
              continue;
            }
            leadId = racedLead.id;
            result.updated += 1;
          }
        } else {
          try {
            await this.repository.appendMessage(existingLead.id, message);
          } catch (error) {
            if (!this.isUniqueViolation(error)) {
              throw error;
            }
            result.skipped += 1;
            continue;
          }
          leadId = existingLead.id;
          result.updated += 1;
        }
        affectedLeadIds.add(leadId);
      } catch (error) {
        result.failed += 1;
        console.warn(`Gmail message ${message.messageId} failed: ${this.errorMessage(error)}`);
      }
    }
    result.affectedLeadIds = [...affectedLeadIds];
    return result;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private errorMessage(error: unknown): string {
    if (error instanceof GmailProviderError) {
      return error.code;
    }
    return error instanceof Error ? error.message : 'unknown error';
  }
}
