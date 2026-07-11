CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.trigger_hydrate_titles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://povnumbers.com/api/public/hooks/hydrate-titles',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_f2AAylmJPztZgxR6aZaSYQ_Cz4uMDDc'
    ),
    timeout_milliseconds := 15000
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.trigger_hydrate_titles() TO service_role;

-- Unschedule if already present (idempotent), then schedule fresh.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hydrate-belief-titles') THEN
    PERFORM cron.unschedule('hydrate-belief-titles');
  END IF;
END $$;

SELECT cron.schedule('hydrate-belief-titles', '*/15 * * * *', $$SELECT public.trigger_hydrate_titles();$$);