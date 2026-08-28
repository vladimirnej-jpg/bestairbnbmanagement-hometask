'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { useAuth } from '../../providers/auth-provider';

export function AppShell({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { auth, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isMonitor = auth?.user.role === 'MONITOR';
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <div>
            <strong>BestAirbnb</strong>
            <span>Lead operations</span>
          </div>
        </div>
        <div className="sidebar-rule" />
        <p className="nav-label">Workspace</p>
        <nav className="primary-nav">
          {isMonitor ? null : (
            <Link
              className={navClass(pathname === '/ops' || pathname.startsWith('/ops/'))}
              href="/ops"
            >
              Operations <span aria-hidden="true">↗</span>
            </Link>
          )}
          <Link className={navClass(pathname.startsWith('/monitoring'))} href="/monitoring">
            Monitoring <span aria-hidden="true">◌</span>
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div
            className="user-badge"
            aria-label={`Signed in as ${auth?.user.email ?? 'unknown user'}`}
          >
            <span className="avatar">{auth?.user.email.slice(0, 1).toUpperCase() ?? '?'}</span>
            <span>
              <strong>{auth?.user.email}</strong>
              <small>{auth?.user.role === 'OPS' ? 'Operations' : 'Monitor'}</small>
            </span>
          </div>
          <button
            className="button button-quiet button-full"
            type="button"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            Sign out <span aria-hidden="true">→</span>
          </button>
        </div>
      </aside>
      <main id="main-content" className="main-content">
        {children}
      </main>
    </div>
  );
}

function navClass(isActive: boolean): string {
  return isActive ? 'nav-item nav-item-active' : 'nav-item';
}
