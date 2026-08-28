'use client';

import { useQuery } from '@tanstack/react-query';

import { ApiError } from '../../../api/client';
import { getMonitoringOverview } from '../../../api/monitoring';
import { MonitoringOverview } from '../../../features/monitoring/components/monitoring-overview';
import { useAuth } from '../../../providers/auth-provider';
import { ErrorState, LoadingState } from '../../../components/ui/data-state';

export default function MonitoringPage(): React.JSX.Element {
  const { auth } = useAuth();
  const query = useQuery({
    queryKey: ['monitoring-overview'],
    queryFn: () => getMonitoringOverview(auth?.accessToken ?? ''),
    enabled: auth !== null,
    refetchInterval: 60_000,
  });
  if (query.isPending)
    return (
      <div className="page-wrap">
        <LoadingState label="Loading monitoring" />
      </div>
    );
  if (query.isError)
    return (
      <div className="page-wrap">
        <ErrorState
          message={
            query.error instanceof ApiError
              ? query.error.message
              : 'The monitoring service is unavailable.'
          }
          retry={() => {
            void query.refetch();
          }}
        />
      </div>
    );
  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <span className="eyebrow">Read-only / system pulse</span>
          <h1>Monitoring</h1>
          <p>Provider health and operational queues at a glance.</p>
        </div>
        <div className="header-meta">
          <span className="live-indicator">
            <span aria-hidden="true" /> Auto-refresh · 60 sec
          </span>
        </div>
      </header>
      <MonitoringOverview overview={query.data} canOpenLeads={auth?.user.role === 'OPS'} />
    </div>
  );
}
