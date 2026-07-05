-- Append-only record of completed quiz sessions, one row per session.
-- Streaks count sessions directly instead of inferring from attempt counts
-- (round(attempts/goal)), which undercounts when questions are skipped
-- (skips are not recorded as attempts, so a session logs fewer attempts than
-- the goal and multiple real sessions round down to fewer "quizzes").
-- Additive, new table only; references auth.users just for cascade on account delete.

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  goal integer
);

create index if not exists quiz_sessions_user_created_idx on public.quiz_sessions (user_id, created_at);

alter table public.quiz_sessions enable row level security;

create policy "Users can view their own quiz sessions"
  on public.quiz_sessions for select
  using (user_id = (select auth.uid()));

create policy "Users can insert their own quiz sessions"
  on public.quiz_sessions for insert
  with check (user_id = (select auth.uid()));
