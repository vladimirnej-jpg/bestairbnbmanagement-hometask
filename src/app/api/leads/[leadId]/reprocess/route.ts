import { z } from 'zod';

import { authorizeRequest } from '../../../../../server/auth/authorize-request';
import { getContainer } from '../../../../../server/container';
import { withApiHandler } from '../../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ leadId: z.string().trim().min(1) }).strict();
type ReprocessRouteContext = { params: Promise<{ leadId: string }> };

export const POST = withApiHandler<ReprocessRouteContext>(
  async (request: Request, context: ReprocessRouteContext): Promise<Response> => {
    await authorizeRequest(request, ['OPS']);
    const { leadId } = paramsSchema.parse(await context.params);
    const queued = await getContainer().workflowDispatcher.requestLeadProcessing(leadId, 'manual');
    return Response.json(queued, { status: 202 });
  },
);
