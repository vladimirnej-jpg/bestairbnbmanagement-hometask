import { z } from 'zod';

import { getContainer } from '../../../../server/container';
import { ApplicationError } from '../../../../server/errors/application-error';
import { withApiHandler } from '../../../../server/errors/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string(),
  })
  .strict();

export const POST = withApiHandler(async (request: Request): Promise<Response> => {
  let input: unknown;
  try {
    input = await request.json();
  } catch (error: unknown) {
    throw new ApplicationError(400, 'VALIDATION_ERROR', 'Request validation failed', undefined, {
      cause: error,
    });
  }

  const login = loginSchema.parse(input);
  const response = await getContainer().authService.login(login);
  return Response.json(response);
});
