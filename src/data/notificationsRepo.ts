import { supabase, hasSupabase } from './supabase';
import type { AppNotification, NotificationKind } from './types';

export type NotificationPrefs = Partial<Record<NotificationKind, boolean>>;

export const ALL_KINDS: NotificationKind[] = [
  'critical_observation',
  'task_assigned',
  'message',
  'connection_request',
  'sync_issue',
  'user_joined',
];

type Remote = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  target_path: string | null;
  read: boolean;
  created_at: string;
};

function toDomain(r: Remote): AppNotification {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    targetPath: r.target_path ?? undefined,
    read: r.read,
    createdAt: r.created_at,
  };
}

export const notificationsRepo = {
  async list(): Promise<AppNotification[]> {
    if (!hasSupabase || !supabase) return [];
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as Remote[]).map(toDomain);
  },

  async markRead(ids: string[]): Promise<void> {
    if (!hasSupabase || !supabase || ids.length === 0) return;
    await supabase.from('notifications').update({ read: true }).in('id', ids);
  },

  async markAllRead(): Promise<void> {
    if (!hasSupabase || !supabase) return;
    const { data: session } = await supabase.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', me).eq('read', false);
  },

  async getPrefs(): Promise<NotificationPrefs> {
    if (!hasSupabase || !supabase) return {};
    const { data: session } = await supabase.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return {};
    const { data, error } = await supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('id', me)
      .single();
    if (error || !data) return {};
    return (data.notification_prefs ?? {}) as NotificationPrefs;
  },

  async updatePrefs(prefs: NotificationPrefs): Promise<boolean> {
    if (!hasSupabase || !supabase) return false;
    const { data: session } = await supabase.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return false;
    const { error } = await supabase.from('profiles').update({ notification_prefs: prefs }).eq('id', me);
    return !error;
  },

  subscribe(onChange: () => void) {
    if (!hasSupabase || !supabase) return { unsubscribe: () => {} };
    const channel = supabase
      .channel('notifications-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => onChange())
      .subscribe();
    return {
      unsubscribe: () => {
        if (supabase) void supabase.removeChannel(channel);
      },
    };
  },
};
