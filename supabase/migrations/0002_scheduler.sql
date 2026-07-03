-- Schedule the check-window Edge Function to run every 5 minutes via pg_cron + pg_net.
-- A frequent poll (vs two exact daily crons) is robust to server time drift; the
-- function is idempotent, so extra runs are harmless.
--
-- SETUP (run once, replacing the placeholders):
--   1. In the Supabase dashboard enable the extensions `pg_cron` and `pg_net`.
--   2. Store the function URL + CRON_SECRET so they aren't hardcoded in cron.job:
--        select vault.create_secret('https://YOUR_PROJECT.supabase.co/functions/v1/check-window', 'check_window_url');
--        select vault.create_secret('YOUR_CRON_SECRET', 'cron_secret');
--   3. Set the same CRON_SECRET on the function:  supabase secrets set CRON_SECRET=YOUR_CRON_SECRET
--   4. Run the schedule below.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Unschedule a prior copy if re-running this migration.
select cron.unschedule('check-window-every-5-min')
where exists (select 1 from cron.job where jobname = 'check-window-every-5-min');

select cron.schedule(
  'check-window-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'check_window_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
