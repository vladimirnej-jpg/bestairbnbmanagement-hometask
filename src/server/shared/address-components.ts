export interface PropertyAddressComponents {
  readonly country: string | null;
  readonly city: string | null;
  readonly street: string | null;
  readonly houseNumber: string | null;
  readonly unit: string | null;
  readonly postcode: string | null;
}

export const emptyPropertyAddress: PropertyAddressComponents = {
  country: null,
  city: null,
  street: null,
  houseNumber: null,
  unit: null,
  postcode: null,
};

export function normalizeAddressComponents(
  input: Partial<PropertyAddressComponents>,
): PropertyAddressComponents {
  let street = cleanComponent(input.street);
  let houseNumber = cleanComponent(input.houseNumber);

  if (houseNumber === null && street !== null) {
    const embeddedHouseNumber = street.match(/\b(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\b/);
    if (embeddedHouseNumber?.[1] !== undefined) {
      houseNumber = embeddedHouseNumber[1].toLowerCase();
      street = street.replace(embeddedHouseNumber[0], '').replace(/\s+/g, ' ').trim() || null;
    }
  } else if (houseNumber !== null && street !== null) {
    const escapedHouseNumber = houseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    street =
      street
        .replace(new RegExp(`\\b${escapedHouseNumber}\\b`, 'i'), '')
        .replace(/\s+/g, ' ')
        .trim() || null;
  }

  return {
    country: cleanComponent(input.country),
    city: cleanComponent(input.city),
    street,
    houseNumber,
    unit: cleanComponent(input.unit),
    postcode: normalizePostcode(input.postcode),
  };
}

export function formatAddressComponents(address: PropertyAddressComponents): string | null {
  const street = [address.street, address.houseNumber].filter(isPresent).join(' ').trim();
  const parts = [street, address.unit, address.city, address.postcode, address.country].filter(
    isPresent,
  );
  return parts.length === 0 ? null : parts.join(', ');
}

function cleanComponent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length === 0 ? null : cleaned;
}

function normalizePostcode(value: unknown): string | null {
  const cleaned = cleanComponent(value);
  return cleaned === null ? null : cleaned.replace(/\s+/g, '').toUpperCase();
}

function isPresent(value: string | null): value is string {
  return value !== null && value.length > 0;
}
