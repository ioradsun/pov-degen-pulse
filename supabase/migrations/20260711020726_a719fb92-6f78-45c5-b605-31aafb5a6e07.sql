DROP FUNCTION IF EXISTS public.headline_metrics(text);

CREATE FUNCTION public.headline_metrics(range_key text)
 RETURNS TABLE(
   buy_volume_usd numeric, active_traders integer, new_beliefs integer,
   creator_revenue_usd numeric, degen_allocation_usd numeric,
   buy_volume_usd_prev numeric, active_traders_prev integer, new_beliefs_prev integer,
   creator_revenue_usd_prev numeric, degen_allocation_usd_prev numeric,
   buy_volume_eth numeric, creator_revenue_eth numeric, degen_allocation_eth numeric,
   buy_volume_eth_prev numeric, creator_revenue_eth_prev numeric, degen_allocation_eth_prev numeric
 )
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
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
      END AS win
  ),
  bounds AS (
    SELECT win, NOW() - win AS cur_start, NOW() - 2*win AS prev_start, NOW() - win AS prev_end FROM b
  ),
  buys AS (
    SELECT
      COALESCE(SUM(gross_amount_usd),0)::NUMERIC AS vol_usd,
      COALESCE(SUM(gross_amount_native)/1e18,0)::NUMERIC AS vol_eth,
      COUNT(DISTINCT wallet_address)::INT AS traders
    FROM public.trades, bounds
    WHERE action='buy' AND is_canonical=TRUE
      AND (bounds.win IS NULL OR block_timestamp >= bounds.cur_start)
  ),
  creates AS (
    SELECT COUNT(*)::INT AS n FROM public.beliefs, bounds
    WHERE (bounds.win IS NULL OR created_at >= bounds.cur_start)
  ),
  buys_prev AS (
    SELECT
      SUM(gross_amount_usd)::NUMERIC AS vol_usd,
      (SUM(gross_amount_native)/1e18)::NUMERIC AS vol_eth,
      COUNT(DISTINCT wallet_address)::INT AS traders
    FROM public.trades, bounds
    WHERE bounds.win IS NOT NULL AND action='buy' AND is_canonical=TRUE
      AND block_timestamp >= bounds.prev_start AND block_timestamp < bounds.prev_end
  ),
  creates_prev AS (
    SELECT COUNT(*)::INT AS n FROM public.beliefs, bounds
    WHERE bounds.win IS NOT NULL AND created_at >= bounds.prev_start AND created_at < bounds.prev_end
  )
  SELECT
    buys.vol_usd,
    buys.traders,
    creates.n,
    (buys.vol_usd * 0.10 * 0.3333)::NUMERIC,
    (buys.vol_usd * 0.10 * 0.50)::NUMERIC,
    CASE WHEN (SELECT win FROM bounds) IS NULL THEN NULL ELSE COALESCE(buys_prev.vol_usd,0) END,
    CASE WHEN (SELECT win FROM bounds) IS NULL THEN NULL ELSE COALESCE(buys_prev.traders,0) END,
    CASE WHEN (SELECT win FROM bounds) IS NULL THEN NULL ELSE COALESCE(creates_prev.n,0) END,
    CASE WHEN (SELECT win FROM bounds) IS NULL OR buys_prev.vol_usd IS NULL THEN NULL ELSE (buys_prev.vol_usd * 0.10 * 0.3333)::NUMERIC END,
    CASE WHEN (SELECT win FROM bounds) IS NULL OR buys_prev.vol_usd IS NULL THEN NULL ELSE (buys_prev.vol_usd * 0.10 * 0.50)::NUMERIC END,
    buys.vol_eth,
    (buys.vol_eth * 0.10 * 0.3333)::NUMERIC,
    (buys.vol_eth * 0.10 * 0.50)::NUMERIC,
    CASE WHEN (SELECT win FROM bounds) IS NULL THEN NULL ELSE COALESCE(buys_prev.vol_eth,0) END,
    CASE WHEN (SELECT win FROM bounds) IS NULL OR buys_prev.vol_eth IS NULL THEN NULL ELSE (buys_prev.vol_eth * 0.10 * 0.3333)::NUMERIC END,
    CASE WHEN (SELECT win FROM bounds) IS NULL OR buys_prev.vol_eth IS NULL THEN NULL ELSE (buys_prev.vol_eth * 0.10 * 0.50)::NUMERIC END
  FROM buys, creates, buys_prev, creates_prev;
$function$;

GRANT EXECUTE ON FUNCTION public.headline_metrics(text) TO anon, authenticated;