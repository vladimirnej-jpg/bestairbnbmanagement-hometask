interface ServiceZoneCriteria {
  readonly normalizedCity: string | null;
  readonly postcodePrefixes: readonly string[];
}

export function matchesServiceZone(
  zone: ServiceZoneCriteria,
  postcode: string | null,
  city: string | null,
): boolean {
  const postcodeMatches =
    postcode !== null && zone.postcodePrefixes.some((prefix) => postcode.startsWith(prefix));
  if (!postcodeMatches) return false;
  return zone.normalizedCity === null || (city !== null && zone.normalizedCity === city);
}
