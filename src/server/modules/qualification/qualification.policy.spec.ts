import { describe, expect, it } from 'vitest';

import { QualificationPolicy } from './qualification.policy';

describe('QualificationPolicy', () => {
  const policy = new QualificationPolicy();
  const complete = {
    contactEmail: 'lead@example.com',
    rawAddress: '10 Example Street, Amsterdam, 1012 AB',
    normalizedPostcode: '1012AB',
    normalizedStreet: 'example street',
    normalizedHouseNumber: '10',
    matchStatus: 'exact' as const,
    zone: 'inside' as const,
  };

  it.each([
    ['missing contact', { ...complete, contactEmail: null }, 'NEEDS_INFO'],
    ['missing address', { ...complete, rawAddress: null }, 'NEEDS_INFO'],
    ['incomplete address', { ...complete, normalizedHouseNumber: null }, 'NEEDS_INFO'],
    ['ambiguous property', { ...complete, matchStatus: 'ambiguous' as const }, 'NEEDS_REVIEW'],
    ['contact-history match', { ...complete, matchStatus: 'review' as const }, 'NEEDS_REVIEW'],
    ['unmatched property', { ...complete, matchStatus: 'none' as const }, 'NEEDS_REVIEW'],
    ['unknown zone', { ...complete, zone: 'unknown' as const }, 'NEEDS_REVIEW'],
    ['outside zone', { ...complete, zone: 'outside' as const }, 'OUT_OF_ZONE'],
    ['qualified', complete, 'QUALIFIED'],
  ])('%s', (_name, input, status) => {
    expect(policy.decide(input).status).toBe(status);
  });

  it('does not depend on service readiness', () => {
    expect(policy.decide(complete)).toMatchObject({ status: 'QUALIFIED' });
  });
});
