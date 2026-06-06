-- Per-day streak goal recorded going forward (one quiz session's cardsPerSession).
-- Additive, new table only; does not touch quiz_attempts or any existing user data.
-- The on delete cascade references auth.users only (cleanup when an account is deleted).

create table if not exists public.daily_goals (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  goal       integer not null check (goal > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.daily_goals enable row level security;

create policy "Users can view their own daily goals"
  on public.daily_goals for select
  using (user_id = (select auth.uid()));

create policy "Users can insert their own daily goals"
  on public.daily_goals for insert
  with check (user_id = (select auth.uid()));

create policy "Users can update their own daily goals"
  on public.daily_goals for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
