DROP FUNCTION IF EXISTS public.headline_metrics(text);
CREATE OR REPLACE FUNCTION public.headline_metrics(range_key text)
 RETURNS TABLE(buy_volume_usd numeric, active_traders integer, new_beliefs integer, creator_revenue_usd numeric, degen_allocation_usd numeric, buy_volume_usd_prev numeric, active_traders_prev integer, new_beliefs_prev integer, creator_revenue_usd_prev numeric, degen_allocation_usd_prev numeric, buy_volume_eth numeric, creator_revenue_eth numeric, degen_allocation_eth numeric, buy_volume_eth_prev numeric, creator_revenue_eth_prev numeric, degen_allocation_eth_prev numeric, transactions integer, transactions_prev integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH tz AS (SELECT 'America/New_York'::text AS zone),
  midnight AS (
    SELECT (date_trunc('day', now() AT TIME ZONE zone)) AT TIME ZONE zone AS today_start FROM tz
  ),
  bounds AS (
    SELECT
      CASE range_key
        WHEN '1h'  THEN now() - INTERVAL '1 hour'
        WHEN '24h' THEN (SELECT today_start FROM midnight) - INTERVAL '1 day'
        WHEN '7d'  THEN (SELECT today_start FROM midnight) - INTERVAL '7 days'
        WHEN '30d' THEN (SELECT today_start FROM midnight) - INTERVAL '30 days'
        WHEN 'all' THEN NULL
        ELSE (SELECT today_start FROM midnight) - INTERVAL '1 day'
      END AS cur_start,
      CASE range_key
        WHEN '1h'  THEN now()
        WHEN '24h' THEN (SELECT today_start FROM midnight)
        WHEN '7d'  THEN (SELECT today_start FROM midnight)
        WHEN '30d' THEN (SELECT today_start FROM midnight)
        WHEN 'all' THEN NULL
        ELSE (SELECT today_start FROM midnight)
      END AS cur_end,
      CASE range_key
        WHEN '1h'  THEN INTERVAL '1 hour'
        WHEN '24h' THEN INTERVAL '1 day'
        WHEN '7d'  THEN INTERVAL '7 days'
        WHEN '30d' THEN INTERVAL '30 days'
        ELSE INTERVAL '1 day'
      END AS win
  ),
  buys AS (
    SELECT
      COALESCE(SUM(gross_amount_usd),0)::NUMERIC AS vol_usd,
      COALESCE(SUM(gross_amount_native)/1e18,0)::NUMERIC AS vol_eth,
      COUNT(DISTINCT wallet_address)::INT AS traders,
      COUNT(*)::INT AS tx_count
    FROM public.trades, bounds
    WHERE action='buy' AND is_canonical=TRUE
      AND (bounds.cur_start IS NULL OR (block_timestamp >= bounds.cur_start AND block_timestamp < bounds.cur_end))
  ),
  creates AS (
    SELECT COUNT(*)::INT AS n FROM public.beliefs, bounds
    WHERE (bounds.cur_start IS NULL OR (created_at >= bounds.cur_start AND created_at < bounds.cur_end))
  ),
  buys_prev AS (
    SELECT
      SUM(gross_amount_usd)::NUMERIC AS vol_usd,
      (SUM(gross_amount_native)/1e18)::NUMERIC AS vol_eth,
      COUNT(DISTINCT wallet_address)::INT AS traders,
      COUNT(*)::INT AS tx_count
    FROM public.trades, bounds
    WHERE bounds.cur_start IS NOT NULL AND action='buy' AND is_canonical=TRUE
      AND block_timestamp >= bounds.cur_start - bounds.win
      AND block_timestamp < bounds.cur_start
  ),
  creates_prev AS (
    SELECT COUNT(*)::INT AS n FROM public.beliefs, bounds
    WHERE bounds.cur_start IS NOT NULL
      AND created_at >= bounds.cur_start - bounds.win
      AND created_at < bounds.cur_start
  )
  SELECT
    buys.vol_usd,
    buys.traders,
    creates.n,
    (buys.vol_usd * 0.10 * 0.3333)::NUMERIC,
    (buys.vol_usd * 0.10 * 0.50)::NUMERIC,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL THEN NULL ELSE COALESCE(buys_prev.vol_usd,0) END,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL THEN NULL ELSE COALESCE(buys_prev.traders,0) END,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL THEN NULL ELSE COALESCE(creates_prev.n,0) END,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL OR buys_prev.vol_usd IS NULL THEN NULL ELSE (buys_prev.vol_usd * 0.10 * 0.3333)::NUMERIC END,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL OR buys_prev.vol_usd IS NULL THEN NULL ELSE (buys_prev.vol_usd * 0.10 * 0.50)::NUMERIC END,
    buys.vol_eth,
    (buys.vol_eth * 0.10 * 0.3333)::NUMERIC,
    (buys.vol_eth * 0.10 * 0.50)::NUMERIC,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL THEN NULL ELSE COALESCE(buys_prev.vol_eth,0) END,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL OR buys_prev.vol_eth IS NULL THEN NULL ELSE (buys_prev.vol_eth * 0.10 * 0.3333)::NUMERIC END,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL OR buys_prev.vol_eth IS NULL THEN NULL ELSE (buys_prev.vol_eth * 0.10 * 0.50)::NUMERIC END,
    buys.tx_count,
    CASE WHEN (SELECT cur_start FROM bounds) IS NULL THEN NULL ELSE COALESCE(buys_prev.tx_count,0) END
  FROM buys, creates, buys_prev, creates_prev;
$function$;