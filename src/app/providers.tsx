'use client';

import type { ReactNode } from 'react';

import { ErrorBoundary } from '../components/layout/error-boundary';
import { AuthProvider } from '../providers/auth-provider';
import { QueryProvider } from '../providers/query-provider';

export function Providers({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>{children}</AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
