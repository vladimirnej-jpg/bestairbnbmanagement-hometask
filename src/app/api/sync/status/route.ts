import { authorizeRequest } from '../../../../server/auth/authorize-request';
import { getContainer } from '../../../../server/container';
import { withApiHandler } from '../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (request: Request): Promise<Response> => {
  await authorizeRequest(request, ['OPS', 'MONITOR']);
  return Response.json(await getContainer().syncService.getStatus());
});
