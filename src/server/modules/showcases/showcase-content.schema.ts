import { z } from 'zod';

export const showcaseContentSchema = z
  .object({
    subject: z.string().trim().min(1).max(160),
    greeting: z.string().trim().min(1).max(300),
    propertySummary: z.string().trim().min(1).max(600),
    selectedServices: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
    observations: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
    callToAction: z.string().trim().min(1).max(300),
    masterDataWarning: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type ShowcaseContentInput = z.infer<typeof showcaseContentSchema>;
