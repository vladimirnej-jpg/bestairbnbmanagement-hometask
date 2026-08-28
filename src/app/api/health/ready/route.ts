import { getContainer } from '../../../../server/container';
import { ApplicationError } from '../../../../server/errors/application-error';
import { withApiHandler } from '../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (): Promise<Response> => {
  try {
    await getContainer().prisma.$queryRaw`SELECT 1`;
  } catch (error: unknown) {
    throw new ApplicationError(503, 'DATABASE_UNAVAILABLE', 'Database is not ready', undefined, {
      cause: error,
    });
  }

  return Response.json({ status: 'ok' as const, database: 'ok' as const });
});
