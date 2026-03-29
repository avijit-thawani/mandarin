-- Enable required extensions for scheduled Edge Function invocation.
-- pg_cron: periodic job scheduler within Postgres
-- pg_net: allows Postgres to make outbound HTTP requests
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The actual cron.schedule() call must be run manually in the SQL Editor
-- because it contains secrets that should not be committed to the repo.
--
-- See the CRON SETUP section in README for the SQL to run.
