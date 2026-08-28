'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import type { StoredAuth } from '../../api/client';
import { LoadingState } from '../ui/data-state';
import { useAuth } from '../../providers/auth-provider';

export function ProtectedPage({
  children,
  allowedRoles,
}: {
  readonly children: ReactNode;
  readonly allowedRoles?: StoredAuth['user']['role'][];
}): React.JSX.Element {
  const { auth, isReady } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    if (auth === null) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
      return;
    }
    if (allowedRoles !== undefined && !allowedRoles.includes(auth.user.role)) {
      router.replace(auth.user.role === 'MONITOR' ? '/monitoring' : '/ops');
    }
  }, [allowedRoles, auth, isReady, pathname, router]);

  if (!isReady || auth === null) return <LoadingState label="Checking access" />;
  if (allowedRoles !== undefined && !allowedRoles.includes(auth.user.role)) {
    return <LoadingState label="Redirecting" />;
  }
  return <>{children}</>;
}
