import type { QualificationStatus, ShowcaseStatus } from '@prisma/client';

export interface ShowcaseReadinessInput {
  readonly qualificationStatus: QualificationStatus;
  readonly hasSuccessfulProjection: boolean;
  readonly activeServiceCount: number;
  readonly isMasterDataStale: boolean;
}
export interface ShowcaseReadinessDecision {
  readonly status: ShowcaseStatus;
  readonly blockingReason: string | null;
  readonly warning: string | null;
}

export class ShowcaseReadinessPolicy {
  public decide(input: ShowcaseReadinessInput): ShowcaseReadinessDecision {
    if (input.qualificationStatus !== 'QUALIFIED')
      return {
        status: 'NOT_READY',
        blockingReason: 'Lead must be qualified before a showcase can be generated',
        warning: null,
      };
    if (!input.hasSuccessfulProjection)
      return {
        status: 'BLOCKED',
        blockingReason: 'No successful master-data projection is available',
        warning: null,
      };
    if (input.activeServiceCount === 0)
      return {
        status: 'BLOCKED',
        blockingReason: 'No active services are available for this property zone',
        warning: null,
      };
    return {
      status: 'READY',
      blockingReason: null,
      warning: input.isMasterDataStale
        ? 'Service data may be stale; verify availability before sending.'
        : null,
    };
  }
}
