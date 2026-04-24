import { supabase, hasSupabase } from './supabase';
import type { ChatMessage, Conversation } from './types';

type RemoteConv = {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string | null;
  created_at: string;
};

type RemoteMsg = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  observation_id: string | null;
  created_at: string;
};

function toConv(r: RemoteConv): Conversation {
  return {
    id: r.id,
    participantA: r.participant_a,
    participantB: r.participant_b,
    lastMessageAt: r.last_message_at ?? undefined,
    createdAt: r.created_at,
  };
}

function toMsg(r: RemoteMsg): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    authorId: r.author_id,
    body: r.body,
    observationId: r.observation_id ?? undefined,
    createdAt: r.created_at,
  };
}

// Conversations are keyed on the UNORDERED pair (a,b) with the DB constraint
// participant_a < participant_b. We normalize before upsert.
function orderedPair(me: string, other: string): [string, string] {
  return me < other ? [me, other] : [other, me];
}

export const messagingRepo = {
  async ensureConversation(otherUserId: string): Promise<Conversation | null> {
    if (!hasSupabase || !supabase) return null;
    const { data: session } = await supabase.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return null;
    const [a, b] = orderedPair(me, otherUserId);

    // Try to find an existing row first so we don't rely on upsert onConflict
    // ordering (simpler + cheaper when the row already exists).
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('participant_a', a)
      .eq('participant_b', b)
      .maybeSingle();
    if (existing) return toConv(existing as RemoteConv);

    const { data, error } = await supabase
      .from('conversations')
      .insert({ participant_a: a, participant_b: b })
      .select()
      .single();
    if (error || !data) return null;
    return toConv(data as RemoteConv);
  },

  async listConversationsForMe(): Promise<Conversation[]> {
    if (!hasSupabase || !supabase) return [];
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error || !data) return [];
    return (data as RemoteConv[]).map(toConv);
  },

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    if (!hasSupabase || !supabase) return [];
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error || !data) return [];
    return (data as RemoteMsg[]).map(toMsg);
  },

  async send(conversationId: string, body: string, observationId?: string): Promise<ChatMessage | null> {
    if (!hasSupabase || !supabase) return null;
    const { data: session } = await supabase.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return null;
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        author_id: me,
        body,
        observation_id: observationId ?? null,
      })
      .select()
      .single();
    if (error || !data) return null;
    return toMsg(data as RemoteMsg);
  },

  subscribeMessages(conversationId: string, onAdded: (m: ChatMessage) => void) {
    if (!hasSupabase || !supabase) return { unsubscribe: () => {} };
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as RemoteMsg;
          if (row) onAdded(toMsg(row));
        },
      )
      .subscribe();
    return {
      unsubscribe: () => {
        if (supabase) void supabase.removeChannel(channel);
      },
    };
  },

  subscribeConversations(onChange: () => void) {
    if (!hasSupabase || !supabase) return { unsubscribe: () => {} };
    const channel = supabase
      .channel('conversations-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => onChange())
      .subscribe();
    return {
      unsubscribe: () => {
        if (supabase) void supabase.removeChannel(channel);
      },
    };
  },
};
