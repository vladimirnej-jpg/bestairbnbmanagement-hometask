import { describe, expect, it } from 'vitest';

import { ShowcaseReadinessPolicy } from './showcase-readiness.policy';

describe('ShowcaseReadinessPolicy', () => {
  const policy = new ShowcaseReadinessPolicy();
  const ready = {
    qualificationStatus: 'QUALIFIED' as const,
    hasSuccessfulProjection: true,
    activeServiceCount: 1,
    isMasterDataStale: false,
  };

  it('blocks incomplete and review leads', () => {
    expect(policy.decide({ ...ready, qualificationStatus: 'NEEDS_INFO' }).status).toBe('NOT_READY');
    expect(policy.decide({ ...ready, qualificationStatus: 'NEEDS_REVIEW' }).status).toBe(
      'NOT_READY',
    );
  });

  it('blocks missing projection and zone services', () => {
    expect(policy.decide({ ...ready, hasSuccessfulProjection: false }).status).toBe('BLOCKED');
    expect(policy.decide({ ...ready, activeServiceCount: 0 }).status).toBe('BLOCKED');
  });

  it('allows stale usable projection with a warning', () => {
    expect(policy.decide({ ...ready, isMasterDataStale: true })).toMatchObject({
      status: 'READY',
      warning: expect.any(String),
    });
  });
});
