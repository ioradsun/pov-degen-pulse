CREATE OR REPLACE FUNCTION public.headline_metrics(range_key text)
 RETURNS TABLE(buy_volume_usd numeric, active_traders integer, new_beliefs integer, creator_revenue_usd numeric, degen_allocation_usd numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH r AS (
    SELECT CASE range_key
      WHEN '1h'  THEN INTERVAL '1 hour'
      WHEN '24h' THEN INTERVAL '24 hours'
      WHEN '7d'  THEN INTERVAL '7 days'
      WHEN '30d' THEN INTERVAL '30 days'
      WHEN 'all' THEN NULL
      ELSE INTERVAL '24 hours'
    END AS window
  ),
  buys AS (
    SELECT
      COALESCE(SUM(gross_amount_usd), 0)::NUMERIC AS vol,
      COUNT(DISTINCT wallet_address)::INT        AS traders
    FROM public.trades, r
    WHERE action = 'buy' AND is_canonical = TRUE
      AND (r.window IS NULL OR block_timestamp >= NOW() - r.window)
  ),
  creates AS (
    SELECT COUNT(*)::INT AS n
    FROM public.beliefs, r
    WHERE (r.window IS NULL OR created_at >= NOW() - r.window)
  )
  SELECT
    buys.vol,
    buys.traders,
    creates.n,
    (buys.vol * 0.10 * 0.3333)::NUMERIC,
    (buys.vol * 0.10 * 0.50)::NUMERIC
  FROM buys, creates;
$function$;