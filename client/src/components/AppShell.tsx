import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from './Logo.js';
import { Button } from './ui/Button.js';
import { useLogout, useMe } from '../api/queries.js';

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props) {
  const me = useMe();
  const logout = useLogout();
  const nav = useNavigate();

  return (
    <div className="min-h-full">
      <header className="border-b border-border bg-surface/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/">
            <Logo />
          </Link>
          {me.data && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted hidden sm:block">{me.data.email}</span>
              <Button
                variant="ghost"
                onClick={() =>
                  logout.mutate(undefined, {
                    onSuccess: () => nav('/login', { replace: true }),
                  })
                }
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">{children}</main>
    </div>
  );
}
