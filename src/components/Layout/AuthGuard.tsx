import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '@/data/session';

export default function AuthGuard() {
  const { user, loading, isDemoMode } = useSession();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  // Demo mode: no Supabase env — let everything through.
  if (isDemoMode) return <Outlet />;

  if (!user) {
    return <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  }

  return <Outlet />;
}
