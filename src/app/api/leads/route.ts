import { LifecycleStatus, QualificationStatus, ShowcaseStatus } from '@prisma/client';
import { z } from 'zod';

import { authorizeRequest } from '../../../server/auth/authorize-request';
import { getContainer } from '../../../server/container';
import { withApiHandler } from '../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listLeadsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    lifecycleStatus: z.nativeEnum(LifecycleStatus).optional(),
    qualificationStatus: z.nativeEnum(QualificationStatus).optional(),
    showcaseStatus: z.nativeEnum(ShowcaseStatus).optional(),
    search: z.string().max(100).optional(),
  })
  .strict();

export const GET = withApiHandler(async (request: Request): Promise<Response> => {
  await authorizeRequest(request, ['OPS']);
  const query = listLeadsQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  return Response.json(
    await getContainer().leadsService.list({
      ...query,
      search: query.search?.trim(),
    }),
  );
});
