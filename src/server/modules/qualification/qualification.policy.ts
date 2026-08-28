import type { QualificationStatus } from '@prisma/client';

export interface QualificationInput {
  readonly contactEmail: string | null;
  readonly rawAddress: string | null;
  readonly normalizedPostcode: string | null;
  readonly normalizedStreet: string | null;
  readonly normalizedHouseNumber: string | null;
  readonly zone: 'inside' | 'outside' | 'unknown';
}

export interface QualificationDecision {
  readonly status: QualificationStatus;
  readonly reason: string;
}

export class QualificationPolicy {
  public decide(input: QualificationInput): QualificationDecision {
    if (input.contactEmail === null || input.rawAddress === null) {
      return {
        status: 'NEEDS_INFO',
        reason: 'Contact email and complete property address are required',
      };
    }
    if (
      input.normalizedPostcode === null ||
      input.normalizedStreet === null ||
      input.normalizedHouseNumber === null
    ) {
      return { status: 'NEEDS_INFO', reason: 'Property address is incomplete' };
    }
    if (input.zone === 'outside') {
      return { status: 'OUT_OF_ZONE', reason: 'Property is outside the known service zones' };
    }
    if (input.zone === 'unknown') {
      return { status: 'NEEDS_REVIEW', reason: 'Property service zone could not be determined' };
    }
    return { status: 'QUALIFIED', reason: 'Lead has complete contact and property information' };
  }
}
