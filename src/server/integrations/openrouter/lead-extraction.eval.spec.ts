import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { normalizeStructuredAddress } from '../../modules/properties/address-normalizer';
import { QualificationPolicy } from '../../modules/qualification/qualification.policy';
import { formatAddressComponents } from '../../shared/address-components';
import { LeadIntelligenceProviderError } from './lead-intelligence.provider';
import type { LeadExtraction } from './lead-extraction.schema';
import { parseOpenRouterResponse } from './openrouter-response.parser';

interface ExpectedExtraction {
  readonly contactEmail: string | null;
  readonly postcode: string | null;
  readonly street: string | null;
  readonly houseNumber: string | null;
  readonly zone: 'inside' | 'outside' | 'unknown';
}

interface EvalCase {
  readonly id: string;
  readonly conversation: string;
  readonly expected: ExpectedExtraction;
  readonly protectFromOutOfZone: boolean;
  readonly expectInvalidResponse?: boolean;
  readonly recordedResponse: unknown;
}

const exactFields = ['postcode', 'street', 'houseNumber', 'contactEmail'] as const;
const minimumExactMatchRate = 0.9;

async function loadCases(): Promise<EvalCase[]> {
  const fixtureUrl = new URL('./lead-extraction.eval.fixtures.json', import.meta.url);
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as EvalCase[];
}

describe('recorded OpenRouter lead-extraction evaluation', async () => {
  const cases = await loadCases();

  it('keeps protected conversations out of OUT_OF_ZONE and meets the exact-match gate', () => {
    const qualification = new QualificationPolicy();
    let matches = 0;
    let comparisons = 0;

    for (const testCase of cases) {
      let extraction: LeadExtraction;
      try {
        extraction = parseOpenRouterResponse(testCase.recordedResponse, 'recorded-eval').extraction;
      } catch (error) {
        if (testCase.expectInvalidResponse) {
          expect(error).toBeInstanceOf(LeadIntelligenceProviderError);
          continue;
        }
        throw new Error(
          `${testCase.id}: ${error instanceof Error ? error.message : 'invalid recorded response'}`,
          { cause: error },
        );
      }
      const actual = {
        postcode: extraction.propertyAddress.postcode,
        street: extraction.propertyAddress.street,
        houseNumber: extraction.propertyAddress.houseNumber,
        contactEmail: extraction.contactEmail ?? null,
      };
      for (const field of exactFields) {
        comparisons += 1;
        if (actual[field] === testCase.expected[field]) matches += 1;
      }

      const normalized = normalizeStructuredAddress(extraction.propertyAddress);
      const decision = qualification.decide({
        contactEmail: extraction.contactEmail ?? null,
        rawAddress: formatAddressComponents(extraction.propertyAddress),
        normalizedPostcode: normalized.normalizedPostcode,
        normalizedStreet: normalized.normalizedStreet,
        normalizedHouseNumber: normalized.normalizedHouseNumber,
        zone: testCase.expected.zone,
      });
      if (testCase.protectFromOutOfZone) {
        expect(decision.status, testCase.id).not.toBe('OUT_OF_ZONE');
      }
    }

    expect(comparisons).toBeGreaterThanOrEqual(96);
    expect(matches / comparisons).toBeGreaterThanOrEqual(minimumExactMatchRate);
  });
});
