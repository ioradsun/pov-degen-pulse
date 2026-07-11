CREATE OR REPLACE FUNCTION public.pnl_headline(range_key text)
RETURNS TABLE(
  realized_usd numeric, realized_eth numeric,
  exits integer, tokens_sold numeric,
  realized_usd_prev numeric, realized_eth_prev numeric,
  exits_prev integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH ev AS (SELECT * FROM public.realized_pnl_events()),
  cur AS (
    SELECT
      COALESCE(SUM(ev.realized_usd),0)::numeric AS r_usd,
      COALESCE(SUM(ev.realized_eth)/1e18,0)::numeric AS r_eth,
      COUNT(*)::int AS n,
      COALESCE(SUM(ev.tokens_sold)/1e18,0)::numeric AS toks
    FROM ev
    WHERE cs IS NULL OR (ev.sell_ts >= cs AND ev.sell_ts < ce)
  ),
  prev AS (
    SELECT
      SUM(ev.realized_usd)::numeric AS r_usd,
      (SUM(ev.realized_eth)/1e18)::numeric AS r_eth,
      COUNT(*)::int AS n
    FROM ev
    WHERE cs IS NOT NULL AND ev.sell_ts >= cs - wn AND ev.sell_ts < cs
  )
  SELECT cur.r_usd, cur.r_eth, cur.n, cur.toks,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.r_usd,0) END,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.r_eth,0) END,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.n,0) END
  FROM cur, prev;
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_headline(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_headline(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pnl_outcomes(range_key text)
RETURNS TABLE(
  realized_usd numeric,
  total_sells integer,
  profitable_sells integer,
  profitable_exit_rate numeric,
  avg_return numeric,
  full_exits integer,
  median_hold_seconds numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH ev AS (
    SELECT * FROM public.realized_pnl_events() e
    WHERE (cs IS NULL OR (e.sell_ts >= cs AND e.sell_ts < ce))
      AND e.tokens_sold > 0
  )
  SELECT
    COALESCE(SUM(ev.realized_usd),0)::numeric,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE ev.realized_usd > 0)::int,
    CASE WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE ev.realized_usd > 0))::numeric / COUNT(*)
      ELSE NULL END,
    CASE WHEN COALESCE(SUM(ev.cost_usd),0) > 0
      THEN SUM(ev.realized_usd) / SUM(ev.cost_usd)
      ELSE NULL END,
    COUNT(*) FILTER (WHERE ev.is_full_exit)::int,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ev.avg_hold_seconds)
      FILTER (WHERE ev.is_full_exit AND ev.avg_hold_seconds IS NOT NULL)
  FROM ev;
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_outcomes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_outcomes(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pnl_buckets(granularity text DEFAULT 'hour', buckets_back integer DEFAULT 24)
RETURNS TABLE(bucket timestamptz, realized_usd numeric, realized_eth numeric, exits integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  step interval;
  tz text := 'America/New_York';
BEGIN
  IF granularity NOT IN ('hour','day','week','month') THEN
    RAISE EXCEPTION 'invalid granularity: %', granularity;
  END IF;
  step := CASE granularity
    WHEN 'hour' THEN interval '1 hour'
    WHEN 'day' THEN interval '1 day'
    WHEN 'week' THEN interval '1 week'
    WHEN 'month' THEN interval '1 month'
  END;
  RETURN QUERY
  WITH series AS (
    SELECT (date_trunc(granularity, (NOW() AT TIME ZONE tz)) AT TIME ZONE tz) - (n * step) AS b
    FROM generate_series(0, GREATEST(buckets_back, 1) - 1) AS n
  ),
  window_bounds AS (SELECT MIN(b) AS start_at FROM series),
  ev AS (
    SELECT e.* FROM public.realized_pnl_events() e, window_bounds
    WHERE e.sell_ts >= window_bounds.start_at
  ),
  agg AS (
    SELECT
      (date_trunc(granularity, ev.sell_ts AT TIME ZONE tz) AT TIME ZONE tz) AS b,
      COALESCE(SUM(ev.realized_usd),0) AS r_usd,
      COALESCE(SUM(ev.realized_eth)/1e18,0) AS r_eth,
      COUNT(*)::int AS n
    FROM ev
    GROUP BY 1
  )
  SELECT s.b, COALESCE(a.r_usd,0), COALESCE(a.r_eth,0), COALESCE(a.n,0)
  FROM series s LEFT JOIN agg a ON a.b = s.b
  ORDER BY s.b;
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_buckets(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_buckets(text, integer) TO anon, authenticated, service_role;