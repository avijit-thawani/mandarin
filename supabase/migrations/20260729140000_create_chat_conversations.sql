-- Persist Chat tab conversations so prior chats can be listed and reopened
-- (previously a single rolling thread in localStorage, capped at 50 messages
-- and overwritten on every turn).
--
-- Additive: two brand new tables, no existing table is altered. The
-- chat_messages -> chat_conversations cascade is safe here because both
-- tables start empty and the child rows are meaningless without their parent
-- (deleting a conversation should delete its messages). This is NOT the
-- situation from the Feb 2 2026 incident, which added a cascading FK to a
-- column that already held UUIDs pointing at a different table.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drawer lists a user's conversations most-recently-active first.
create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- AI SDK message id (e.g. "msg-abc"), not a uuid. Unique per conversation so
  -- re-saving a growing thread upserts instead of duplicating rows.
  message_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  -- Full UIMessage parts array, so tool calls survive a reload, not just text.
  parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, message_id)
);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users can view their own conversations"
  on public.chat_conversations for select
  using (user_id = (select auth.uid()));

create policy "Users can insert their own conversations"
  on public.chat_conversations for insert
  with check (user_id = (select auth.uid()));

create policy "Users can update their own conversations"
  on public.chat_conversations for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own conversations"
  on public.chat_conversations for delete
  using (user_id = (select auth.uid()));

create policy "Users can view their own chat messages"
  on public.chat_messages for select
  using (user_id = (select auth.uid()));

create policy "Users can insert their own chat messages"
  on public.chat_messages for insert
  with check (user_id = (select auth.uid()));

-- Needed because saving a thread upserts (insert ... on conflict do update),
-- e.g. when an assistant message gains tool-call parts mid-stream.
create policy "Users can update their own chat messages"
  on public.chat_messages for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own chat messages"
  on public.chat_messages for delete
  using (user_id = (select auth.uid()));
