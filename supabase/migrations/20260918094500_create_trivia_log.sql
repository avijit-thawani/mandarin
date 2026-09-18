-- Trivia card analytics.
--
-- One row per card GENERATED, not per card shown: most cards never reach the screen,
-- so measuring quality from the survivors would sample the wrong population. `shown`
-- and `word_added` are patched on later, making generated -> shown -> accepted visible.
--
-- Deliberately NO foreign key to `vocabulary`: words are stored as text so that editing
-- or deleting a vocabulary row can never orphan or cascade away this history. Purely
-- additive migration — no existing table is touched.

create table if not exists public.trivia_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  card_type text not null check (card_type in ('fact', 'buildable_compound', 'missing_atom')),
  focus_word text not null,
  title text not null,
  body text not null,
  suggested_word text,
  suggested_pinyin text,
  suggested_meaning text,
  suggestion_reason text,
  shown boolean not null default false,
  -- Why a suggestion was rejected by verifySuggestion, so bad shapes are countable.
  discard_reason text,
  word_added boolean not null default false,
  model text,
  session_id uuid
);

comment on table public.trivia_log is
  'Every trivia card generated, shown or discarded, for later quality analysis. Words stored as text (no FK to vocabulary) so log rows survive vocabulary edits.';

create index if not exists trivia_log_user_created_idx
  on public.trivia_log (user_id, created_at desc);

alter table public.trivia_log enable row level security;

create policy "Users can read own trivia log"
  on public.trivia_log for select using (auth.uid() = user_id);

create policy "Users can insert own trivia log"
  on public.trivia_log for insert with check (auth.uid() = user_id);

create policy "Users can update own trivia log"
  on public.trivia_log for update using (auth.uid() = user_id);
