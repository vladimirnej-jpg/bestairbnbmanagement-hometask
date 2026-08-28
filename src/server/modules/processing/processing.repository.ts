import type { PrismaClient, ProcessingRun } from '@prisma/client';

import type { ProcessingContext } from './processing.service';

export class ProcessingRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public createRunning(
    leadId: string,
    step: string,
    context: ProcessingContext,
    metadata?: { readonly provider?: string; readonly model?: string },
  ): Promise<ProcessingRun> {
    return this.prisma.processingRun.create({
      data: {
        leadId,
        step,
        orchestrationRunId: context.orchestrationRunId,
        attempt: context.attempt,
        status: 'RUNNING',
        startedAt: new Date(),
        ...(metadata?.provider === undefined ? {} : { provider: metadata.provider }),
        ...(metadata?.model === undefined ? {} : { model: metadata.model }),
      },
    });
  }

  public succeed(
    id: string,
    metadata?: {
      readonly provider?: string;
      readonly model?: string;
      readonly promptVersion?: string;
      readonly tokenUsage?: object;
    },
  ): Promise<ProcessingRun> {
    return this.prisma.processingRun.update({
      where: { id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        ...(metadata?.provider === undefined ? {} : { provider: metadata.provider }),
        ...(metadata?.model === undefined ? {} : { model: metadata.model }),
        ...(metadata?.tokenUsage === undefined && metadata?.promptVersion === undefined
          ? {}
          : {
              tokenUsage: {
                ...(metadata?.tokenUsage ?? {}),
                ...(metadata?.promptVersion === undefined
                  ? {}
                  : { promptVersion: metadata.promptVersion }),
              },
            }),
      },
    });
  }

  public fail(id: string, errorCode: string, errorDetails?: object): Promise<ProcessingRun> {
    return this.prisma.processingRun.update({
      where: { id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorCode,
        ...(errorDetails === undefined ? {} : { errorDetails }),
      },
    });
  }
}
