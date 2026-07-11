-- hydrate-titles (src/routes/api.public.hooks.hydrate-titles.ts) scrapes
-- pov.co's homepage and backfills beliefs.title/slug/creator_display_name,
-- but nothing was ever calling it on a schedule — checked the live table:
-- all hydrated_at values cluster into 4 timestamps within a single
-- 2-minute window (2026-07-11 02:41:43 to 02:43:50 UTC), i.e. it ran a
-- few times during manual testing and never again. 115/795 beliefs still
-- have no title as of this migration, and that gap only grows for every
-- belief created since.
--
-- Fires the existing, already-proven endpoint via pg_net instead of
-- reimplementing the scrape/parse logic in SQL (lower risk: this can't be
-- exercised against the live DB before merging, so reusing tested code
-- beats untested regex translation). SUPABASE_PUBLISHABLE_KEY is the same
-- value already shipped to the browser as VITE_SUPABASE_PUBLISHABLE_KEY,
-- so embedding it here isn't a new secret exposure.

CREATE EXTENSION IF NOT EXISTS pg_net;

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

-- Every 15 minutes: frequent enough that new beliefs get titled within a
-- reasonable window, infrequent enough to stay a good citizen of pov.co's
-- homepage rather than hammering it.
SELECT cron.schedule('hydrate-belief-titles', '*/15 * * * *', $$SELECT public.trigger_hydrate_titles();$$);

DO $$
DECLARE job_count INT;
BEGIN
  SELECT COUNT(*) INTO job_count FROM cron.job WHERE jobname = 'hydrate-belief-titles';
  IF job_count < 1 THEN
    RAISE EXCEPTION 'hydrate-belief-titles cron job did not register.';
  END IF;
END $$;
