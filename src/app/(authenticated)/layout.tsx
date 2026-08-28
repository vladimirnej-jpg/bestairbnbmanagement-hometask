import type { ReactNode } from 'react';

import { ProtectedPage } from '../../components/auth/protected-page';
import { AppShell } from '../../components/layout/app-shell';

export default function AuthenticatedLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ProtectedPage allowedRoles={['OPS', 'MONITOR']}>
      <AppShell>{children}</AppShell>
    </ProtectedPage>
  );
}
