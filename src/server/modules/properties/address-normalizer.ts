import {
  emptyPropertyAddress,
  normalizeAddressComponents,
  type PropertyAddressComponents,
} from '../../shared/address-components';

export interface NormalizedAddress {
  readonly normalizedStreet: string | null;
  readonly normalizedHouseNumber: string | null;
  readonly normalizedCity: string | null;
  readonly normalizedPostcode: string | null;
}

const HOUSE_NUMBER_PATTERN = /\b(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\b/;
const POSTCODE_PATTERNS = [
  /\b\d{5}-\d{3}\b/gi,
  /\b\d{3}-\d{4}\b/gi,
  /\b\d{4}\s*[A-Za-z]{2}\b/gi,
  /\b[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d\b/gi,
  /\b[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}\b/gi,
  /\b[A-Za-z]\d{2}\s?[A-Za-z0-9]{4}\b/gi,
  /\b\d{2,6}[- ]\d{2,6}\b/gi,
  /\b\d{5}(?:-\d{4})?\b/gi,
  /\b\d{4,6}\b/gi,
];

interface PostcodeMatch {
  readonly value: string;
  readonly index: number;
}

function overlapsHouseNumber(match: PostcodeMatch, houseNumber: RegExpExecArray | null): boolean {
  if (houseNumber === null || houseNumber.index === undefined) return false;
  const matchEnd = match.index + match.value.length;
  const houseEnd = houseNumber.index + houseNumber[0].length;
  return match.index < houseEnd && houseNumber.index < matchEnd;
}

function isNumericPostcode(value: string): boolean {
  return /^\d+(?:-\d+)*$/.test(value);
}

function findPostcode(cleaned: string): PostcodeMatch | null {
  const houseNumber = HOUSE_NUMBER_PATTERN.exec(cleaned);
  const candidates = POSTCODE_PATTERNS.flatMap((pattern) =>
    [...cleaned.matchAll(pattern)].map((match) => ({
      value: match[0],
      index: match.index,
    })),
  ).filter((match) => !(isNumericPostcode(match.value) && overlapsHouseNumber(match, houseNumber)));
  candidates.sort(
    (left, right) => left.index - right.index || right.value.length - left.value.length,
  );
  return candidates[0] ?? null;
}

export function parseAddressComponents(
  rawAddress: string,
  cityHint?: string | null,
): PropertyAddressComponents {
  const cleaned = rawAddress.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) return emptyPropertyAddress;

  const postcodeMatch = findPostcode(cleaned);
  const postcode = postcodeMatch?.value.replace(/\s+/g, '').toUpperCase() ?? null;
  const withoutPostcode =
    postcodeMatch === null
      ? cleaned
      : `${cleaned.slice(0, postcodeMatch.index)} ${cleaned.slice(
          postcodeMatch.index + postcodeMatch.value.length,
        )}`
          .replace(/\s+/g, ' ')
          .replace(/\s*,\s*/g, ', ')
          .replace(/^,\s*|,\s*$/g, '')
          .trim();
  const parts = withoutPostcode
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const houseNumber = withoutPostcode.match(HOUSE_NUMBER_PATTERN)?.[1] ?? null;
  const housePartIndex = parts.findIndex((part) => HOUSE_NUMBER_PATTERN.test(part));
  const normalizedCityHint = cityHint?.trim().toLowerCase() ?? null;
  const cityHintIndex =
    normalizedCityHint === null
      ? -1
      : parts.findIndex((part) => part.toLowerCase() === normalizedCityHint);

  let streetPart: string | null = null;
  let cityPart: string | null = null;
  let countryPart: string | null = null;

  if (cityHintIndex >= 0) {
    cityPart = parts[cityHintIndex] ?? null;
    streetPart =
      parts.find((part, index) => index !== cityHintIndex && HOUSE_NUMBER_PATTERN.test(part)) ??
      parts.find((_, index) => index !== cityHintIndex) ??
      null;
    countryPart =
      parts.find(
        (part, index) =>
          index !== cityHintIndex && part !== streetPart && !HOUSE_NUMBER_PATTERN.test(part),
      ) ?? null;
  } else if (housePartIndex === 0) {
    streetPart = parts[0] ?? null;
    cityPart = parts[1] ?? null;
    countryPart = parts[2] ?? null;
  } else if (housePartIndex > 0) {
    // Supports city-first input such as "Amsterdam, Prinsengracht 263, 1016 GV".
    streetPart = parts[housePartIndex] ?? null;
    cityPart = parts[0] ?? null;
    countryPart = parts.length > 2 ? (parts[2] ?? null) : null;
  } else {
    streetPart = parts[0] ?? null;
    cityPart = parts[1] ?? null;
    countryPart = parts[2] ?? null;
  }

  const street = streetPart?.replace(HOUSE_NUMBER_PATTERN, '').replace(/\s+/g, ' ').trim() || null;
  return normalizeAddressComponents({
    country: countryPart,
    city: cityPart,
    street,
    houseNumber,
    postcode,
    unit: null,
  });
}

export function normalizeStructuredAddress(address: PropertyAddressComponents): NormalizedAddress {
  const normalized = normalizeAddressComponents(address);
  return {
    normalizedStreet: normalized.street?.toLowerCase() ?? null,
    normalizedHouseNumber: normalized.houseNumber?.toLowerCase() ?? null,
    normalizedCity: normalized.city?.toLowerCase() ?? null,
    normalizedPostcode: normalized.postcode,
  };
}

export function normalizeAddress(rawAddress: string, cityHint?: string | null): NormalizedAddress {
  return normalizeStructuredAddress(parseAddressComponents(rawAddress, cityHint));
}
