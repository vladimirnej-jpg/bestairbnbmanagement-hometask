import type { MasterDataSnapshot } from './master-data-provider';
import type { ValidatedMasterDataSnapshot } from './master-data.schemas';

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function normalizePostcode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function normalizeMasterData(snapshot: ValidatedMasterDataSnapshot): MasterDataSnapshot {
  return {
    properties: snapshot.properties.map((property) => ({
      ...property,
      addressLine1: normalizeText(property.addressLine1) ?? property.addressLine1,
      city: normalizeText(property.city) ?? property.city,
      postcode: normalizePostcode(property.postcode),
      contactEmail: property.contactEmail?.toLowerCase(),
    })),
    serviceZones: snapshot.serviceZones.map((zone) => ({
      ...zone,
      name: normalizeText(zone.name) ?? zone.name,
      city: normalizeText(zone.city),
      postcodePrefixes: zone.postcodePrefixes.map(normalizePostcode),
    })),
    services: snapshot.services.map((service) => ({
      ...service,
      name: normalizeText(service.name) ?? service.name,
      description: normalizeText(service.description),
    })),
    zoneServices: snapshot.zoneServices,
  };
}
