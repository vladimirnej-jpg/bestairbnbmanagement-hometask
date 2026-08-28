import { eventType } from 'inngest';
import { z } from 'zod';

export const gmailSyncRequested = eventType('bestairbnb/gmail.sync.requested.v1', {
  schema: z
    .object({
      trigger: z.enum(['manual', 'schedule']),
      actorId: z.string().min(1).optional(),
    })
    .strict(),
});

export const leadProcessingRequested = eventType('bestairbnb/lead.process.requested.v1', {
  schema: z
    .object({
      leadId: z.string().min(1),
      reason: z.enum(['ingestion', 'manual']),
    })
    .strict(),
});

export const masterDataSyncRequested = eventType('bestairbnb/master-data.sync.requested.v1', {
  schema: z
    .object({
      trigger: z.enum(['manual', 'schedule']),
      actorId: z.string().min(1).optional(),
    })
    .strict(),
});
