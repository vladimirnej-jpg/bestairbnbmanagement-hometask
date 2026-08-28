'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useEffect, type ReactNode } from 'react';

import { login as requestLogin } from '../api/auth';
import { clearStoredAuth, readStoredAuth, writeStoredAuth, type StoredAuth } from '../api/client';

interface AuthContextValue {
  readonly auth: StoredAuth | null;
  readonly isReady: boolean;
  readonly isLoading: boolean;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setAuth(readStoredAuth());
    setIsReady(true);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await requestLogin(email, password);
      const nextAuth: StoredAuth = {
        accessToken: result.accessToken,
        user: result.user,
      };
      writeStoredAuth(nextAuth);
      setAuth(nextAuth);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback((): void => {
    clearStoredAuth();
    setAuth(null);
  }, []);

  const value = useMemo(
    () => ({ auth, isReady, isLoading, login, logout }),
    [auth, isReady, isLoading, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === undefined) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
