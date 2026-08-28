import { parseAddressComponents } from '../../modules/properties/address-normalizer';
import {
  emptyPropertyAddress,
  normalizeAddressComponents,
  type PropertyAddressComponents,
} from '../../shared/address-components';
import { leadExtractionSchema, type LeadExtraction } from './lead-extraction.schema';
import {
  LeadIntelligenceProviderError,
  type LeadIntelligenceResult,
} from './lead-intelligence.provider';

type UnknownRecord = Record<string, unknown>;

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const nullLikeValues = new Set(['', 'null', 'none', 'unknown', 'n/a', 'not provided']);

const emailKeys = ['contactEmail', 'contact_email', 'email', 'emailAddress', 'email_address'];
const nameKeys = ['contactName', 'contact_name', 'name', 'fullName', 'full_name'];
const legacyAddressKeys = ['rawAddress', 'raw_address', 'address', 'addressLine', 'address_line'];
const structuredAddressKeys = ['propertyAddress', 'property_address'];
const addressComponentKeys = [
  'country',
  'countryCode',
  'country_code',
  'addressLine1',
  'address_line1',
  'line1',
  'line_1',
  'street',
  'streetName',
  'street_name',
  'houseNumber',
  'house_number',
  'number',
  'city',
  'town',
  'locality',
  'postcode',
  'postalCode',
  'postal_code',
  'zip',
  'zipCode',
];
const confidenceKeys = ['confidence', 'confidenceScore', 'confidence_score'];
const nestedResultKeys = ['data', 'result', 'lead', 'extraction'];
const nestedContactKeys = ['contact', 'customer', 'guest', 'client'];
const nestedPropertyKeys = ['property', 'propertyDetails', 'property_details'];
const nestedWrapperKeys = [
  ...nestedResultKeys,
  ...nestedContactKeys,
  ...nestedPropertyKeys,
  'details',
  'fields',
  'payload',
  'output',
];

/**
 * Parse an OpenRouter chat completion without trusting a single model's exact
 * formatting. Models may return fenced JSON, prose around JSON, content-part
 * arrays, aliases for fields, or tool-call arguments.
 */
export function parseOpenRouterResponse(response: unknown, model: string): LeadIntelligenceResult {
  const responseRecord = asRecord(response);
  if (responseRecord === null) {
    throw invalidResponse('OpenRouter returned a non-object response');
  }

  const providerError = readProviderError(responseRecord.error);
  if (providerError !== null) {
    throw new LeadIntelligenceProviderError(providerError.code, providerError.message);
  }

  const content = extractOpenRouterMessageText(responseRecord);
  if (content === null) {
    throw invalidResponse('OpenRouter returned no usable message content');
  }

  const extraction = parseExtractionContent(content);
  const usage = asRecord(responseRecord.usage);
  const inputTokens = optionalNumber(usage?.prompt_tokens);
  const outputTokens = optionalNumber(usage?.completion_tokens);

  return {
    extraction,
    provider: 'openrouter',
    model,
    ...(inputTokens === undefined && outputTokens === undefined
      ? {}
      : { tokenUsage: { input: inputTokens, output: outputTokens } }),
  };
}

/** Extract assistant text for a possible repair retry without exposing it in logs. */
export function extractOpenRouterMessageText(response: unknown): string | null {
  const responseRecord = asRecord(response);
  if (responseRecord === null || !Array.isArray(responseRecord.choices)) return null;

  for (const choice of responseRecord.choices) {
    const choiceRecord = asRecord(choice);
    if (choiceRecord === null) continue;

    const message = asRecord(choiceRecord.message);
    const messageContent = message === null ? null : contentToText(message.content);
    if (messageContent !== null) return messageContent;

    const toolArguments = message === null ? null : toolCallArguments(message.tool_calls);
    if (toolArguments !== null) return toolArguments;

    const legacyText = asNullableString(choiceRecord.text);
    if (legacyText !== null) return legacyText;
  }
  return null;
}

function parseExtractionContent(content: string): LeadExtraction {
  const candidates = uniqueStrings([
    content.trim(),
    ...fencedJsonCandidates(content),
    ...balancedJsonCandidates(content),
  ]);

  let bestExtraction: LeadExtraction | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const parsed = parseJsonValue(candidate);
    if (parsed === undefined) continue;

    const extraction = normalizeExtraction(parsed);
    if (extraction === null) continue;

    const result = leadExtractionSchema.safeParse(extraction);
    if (!result.success) continue;
    const score = extractionScore(result.data);
    if (score > bestScore) {
      bestExtraction = result.data;
      bestScore = score;
    }
  }

  if (bestExtraction !== null) return bestExtraction;
  throw invalidResponse('OpenRouter returned no valid lead extraction JSON');
}

