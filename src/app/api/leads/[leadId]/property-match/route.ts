import { z } from 'zod';

import { authorizeRequest } from '../../../../../server/auth/authorize-request';
import { getContainer } from '../../../../../server/container';
import { withApiHandler } from '../../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ leadId: z.string().trim().min(1) }).strict();
const bodySchema = z.object({ masterPropertyId: z.string().trim().min(1) }).strict();
type PropertyMatchRouteContext = { params: Promise<{ leadId: string }> };

export const POST = withApiHandler<PropertyMatchRouteContext>(
  async (request: Request, context: PropertyMatchRouteContext): Promise<Response> => {
    await authorizeRequest(request, ['OPS']);
    const { leadId } = paramsSchema.parse(await context.params);
    const input = bodySchema.parse(await request.json());
    await getContainer().propertiesService.confirmMatch(leadId, input.masterPropertyId);
    return Response.json({ status: 'ok' as const });
  },
);
