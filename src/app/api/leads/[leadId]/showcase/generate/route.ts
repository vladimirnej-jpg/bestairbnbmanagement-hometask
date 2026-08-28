import { z } from 'zod';

import { authorizeRequest } from '../../../../../../server/auth/authorize-request';
import { getContainer } from '../../../../../../server/container';
import { withApiHandler } from '../../../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ leadId: z.string().trim().min(1) }).strict();
const bodySchema = z.object({ overwriteManual: z.boolean().optional() }).strict();
type ShowcaseGenerateRouteContext = { params: Promise<{ leadId: string }> };

export const POST = withApiHandler<ShowcaseGenerateRouteContext>(
  async (request: Request, context: ShowcaseGenerateRouteContext): Promise<Response> => {
    await authorizeRequest(request, ['OPS']);
    const { leadId } = paramsSchema.parse(await context.params);
    const input = bodySchema.parse(await request.json());
    return Response.json(
      await getContainer().showcasesService.generate(leadId, input.overwriteManual === true),
    );
  },
);