function normalizeExtraction(value: unknown): UnknownRecord | null {
  const object = asRecord(Array.isArray(value) ? value[0] : value);
  if (object === null) return null;

  const sources = collectNestedObjects(object);

  const hasKnownField = sources.some((source) =>
    [
      ...emailKeys,
      ...nameKeys,
      ...legacyAddressKeys,
      ...structuredAddressKeys,
      ...addressComponentKeys,
      ...confidenceKeys,
    ].some((key) => hasKey(source, key)),
  );
  if (!hasKnownField) return null;

  const address = firstPropertyAddress(sources);

  return {
    contactEmail: normalizeEmail(firstValue(sources, emailKeys)),
    contactName: normalizeText(firstValue(sources, nameKeys)),
    propertyAddress: address,
    confidence: normalizeConfidence(firstValue(sources, confidenceKeys)),
  };
}

function firstPropertyAddress(sources: readonly UnknownRecord[]): PropertyAddressComponents {
  for (const source of sources) {
    const structured = firstValue([source], structuredAddressKeys);
    if (structured !== null) return normalizeStructuredAddress(structured);
  }
  for (const source of sources) {
    if (addressComponentKeys.some((key) => hasKey(source, key))) {
      return normalizeStructuredAddress(source);
    }
  }
  for (const source of sources) {
    const legacy = firstValue([source], legacyAddressKeys);
    if (legacy !== null) return normalizeStructuredAddress(legacy);
  }
  return emptyPropertyAddress;
}

function extractionScore(extraction: LeadExtraction): number {
  const address = extraction.propertyAddress;
  return [
    extraction.contactEmail,
    extraction.contactName,
    address.country,
    address.city,
    address.street,
    address.houseNumber,
    address.unit,
    address.postcode,
  ].filter((value): value is string => value !== null && value !== undefined).length;
}

function collectNestedObjects(root: UnknownRecord): UnknownRecord[] {
  const sources: UnknownRecord[] = [root];
  const seen = new Set<UnknownRecord>([root]);
  for (let index = 0; index < sources.length && index < 20; index += 1) {
    const source = sources[index];
    if (source === undefined) break;
    for (const key of nestedWrapperKeys) {
      const nested = asRecord(readKey(source, key));
      if (nested === null || seen.has(nested)) continue;
      seen.add(nested);
      sources.push(nested);
    }
  }
  return sources;
}

function firstValue(sources: readonly UnknownRecord[], keys: readonly string[]): unknown {
  for (const source of sources) {
    for (const key of keys) {
      const value = readKey(source, key);
      if (isUsableValue(value)) return value;
    }
  }
  return null;
}

function isUsableValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return asNullableString(value) !== null;
  return true;
}

function hasKey(source: UnknownRecord, key: string): boolean {
  return readKey(source, key) !== undefined;
}

