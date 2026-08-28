import { z } from 'zod';

const nullableAddressField = z.string().trim().min(1).nullable();

export const propertyAddressSchema = z
  .object({
    country: nullableAddressField,
    city: nullableAddressField,
    street: nullableAddressField,
    houseNumber: nullableAddressField,
    unit: nullableAddressField,
    postcode: nullableAddressField,
  })
  .strict();

export const leadExtractionSchema = z.object({
  contactEmail: z.string().email().nullable().optional(),
  contactName: z.string().trim().min(1).max(120).nullable().optional(),
  propertyAddress: propertyAddressSchema,
  confidence: z.number().min(0).max(1).default(0),
});

export type LeadExtraction = z.infer<typeof leadExtractionSchema>;
export type PropertyAddress = z.infer<typeof propertyAddressSchema>;
