import 'server-only';

import type { UserRole } from '@prisma/client';

import type { AuthenticatedUser } from './auth-service';
import { getContainer } from '../container';

export function authorizeRequest(
  request: Request,
  roles: readonly UserRole[] = [],
): Promise<AuthenticatedUser> {
  return getContainer().authService.authorizeRequest(request, roles);
}