function readKey(source: UnknownRecord, key: string): unknown {
  const direct = source[key];
  if (direct !== undefined) return direct;
  const normalizedKey = normalizeKey(key);
  const matchingKey = Object.keys(source).find(
    (candidate) => normalizeKey(candidate) === normalizedKey,
  );
  return matchingKey === undefined ? undefined : source[matchingKey];
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function normalizeEmail(value: unknown): string | null {
  const text = asNullableString(value);
  if (text === null) return null;
  return text.match(emailPattern)?.[0].toLowerCase() ?? null;
}

function normalizeText(value: unknown): string | null {
  return asNullableString(value);
}

function normalizeStructuredAddress(value: unknown): PropertyAddressComponents {
  const text = asNullableString(value);
  if (text !== null) {
    const parsed = parseAddressComponents(text);
    return {
      country: parsed.country,
      city: parsed.city,
      street: parsed.street,
      houseNumber: parsed.houseNumber,
      unit: parsed.unit,
      postcode: parsed.postcode,
    };
  }

  const object = asRecord(value);
  if (object === null) return emptyPropertyAddress;
  return normalizeAddressComponents({
    country: addressComponentValue(object, ['country', 'countryCode', 'country_code']),
    city: addressComponentValue(object, ['city', 'town', 'locality']),
    street: addressComponentValue(object, [
      'street',
      'streetName',
      'street_name',
      'addressLine1',
      'line1',
      'line_1',
    ]),
    houseNumber: addressComponentValue(object, ['houseNumber', 'house_number', 'number']),
    unit: addressComponentValue(object, ['unit', 'apartment', 'suite', 'flat']),
    postcode: addressComponentValue(object, [
      'postcode',
      'postalCode',
      'postal_code',
      'zip',
      'zipCode',
    ]),
  });
}

function addressComponentValue(source: UnknownRecord, keys: readonly string[]): string | null {
  const value = firstValue([source], keys);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return asNullableString(value);
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return confidenceNumber(value);
  if (typeof value !== 'string') return 0;

  const cleaned = value.trim().replace('%', '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? confidenceNumber(parsed, value.includes('%')) : 0;
}

function confidenceNumber(value: number, isPercentage = false): number {
  const normalized = isPercentage || value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return nullLikeValues.has(text.toLowerCase()) ? null : text;
}

function contentToText(value: unknown): string | null {
  if (typeof value === 'string') return asNullableString(value);
  const object = asRecord(value);
  if (object !== null) {
    return contentToText(object.text ?? object.value ?? object.content ?? object.output_text);
  }
  if (!Array.isArray(value)) return null;

  const text = value
    .map((part) => {
      if (typeof part === 'string') return part;
      const record = asRecord(part);
      return record === null
        ? null
        : (asNullableString(record.text) ??
            asNullableString(record.value) ??
            asNullableString(record.content) ??
            asNullableString(record.output_text));
    })
    .filter((part): part is string => part !== null)
    .join(' ')
    .trim();
  return text.length === 0 ? null : text;
}

function toolCallArguments(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const toolCall of value) {
    const functionCall = asRecord(asRecord(toolCall)?.function);
    if (functionCall === null) continue;
    const argumentsValue = functionCall.arguments;
    const argumentsText =
      typeof argumentsValue === 'string'
        ? asNullableString(argumentsValue)
        : argumentsValue === undefined
          ? null
          : JSON.stringify(argumentsValue);
    if (argumentsText !== null && argumentsText !== undefined) return argumentsText;
  }
  return null;
}

function parseJsonValue(candidate: string): unknown {
  let current: unknown = candidate.trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (typeof current !== 'string') return current;
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      if (attempt > 0) return undefined;
      if (typeof current !== 'string') return undefined;
      const repaired = removeTrailingCommas(current);
      if (repaired === current) return undefined;
      current = repaired;
    }
  }
  return current;
}

function removeTrailingCommas(value: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ',') {
      const rest = value.slice(index + 1);
      if (/^\s*[}\]]/.test(rest)) continue;
    }
    result += character;
  }
  return result;
}

function fencedJsonCandidates(value: string): readonly string[] {
  const candidates: string[] = [];
  const pattern = /```(?:json|jsonc|javascript|js)?\s*([\s\S]*?)```/gi;
  for (const match of value.matchAll(pattern)) {
    const candidate = match[1]?.trim();
    if (candidate !== undefined && candidate.length > 0) candidates.push(candidate);
  }
  return candidates;
}

function balancedJsonCandidates(value: string): readonly string[] {
  const candidates: string[] = [];
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== '{' && value[start] !== '[') continue;
    const end = balancedJsonEnd(value, start);
    if (end !== null) candidates.push(value.slice(start, end + 1));
  }
  return candidates;
}

function balancedJsonEnd(value: string, start: number): number | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{' || character === '[') {
      stack.push(character);
      continue;
    }
    if (character !== '}' && character !== ']') continue;
    const expected = character === '}' ? '{' : '[';
    if (stack.pop() !== expected) return null;
    if (stack.length === 0) return index;
  }
  return null;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function readProviderError(
  value: unknown,
): { readonly code: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_TIMEOUT'; readonly message: string } | null {
  if (typeof value === 'string') {
    const message = asNullableString(value);
    return message === null ? null : { code: 'PROVIDER_UNAVAILABLE', message };
  }
  const error = asRecord(value);
  if (error === null) return null;
  const rawCode = error.code ?? error.status;
  const numericCode = typeof rawCode === 'string' ? Number(rawCode) : rawCode;
  const code =
    numericCode === 408 || numericCode === 429 ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE';
  const message = asNullableString(error.message) ?? 'OpenRouter returned an error response';
  return { code, message };
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function invalidResponse(message: string): LeadIntelligenceProviderError {
  return new LeadIntelligenceProviderError('PROVIDER_INVALID_RESPONSE', message);
}
