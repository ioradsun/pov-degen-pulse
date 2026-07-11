DROP FUNCTION IF EXISTS public.hourly_activity(integer);

CREATE OR REPLACE FUNCTION public.hourly_activity(hours_back integer DEFAULT 24)
 RETURNS TABLE(hour timestamp with time zone, buy_volume_usd numeric, buy_volume_eth numeric, buys integer, sells integer, created integer, active_traders integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH hours AS (
    SELECT date_trunc('hour', NOW()) - (n || ' hours')::interval AS hour
    FROM generate_series(0, GREATEST(hours_back, 1) - 1) AS n
  ),
  trade_agg AS (
    SELECT
      date_trunc('hour', block_timestamp) AS hour,
      COALESCE(SUM(gross_amount_usd) FILTER (WHERE action = 'buy'), 0) AS buy_volume_usd,
      COALESCE(SUM(gross_amount_native) FILTER (WHERE action = 'buy'), 0) / 1e18 AS buy_volume_eth,
      COUNT(*) FILTER (WHERE action = 'buy')  AS buys,
      COUNT(*) FILTER (WHERE action = 'sell') AS sells,
      COUNT(DISTINCT wallet_address) FILTER (WHERE action = 'buy') AS active_traders
    FROM public.trades
    WHERE is_canonical = TRUE
      AND block_timestamp >= NOW() - (hours_back || ' hours')::interval
    GROUP BY 1
  ),
  belief_agg AS (
    SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS created
    FROM public.beliefs
    WHERE created_at >= NOW() - (hours_back || ' hours')::interval
    GROUP BY 1
  )
  SELECT
    h.hour,
    COALESCE(t.buy_volume_usd, 0),
    COALESCE(t.buy_volume_eth, 0),
    COALESCE(t.buys, 0)::INT,
    COALESCE(t.sells, 0)::INT,
    COALESCE(b.created, 0)::INT,
    COALESCE(t.active_traders, 0)::INT
  FROM hours h
  LEFT JOIN trade_agg  t ON t.hour = h.hour
  LEFT JOIN belief_agg b ON b.hour = h.hour
  ORDER BY h.hour;
$function$;