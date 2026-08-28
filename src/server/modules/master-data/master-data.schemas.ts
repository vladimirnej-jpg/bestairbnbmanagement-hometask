import { z } from 'zod';

const externalId = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(500).optional();

export const masterPropertyRecordSchema = z.object({
  externalId,
  addressLine1: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(200),
  postcode: z.string().trim().min(1).max(30),
  contactEmail: z.string().trim().email().optional(),
  sourceUpdatedAt: z.string().datetime().optional(),
  isActive: z.boolean().optional().default(true),
});

export const serviceZoneRecordSchema = z.object({
  externalId,
  name: z.string().trim().min(1).max(200),
  city: optionalText,
  postcodePrefixes: z.array(z.string().trim().min(1).max(20)).min(1).max(100),
  isActive: z.boolean().optional().default(true),
});

export const serviceRecordSchema = z.object({
  externalId,
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  isActive: z.boolean().optional().default(true),
});

export const zoneServiceRecordSchema = z.object({
  serviceZoneExternalId: externalId,
  serviceExternalId: externalId,
  isActive: z.boolean().optional().default(true),
});

export const masterDataSnapshotSchema = z.object({
  properties: z.array(masterPropertyRecordSchema),
  serviceZones: z.array(serviceZoneRecordSchema),
  services: z.array(serviceRecordSchema),
  zoneServices: z.array(zoneServiceRecordSchema),
});

export type ValidatedMasterDataSnapshot = z.infer<typeof masterDataSnapshotSchema>;

function assertUnique(values: readonly string[], path: string, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate external id '${value}'`,
        path: [path, index, 'externalId'],
      });
    }
    seen.add(value);
  });
}

export const validatedMasterDataSnapshotSchema = masterDataSnapshotSchema.superRefine(
  (snapshot, context) => {
    assertUnique(
      snapshot.properties.map((record) => record.externalId),
      'properties',
      context,
    );
    assertUnique(
      snapshot.serviceZones.map((record) => record.externalId),
      'serviceZones',
      context,
    );
    assertUnique(
      snapshot.services.map((record) => record.externalId),
      'services',
      context,
    );

    const zones = new Set(snapshot.serviceZones.map((record) => record.externalId));
    const services = new Set(snapshot.services.map((record) => record.externalId));
    const assignments = new Set<string>();

    snapshot.zoneServices.forEach((assignment, index) => {
      const key = `${assignment.serviceZoneExternalId}:${assignment.serviceExternalId}`;
      if (!zones.has(assignment.serviceZoneExternalId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown service zone '${assignment.serviceZoneExternalId}'`,
          path: ['zoneServices', index, 'serviceZoneExternalId'],
        });
      }
      if (!services.has(assignment.serviceExternalId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown service '${assignment.serviceExternalId}'`,
          path: ['zoneServices', index, 'serviceExternalId'],
        });
      }
      if (assignments.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate zone-service assignment '${key}'`,
          path: ['zoneServices', index],
        });
      }
      assignments.add(key);
    });
  },
);
