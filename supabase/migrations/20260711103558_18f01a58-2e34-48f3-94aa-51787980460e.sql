CREATE OR REPLACE FUNCTION public.activity_buckets(granularity text DEFAULT 'hour'::text, buckets_back integer DEFAULT 24)
 RETURNS TABLE(bucket timestamp with time zone, buy_volume_usd numeric, buy_volume_eth numeric, buys integer, sells integer, created integer, active_traders integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  step interval;
  tz text := 'America/New_York';
BEGIN
  IF granularity NOT IN ('hour','day','week','month') THEN
    RAISE EXCEPTION 'invalid granularity: %', granularity;
  END IF;
  step := CASE granularity
    WHEN 'hour'  THEN interval '1 hour'
    WHEN 'day'   THEN interval '1 day'
    WHEN 'week'  THEN interval '1 week'
    WHEN 'month' THEN interval '1 month'
  END;

  RETURN QUERY
  WITH series AS (
    SELECT (date_trunc(granularity, (NOW() AT TIME ZONE tz)) AT TIME ZONE tz) - (n * step) AS b
    FROM generate_series(0, GREATEST(buckets_back, 1) - 1) AS n
  ),
  window_bounds AS (
    SELECT MIN(b) AS start_at FROM series
  ),
  trade_agg AS (
    SELECT
      (date_trunc(granularity, block_timestamp AT TIME ZONE tz) AT TIME ZONE tz) AS b,
      COALESCE(SUM(gross_amount_usd) FILTER (WHERE action = 'buy'), 0) AS buy_volume_usd,
      COALESCE(SUM(gross_amount_native) FILTER (WHERE action = 'buy'), 0) / 1e18 AS buy_volume_eth,
      COUNT(*) FILTER (WHERE action = 'buy')::int  AS buys,
      COUNT(*) FILTER (WHERE action = 'sell')::int AS sells,
      COUNT(DISTINCT wallet_address) FILTER (WHERE action = 'buy')::int AS active_traders
    FROM public.trades, window_bounds
    WHERE is_canonical = TRUE
      AND block_timestamp >= window_bounds.start_at
    GROUP BY 1
  ),
  belief_agg AS (
    SELECT (date_trunc(granularity, created_at AT TIME ZONE tz) AT TIME ZONE tz) AS b, COUNT(*)::int AS created
    FROM public.beliefs, window_bounds
    WHERE created_at >= window_bounds.start_at
    GROUP BY 1
  )
  SELECT
    s.b,
    COALESCE(t.buy_volume_usd, 0),
    COALESCE(t.buy_volume_eth, 0),
    COALESCE(t.buys, 0),
    COALESCE(t.sells, 0),
    COALESCE(bl.created, 0),
    COALESCE(t.active_traders, 0)
  FROM series s
  LEFT JOIN trade_agg  t  ON t.b = s.b
  LEFT JOIN belief_agg bl ON bl.b = s.b
  ORDER BY s.b;
END;
$function$;