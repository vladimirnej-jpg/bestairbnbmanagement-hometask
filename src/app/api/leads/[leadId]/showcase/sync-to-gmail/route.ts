import { z } from 'zod';

import { authorizeRequest } from '../../../../../../server/auth/authorize-request';
import { getContainer } from '../../../../../../server/container';
import { withApiHandler } from '../../../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ leadId: z.string().trim().min(1) }).strict();
type ShowcaseSyncRouteContext = { params: Promise<{ leadId: string }> };

export const POST = withApiHandler<ShowcaseSyncRouteContext>(
  async (request: Request, context: ShowcaseSyncRouteContext): Promise<Response> => {
    await authorizeRequest(request, ['OPS']);
    const { leadId } = paramsSchema.parse(await context.params);
    return Response.json(await getContainer().showcasesService.syncDraft(leadId));
  },
);
