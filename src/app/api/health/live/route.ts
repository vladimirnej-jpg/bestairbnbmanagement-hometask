import { withApiHandler } from '../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (): Promise<Response> => {
  return Response.json({ status: 'ok' as const });
});
