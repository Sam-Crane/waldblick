import { useEffect, useState } from 'react';
import { supabase, hasSupabase } from './supabase';
import type { CurrentUser } from './currentUser';

type SessionState = {
  user: CurrentUser | null;
  loading: boolean;
  isDemoMode: boolean;
};

const DEMO_USER: CurrentUser = {
  id: 'demo-user',
  name: 'Lukas Unterreiner',
  email: 'lukas@unterreiner.de',
  role: 'forester',
  forestName: 'Revier Eichberg',
};

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(() => ({
    user: hasSupabase ? null : DEMO_USER,
    loading: hasSupabase,
    isDemoMode: !hasSupabase,
  }));

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState({ user: mapUser(data.session?.user), loading: false, isDemoMode: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: mapUser(session?.user), loading: false, isDemoMode: false });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(u?: any): CurrentUser | null {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? '',
    name: u.user_metadata?.name ?? (u.email?.split('@')[0] ?? 'Forester'),
    role: (u.user_metadata?.role as CurrentUser['role']) ?? 'forester',
    forestName: u.user_metadata?.forest_name ?? '—',
  };
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}
