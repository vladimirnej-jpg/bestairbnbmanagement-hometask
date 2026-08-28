'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError } from '../../api/client';
import { useAuth } from '../../providers/auth-provider';
import { getSafeReturnPath } from './return-path';

export default function LoginPage(): React.JSX.Element {
  const { auth, login, isLoading } = useAuth();
  const router = useRouter();
  const [from, setFrom] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (auth !== null) router.replace(auth.user.role === 'MONITOR' ? '/monitoring' : '/ops');
  }, [auth, router]);
  useEffect(() => {
    setFrom(getSafeReturnPath(new URLSearchParams(window.location.search).get('from')));
  }, []);
  if (auth !== null) return <></>;
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace(getSafeReturnPath(from) ?? '/ops');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to sign in. Try again.');
    }
  };
  return (
    <main className="login-page">
      <div className="login-art">
        <div className="brand-lockup brand-on-dark">
          <span className="brand-mark">B</span>
          <div>
            <strong>BestAirbnb</strong>
            <span>Lead operations</span>
          </div>
        </div>
        <div className="login-art-copy">
          <span className="eyebrow">Operator console</span>
          <h1>Turn a first message into a confident next step.</h1>
          <p>
            Qualify incoming leads, resolve property context, and prepare a showcase when the
            evidence is ready.
          </p>
        </div>
        <div className="login-art-foot">
          <span>●</span> Connected workflow · Gmail + Google Sheets
        </div>
      </div>
      <div className="login-panel">
        <div className="login-panel-inner">
          <span className="eyebrow">Welcome back</span>
          <h2>Sign in to BestAirbnb</h2>
          <p className="panel-copy">Use your operations or monitoring account to continue.</p>
          <form className="login-form" onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ops@bestairbnb.example"
              />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="button button-primary button-large"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Continue'} <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="login-note">
            Credentials are provisioned by your BestAirbnb administrator.
          </p>
        </div>
      </div>
    </main>
  );
}
