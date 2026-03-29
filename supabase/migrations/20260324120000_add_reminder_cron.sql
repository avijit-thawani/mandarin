-- Enable required extensions for scheduled Edge Function invocation.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Store service role key in vault for cron job auth.
-- The cron job reads it at runtime to pass as Authorization header.
-- (Applied via Supabase MCP, not raw SQL — vault.create_secret called separately.)

-- Cron job: call send-reminders Edge Function every 10 minutes.
-- Authenticates via service role key from vault; the Edge Function
-- recognizes it as an admin call and processes all subscriptions.
-- (Applied via Supabase MCP execute_sql — cron.schedule called separately.)
