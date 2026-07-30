// Persistence for Chat tab conversations (chat_conversations + chat_messages).
// Replaces the old single rolling thread in localStorage so prior chats can be
// listed and reopened, and so history follows the user across devices.
import type { UIMessage } from 'ai';
import { supabase, isSupabaseConfigured } from './supabase';

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

const UNTITLED = 'New chat';

/** Fallback title when the model-generated one isn't available. */
export function fallbackTitle(messages: UIMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  const text = firstUser?.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join(' ')
    .trim();
  if (!text) return UNTITLED;
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[ChatHistory] Failed to list conversations:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id as string,
    title: (row.title as string | null) || null,
    updatedAt: row.updated_at as string,
  }));
}

export async function createConversation(userId: string, title?: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, title: title || null })
    .select('id')
    .single();

  if (error) {
    console.error('[ChatHistory] Failed to create conversation:', error);
    return null;
  }
  return data.id as string;
}

export async function loadConversation(conversationId: string): Promise<UIMessage[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('chat_messages')
    .select('message_id, role, parts')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[ChatHistory] Failed to load conversation:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.message_id as string,
    role: row.role as UIMessage['role'],
    parts: row.parts as UIMessage['parts'],
  }));
}

/**
 * Upsert every message in the thread. Idempotent via the
 * (conversation_id, message_id) unique constraint, so it's safe to call
 * repeatedly as a thread grows or as an assistant message gains tool parts.
 */
export async function saveMessages(
  userId: string,
  conversationId: string,
  messages: UIMessage[],
): Promise<void> {
  if (!isSupabaseConfigured() || messages.length === 0) return;

  const rows = messages.map((m, i) => ({
    conversation_id: conversationId,
    user_id: userId,
    message_id: m.id,
    role: m.role,
    parts: m.parts,
    // Preserve thread order even when several messages land in the same tick.
    created_at: new Date(Date.now() + i).toISOString(),
  }));

  const { error } = await supabase
    .from('chat_messages')
    .upsert(rows, { onConflict: 'conversation_id,message_id' });

  if (error) {
    console.error('[ChatHistory] Failed to save messages:', error);
    return;
  }

  await touchConversation(conversationId);
}

export async function touchConversation(conversationId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) console.error('[ChatHistory] Failed to touch conversation:', error);
}

export async function renameConversation(conversationId: string, title: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await supabase
    .from('chat_conversations')
    .update({ title })
    .eq('id', conversationId);

  if (error) console.error('[ChatHistory] Failed to rename conversation:', error);
}

/** Messages go with it via the chat_messages -> chat_conversations cascade. */
export async function deleteConversation(conversationId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', conversationId);

  if (error) console.error('[ChatHistory] Failed to delete conversation:', error);
}

/**
 * Ask the chat model for a short title, using the same Netlify function (and
 * therefore the same configured model) that powers the conversation itself.
 */
export async function generateTitle(messages: UIMessage[]): Promise<string> {
  const fallback = fallbackTitle(messages);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return fallback;

    const res = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode: 'title', messages }),
    });
    if (!res.ok) return fallback;

    const { title } = await res.json() as { title?: string };
    const clean = title?.trim().replace(/^["']|["']$/g, '');
    return clean || fallback;
  } catch {
    return fallback;
  }
}

/** Today / Yesterday / Previous 7 days / Older, like ChatGPT's sidebar. */
export function groupConversations(
  conversations: ConversationSummary[],
): { label: string; items: ConversationSummary[] }[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const weekAgo = new Date(startOfToday);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const buckets: Record<string, ConversationSummary[]> = {
    Today: [], Yesterday: [], 'Previous 7 days': [], Older: [],
  };

  for (const c of conversations) {
    const when = new Date(c.updatedAt);
    if (when >= startOfToday) buckets.Today.push(c);
    else if (when >= startOfYesterday) buckets.Yesterday.push(c);
    else if (when >= weekAgo) buckets['Previous 7 days'].push(c);
    else buckets.Older.push(c);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
