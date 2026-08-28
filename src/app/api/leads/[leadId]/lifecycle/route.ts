import { LifecycleStatus } from '@prisma/client';
import { z } from 'zod';

import { authorizeRequest } from '../../../../../server/auth/authorize-request';
import { getContainer } from '../../../../../server/container';
import { withApiHandler } from '../../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ leadId: z.string().trim().min(1) }).strict();
const bodySchema = z
  .object({
    status: z.nativeEnum(LifecycleStatus),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
type LifecycleRouteContext = { params: Promise<{ leadId: string }> };

export const PATCH = withApiHandler<LifecycleRouteContext>(
  async (request: Request, context: LifecycleRouteContext): Promise<Response> => {
    const user = await authorizeRequest(request, ['OPS']);
    const { leadId } = paramsSchema.parse(await context.params);
    const input = bodySchema.parse(await request.json());
    return Response.json(
      await getContainer().leadsService.updateLifecycle(
        leadId,
        input.status,
        input.reason?.trim() || null,
        user.id,
      ),
    );
  },
);
