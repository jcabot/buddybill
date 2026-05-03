import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../api/queries.js';

interface Props {
  children: ReactNode;
}

export function AuthGate({ children }: Props) {
  const me = useMe();
  const loc = useLocation();
  if (me.isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center text-muted">Loading…</div>
    );
  }
  if (me.isError || !me.data) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}
