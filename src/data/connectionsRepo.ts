import { supabase, hasSupabase } from './supabase';
import type { Connection } from './types';

type ProfileRow = { id: string; name: string | null; invite_code: string; role: string };

type RemoteConn = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: Connection['status'];
  created_at: string;
  updated_at: string;
};

function toDomain(r: RemoteConn): Connection {
  return {
    id: r.id,
    requesterId: r.requester_id,
    addresseeId: r.addressee_id,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const connectionsRepo = {
  async myInviteCode(): Promise<string | null> {
    if (!hasSupabase || !supabase) return null;
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return null;
    const { data, error } = await supabase.from('profiles').select('invite_code').eq('id', userId).single();
    if (error || !data) return null;
    return data.invite_code as string;
  },

  async sendRequest(inviteCode: string): Promise<{ ok: true; contact: ProfileRow } | { ok: false; error: string }> {
    if (!hasSupabase || !supabase) return { ok: false, error: 'supabase_missing' };
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return { ok: false, error: 'not_authenticated' };

    const code = inviteCode.trim().toUpperCase();
    const { data: target, error: lookupErr } = await supabase
      .from('profiles')
      .select('id, name, invite_code, role')
      .eq('invite_code', code)
      .single();
    if (lookupErr || !target) return { ok: false, error: 'code_not_found' };
    if (target.id === userId) return { ok: false, error: 'cannot_connect_self' };

    const { error: insertErr } = await supabase
      .from('connections')
      .insert({ requester_id: userId, addressee_id: target.id, status: 'pending' });
    if (insertErr) return { ok: false, error: insertErr.message };
    return { ok: true, contact: target as ProfileRow };
  },

  async accept(connectionId: string): Promise<boolean> {
    if (!hasSupabase || !supabase) return false;
    const { error } = await supabase
      .from('connections')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', connectionId);
    return !error;
  },

  async list(): Promise<Connection[]> {
    if (!hasSupabase || !supabase) return [];
    const { data, error } = await supabase.from('connections').select('*');
    if (error || !data) return [];
    return (data as RemoteConn[]).map(toDomain);
  },

  // Look up the "other" party's profile for each connection in one round-trip.
  async listWithProfiles(): Promise<
    Array<Connection & { other: { id: string; name: string | null; role: string } }>
  > {
    if (!hasSupabase || !supabase) return [];
    const { data: session } = await supabase.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return [];
    const conns = await this.list();
    if (conns.length === 0) return [];
    const otherIds = conns.map((c) => (c.requesterId === me ? c.addresseeId : c.requesterId));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, role')
      .in('id', otherIds);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return conns.map((c) => ({ ...c, other: byId.get(c.requesterId === me ? c.addresseeId : c.requesterId) ?? { id: '', name: null, role: 'forester' } }));
  },
};
