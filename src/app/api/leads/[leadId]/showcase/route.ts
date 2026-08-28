import { z } from 'zod';

import { authorizeRequest } from '../../../../../server/auth/authorize-request';
import { getContainer } from '../../../../../server/container';
import { withApiHandler } from '../../../../../server/errors/api-handler';
import { showcaseContentSchema } from '../../../../../server/modules/showcases/showcase-content.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ leadId: z.string().trim().min(1) }).strict();
type ShowcaseRouteContext = { params: Promise<{ leadId: string }> };

export const GET = withApiHandler<ShowcaseRouteContext>(
  async (request: Request, context: ShowcaseRouteContext): Promise<Response> => {
    await authorizeRequest(request, ['OPS']);
    const { leadId } = paramsSchema.parse(await context.params);
    return Response.json(await getContainer().showcasesService.get(leadId));
  },
);

export const PATCH = withApiHandler<ShowcaseRouteContext>(
  async (request: Request, context: ShowcaseRouteContext): Promise<Response> => {
    await authorizeRequest(request, ['OPS']);
    const { leadId } = paramsSchema.parse(await context.params);
    const input = showcaseContentSchema.parse(await request.json());
    return Response.json(await getContainer().showcasesService.edit(leadId, input));
  },
);
