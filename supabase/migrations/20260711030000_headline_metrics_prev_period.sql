
-- Migration: headline_metrics() now also returns the previous period's
-- values (the equal-length window immediately before the selected range)
-- so the dashboard can show period-over-period % change. For 'all' there
-- is no prior period, so the *_prev columns come back NULL.
--
-- RETURNS TABLE shape changes, so the function must be dropped first —
-- CREATE OR REPLACE cannot alter an existing function's return columns.
DROP FUNCTION IF EXISTS public.headline_metrics(text);

CREATE FUNCTION public.headline_metrics(range_key text)
RETURNS TABLE(
  buy_volume_usd            numeric,
  active_traders            integer,
  new_beliefs                integer,
  creator_revenue_usd       numeric,
  degen_allocation_usd      numeric,
  buy_volume_usd_prev       numeric,
  active_traders_prev       integer,
  new_beliefs_prev          integer,
  creator_revenue_usd_prev  numeric,
  degen_allocation_usd_prev numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH b AS (
    SELECT
      CASE range_key
        WHEN '1h'  THEN INTERVAL '1 hour'
        WHEN '24h' THEN INTERVAL '24 hours'
        WHEN '7d'  THEN INTERVAL '7 days'
        WHEN '30d' THEN INTERVAL '30 days'
        WHEN 'all' THEN NULL
        ELSE INTERVAL '24 hours'
      END AS window
  ),
  bounds AS (
    SELECT
      window,
      NOW() - window     AS cur_start,
      NOW() - 2 * window AS prev_start,
      NOW() - window     AS prev_end
    FROM b
  ),
  buys AS (
    SELECT
      COALESCE(SUM(gross_amount_usd), 0)::NUMERIC AS vol,
      COUNT(DISTINCT wallet_address)::INT        AS traders
    FROM public.trades, bounds
    WHERE action = 'buy' AND is_canonical = TRUE
      AND (bounds.window IS NULL OR block_timestamp >= bounds.cur_start)
  ),
  creates AS (
    SELECT COUNT(*)::INT AS n
    FROM public.beliefs, bounds
    WHERE (bounds.window IS NULL OR created_at >= bounds.cur_start)
  ),
  buys_prev AS (
    SELECT
      SUM(gross_amount_usd)::NUMERIC      AS vol,
      COUNT(DISTINCT wallet_address)::INT AS traders
    FROM public.trades, bounds
    WHERE bounds.window IS NOT NULL
      AND action = 'buy' AND is_canonical = TRUE
      AND block_timestamp >= bounds.prev_start
      AND block_timestamp <  bounds.prev_end
  ),
  creates_prev AS (
    SELECT COUNT(*)::INT AS n
    FROM public.beliefs, bounds
    WHERE bounds.window IS NOT NULL
      AND created_at >= bounds.prev_start
      AND created_at <  bounds.prev_end
  )
  SELECT
    buys.vol,
    buys.traders,
    creates.n,
    (buys.vol * 0.10 * 0.3333)::NUMERIC,
    (buys.vol * 0.10 * 0.50)::NUMERIC,
    CASE WHEN (SELECT window FROM bounds) IS NULL THEN NULL ELSE buys_prev.vol END,
    CASE WHEN (SELECT window FROM bounds) IS NULL THEN NULL ELSE buys_prev.traders END,
    CASE WHEN (SELECT window FROM bounds) IS NULL THEN NULL ELSE creates_prev.n END,
    CASE WHEN (SELECT window FROM bounds) IS NULL OR buys_prev.vol IS NULL
      THEN NULL ELSE (buys_prev.vol * 0.10 * 0.3333)::NUMERIC END,
    CASE WHEN (SELECT window FROM bounds) IS NULL OR buys_prev.vol IS NULL
      THEN NULL ELSE (buys_prev.vol * 0.10 * 0.50)::NUMERIC END
  FROM buys, creates, buys_prev, creates_prev;
$function$;

GRANT EXECUTE ON FUNCTION public.headline_metrics(text) TO anon, authenticated;
