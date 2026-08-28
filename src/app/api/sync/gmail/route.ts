import { authorizeRequest } from '../../../../server/auth/authorize-request';
import { getContainer } from '../../../../server/container';
import { withApiHandler } from '../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiHandler(async (request: Request): Promise<Response> => {
  const user = await authorizeRequest(request, ['OPS']);
  const queued = await getContainer().workflowDispatcher.requestGmailSync('manual', user.id);
  return Response.json(queued, { status: 202 });
});
