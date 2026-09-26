import { supabase } from '@/src/lib/supabase';

/**
 * Chat between matched riders.
 *
 * A conversation is opened by the database when a ride request is accepted, in
 * both flows, so there is nothing to create from the client. The client only
 * lists threads, reads a thread, and sends into a thread it already belongs to.
 *
 * Every function takes the signed-in rider's id because the app authenticates
 * with Firebase UIDs and the anon key, so auth.uid() is NULL and the database
 * cannot infer who is calling. The server functions verify membership; the
 * client id is therefore trusted the same way the rest of the app trusts it.
 */

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  rideId: string;
  otherUserId: string;
  otherName?: string;
  otherAvatar?: string;
  lastMessage?: string;
  lastMessageAt: string;
  unreadCount: number;
  route?: string;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function mapThread(row: Record<string, unknown>): ChatThread {
  const pickup = asString(row.pickup_address);
  const dropoff = asString(row.dropoff_address);
  return {
    id: String(row.id),
    rideId: String(row.ride_id ?? ''),
    otherUserId: String(row.other_user_id ?? ''),
    otherName: asString(row.other_name),
    otherAvatar: asString(row.other_avatar),
    lastMessage: asString(row.last_message),
    lastMessageAt: String(row.last_message_at ?? new Date().toISOString()),
    unreadCount: Number(row.unread_count ?? 0) || 0,
    route: pickup && dropoff ? `${pickup} → ${dropoff}` : undefined,
  };
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    body: String(row.body ?? ''),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export const chatService = {
  /** The caller's threads, newest activity first. */
  async listThreads(userId: string): Promise<ChatThread[]> {
    const { data, error } = await supabase.rpc('list_conversations', {
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map(mapThread);
  },

  /** One thread, and marks it read as a side effect. */
  async listMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase.rpc('list_messages', {
      p_conversation_id: conversationId,
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map(mapMessage);
  },

  async sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
  ): Promise<ChatMessage> {
    const { data, error } = await supabase.rpc('send_message', {
      p_conversation_id: conversationId,
      p_sender_id: senderId,
      p_body: body,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('The message could not be sent');
    return mapMessage(data as Record<string, unknown>);
  },

  /**
   * Streams messages as they arrive. The callback receives the raw row so the
   * caller can drop anything it has already rendered.
   */
  subscribeToMessages(
    conversationId: string,
    onMessage: (message: ChatMessage) => void,
  ) {
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => onMessage(mapMessage(payload.new as Record<string, unknown>)),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
