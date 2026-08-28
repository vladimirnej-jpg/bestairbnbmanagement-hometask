import './load-env';

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import OpenAI, { APIError } from 'openai';

import { buildLeadExtractionMessages } from '../src/server/integrations/openrouter/openrouter-lead-intelligence.provider';

interface EvalCase {
  readonly id: string;
  readonly conversation: string;
  readonly expected: unknown;
  readonly protectFromOutOfZone: boolean;
  readonly expectInvalidResponse?: boolean;
  recordedResponse: unknown;
  recordedModel?: string;
  recordedAt?: string;
}

const fixtureUrl = new URL(
  '../src/server/integrations/openrouter/lead-extraction.eval.fixtures.json',
  import.meta.url,
);

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { record: { type: 'boolean', default: false } } });
  if (!values.record) {
    throw new Error('Refusing to record: pass --record explicitly.');
  }
  if (process.env.NODE_ENV === 'production' || process.env.PROVIDER_MODE !== 'live') {
    throw new Error('Recording requires NODE_ENV other than production and PROVIDER_MODE=live.');
  }
  const backend = process.env.LEAD_INTELLIGENCE_PROVIDER?.trim() ?? 'openrouter';
  const isGroq = backend === 'groq';
  const apiKey = (isGroq ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY)?.trim();
  if (!apiKey)
    throw new Error(`${isGroq ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY'} is required for recording.`);
  const model = (isGroq ? process.env.GROQ_MODEL : process.env.OPENROUTER_MODEL)?.trim();
  if (!model)
    throw new Error(`${isGroq ? 'GROQ_MODEL' : 'OPENROUTER_MODEL'} is required for recording.`);

  const cases = JSON.parse(await readFile(fixtureUrl, 'utf8')) as EvalCase[];
  const client = new OpenAI({
    apiKey,
    baseURL: isGroq ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1',
    timeout: 120_000,
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': 'https://bestairbnb.example',
      'X-Title': 'BestAirbnb take-home evaluation recorder',
    },
  });

  for (const testCase of cases) {
    const response = await createCompletionWithRateLimitRetry(
      client,
      {
        model,
        temperature: isGroq ? 1e-8 : 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        ...(isGroq && supportsGroqReasoningEffort(model)
          ? { reasoning_effort: 'low' as const }
          : {}),
        messages: buildLeadExtractionMessages({ conversation: testCase.conversation }, false),
      },
      isGroq,
    );
    testCase.recordedResponse = response;
    testCase.recordedModel = model;
    testCase.recordedAt = new Date().toISOString();
  }
  await writeFile(fixtureUrl, `${JSON.stringify(cases, null, 2)}\n`, 'utf8');
  console.log(`Recorded ${cases.length} lead-extraction responses with ${model}.`);
}

async function createCompletionWithRateLimitRetry(
  client: OpenAI,
  request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  isGroq: boolean,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const maxAttempts = isGroq ? 4 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.chat.completions.create(request);
    } catch (error) {
      if (
        !isGroq ||
        !(error instanceof APIError) ||
        error.status !== 429 ||
        attempt === maxAttempts
      ) {
        throw error;
      }
      const delayMs = rateLimitDelayMs(error);
      console.log(`Groq token limit reached; retrying in ${Math.ceil(delayMs / 1000)}s.`);
      await sleep(delayMs);
    }
  }
  throw new Error('Lead-extraction recorder exhausted retry attempts.');
}

function rateLimitDelayMs(error: APIError): number {
  const retryAfterMs = parseDurationMs(error.headers?.get('retry-after'));
  const resetTokensMs = parseDurationMs(error.headers?.get('x-ratelimit-reset-tokens'));
  const waitMs = retryAfterMs ?? resetTokensMs ?? 5_000;
  return Math.min(65_000, Math.max(1_000, waitMs)) + 250;
}

function parseDurationMs(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1_000;
  const match = /^(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/.exec(value.trim());
  if (match === null) return undefined;
  return (Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 1_000;
}

function supportsGroqReasoningEffort(model: string): boolean {
  return /^openai\/gpt-oss-(?:20b|120b)$/.test(model);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

void main();
