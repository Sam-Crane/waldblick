import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import DemoBanner from '@/components/DemoBanner';

// Sub-pages with their own back button / action bar.
const HIDE_NAV = ['/observations/', '/profile', '/settings', '/record', '/connect', '/messages/', '/plots'];

export default function AppShell() {
  const { pathname } = useLocation();
  const hideNav = HIDE_NAV.some((p) => pathname.startsWith(p));

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-on-background">
      <DemoBanner />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
