import { z } from 'zod';

import { authorizeRequest } from '../../../../server/auth/authorize-request';
import { getContainer } from '../../../../server/container';
import { withApiHandler } from '../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ leadId: z.string().trim().min(1) }).strict();
type LeadRouteContext = { params: Promise<{ leadId: string }> };

export const GET = withApiHandler<LeadRouteContext>(
  async (request: Request, context: LeadRouteContext): Promise<Response> => {
    await authorizeRequest(request, ['OPS']);
    const { leadId } = paramsSchema.parse(await context.params);
    return Response.json(await getContainer().leadsService.getById(leadId));
  },
);
