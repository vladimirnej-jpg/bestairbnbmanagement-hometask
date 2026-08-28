import { describe, expect, it } from 'vitest';

import { LeadIntelligenceProviderError } from './lead-intelligence.provider';
import { parseOpenRouterResponse } from './openrouter-response.parser';

const completeAddress = {
  country: 'Netherlands',
  city: 'Amsterdam',
  street: 'Example Street',
  houseNumber: '10',
  unit: null,
  postcode: '1012 AB',
};

describe('parseOpenRouterResponse', () => {
  it('parses a structured address completion', () => {
    const result = parseOpenRouterResponse(
      {
        choices: [
          {
            message: {
              content: JSON.stringify({
                contactEmail: 'Alex@Example.com',
                contactName: 'Alex Example',
                propertyAddress: completeAddress,
                confidence: 0.9,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      },
      'test-model',
    );

    expect(result).toMatchObject({
      extraction: {
        contactEmail: 'alex@example.com',
        contactName: 'Alex Example',
        propertyAddress: {
          ...completeAddress,
          postcode: '1012AB',
        },
        confidence: 0.9,
      },
      provider: 'openrouter',
      model: 'test-model',
      tokenUsage: { input: 10, output: 20 },
    });
  });

  it('handles fenced JSON, aliases, and percentage confidence', () => {
    const result = parseOpenRouterResponse(
      {
        choices: [
          {
            message: {
              content:
                'Details:\n```json\n{"email":"alex@example.com","name":"Alex Example","property_address":{"country":"Netherlands","city":"Amsterdam","street":"Example Street","house_number":"10","postcode":"1012 AB"},"confidence":"92%"}\n```',
            },
          },
        ],
      },
      'test-model',
    );

    expect(result.extraction).toEqual({
      contactEmail: 'alex@example.com',
      contactName: 'Alex Example',
      propertyAddress: { ...completeAddress, postcode: '1012AB' },
      confidence: 0.92,
    });
  });

  it('supports legacy raw addresses while migrating providers', () => {
    const result = parseOpenRouterResponse(
      {
        choices: [
          {
            message: {
              content: JSON.stringify({
                email: 'alex@example.com',
                address: 'Amsterdam, Prinsengracht 263, 1016 GV',
                confidence: 0.8,
              }),
            },
          },
        ],
      },
      'legacy-model',
    );

    expect(result.extraction.propertyAddress).toMatchObject({
      city: 'Amsterdam',
      street: 'Prinsengracht',
      houseNumber: '263',
      postcode: '1016GV',
    });
  });

  it('supports content parts and tool-call arguments', () => {
    const contentPartsResult = parseOpenRouterResponse(
      {
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: '{"contactEmail":"parts@example.com",' },
                {
                  type: 'text',
                  text: '"propertyAddress":{"city":"Amsterdam","street":"Example Street","houseNumber":"10","postcode":"1012 AB"}}',
                },
              ],
            },
          },
        ],
      },
      'parts-model',
    );
    expect(contentPartsResult.extraction.contactEmail).toBe('parts@example.com');
    expect(contentPartsResult.extraction.propertyAddress).toMatchObject({
      city: 'Amsterdam',
      street: 'Example Street',
      houseNumber: '10',
      postcode: '1012AB',
    });

    const toolCallResult = parseOpenRouterResponse(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: JSON.stringify({
                      contactName: 'Tool User',
                      propertyAddress: completeAddress,
                    }),
                  },
                },
              ],
            },
          },
        ],
      },
      'tool-model',
    );
    expect(toolCallResult.extraction.contactName).toBe('Tool User');
  });

  it('fills missing address components with null', () => {
    const result = parseOpenRouterResponse(
      {
        choices: [
          {
            message: {
              content:
                '{"contact_email":"not-an-email","propertyAddress":{"city":"Amsterdam","postcode":"1012 AB"},"confidence":92}',
            },
          },
        ],
      },
      'test-model',
    );

    expect(result.extraction).toEqual({
      contactEmail: null,
      contactName: null,
      propertyAddress: {
        country: null,
        city: 'Amsterdam',
        street: null,
        houseNumber: null,
        unit: null,
        postcode: '1012AB',
      },
      confidence: 0.92,
    });
  });

  it('prefers the most informative JSON object when prose contains multiple fragments', () => {
    const result = parseOpenRouterResponse(
      {
        choices: [
          {
            message: {
              content:
                'I cannot find the email {"email":"unknown"}. The extracted lead is {"CONTACT EMAIL":"lead@example.com","CONTACT NAME":"Lead User","PROPERTY":{"line_1":"10 Example Street","city":"Amsterdam","zip":"1012 AB"},"confidence":0.8,}',
            },
          },
        ],
        usage: { prompt_tokens: '11', completion_tokens: '22' },
      },
      'variant-model',
    );

    expect(result.extraction).toMatchObject({
      contactEmail: 'lead@example.com',
      contactName: 'Lead User',
      propertyAddress: {
        city: 'Amsterdam',
        street: 'Example Street',
        houseNumber: '10',
        postcode: '1012AB',
      },
      confidence: 0.8,
    });
    expect(result.tokenUsage).toEqual({ input: 11, output: 22 });
  });

  it('returns a provider error when choices are missing', () => {
    expect(() => parseOpenRouterResponse({ id: 'missing-choices' }, 'test-model')).toThrow(
      LeadIntelligenceProviderError,
    );
    try {
      parseOpenRouterResponse({ id: 'missing-choices' }, 'test-model');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'PROVIDER_INVALID_RESPONSE',
        message: 'OpenRouter returned no usable message content',
      });
    }
  });

  it('rejects a response truncated by the model token limit', () => {
    expect(() =>
      parseOpenRouterResponse(
        {
          choices: [
            {
              finish_reason: 'length',
              message: {
                content: '{"contactEmail":"owner@example.com","propertyAddress":{',
              },
            },
          ],
        },
        'test-model',
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'PROVIDER_INVALID_RESPONSE',
        message: 'OpenRouter response was truncated by the token limit',
      }),
    );
  });

  it('rejects a balanced address-only fragment as an extraction', () => {
    expect(() =>
      parseOpenRouterResponse(
        {
          choices: [
            {
              message: {
                content:
                  '{"propertyAddress":{"country":"Netherlands","city":"Amsterdam","street":"Example Street","houseNumber":"10","unit":null,"postcode":"1012 AB"}}',
              },
            },
          ],
        },
        'test-model',
      ),
    ).toThrowError(expect.objectContaining({ code: 'PROVIDER_INVALID_RESPONSE' }));
  });

  it('surfaces an error envelope as an unavailable provider', () => {
    expect(() =>
      parseOpenRouterResponse(
        { error: { code: 429, message: 'Rate limit exceeded' } },
        'test-model',
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_TIMEOUT', message: 'Rate limit exceeded' }),
    );
  });
});
