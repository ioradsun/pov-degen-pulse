
CREATE TABLE IF NOT EXISTS public.realized_pnl_events_cache (
  event_id text PRIMARY KEY,
  wallet_address text NOT NULL,
  belief_id integer NOT NULL,
  side text NOT NULL,
  sell_ts timestamptz NOT NULL,
  tokens_sold numeric NOT NULL,
  proceeds_usd numeric NOT NULL,
  proceeds_eth numeric NOT NULL,
  cost_usd numeric NOT NULL,
  cost_eth numeric NOT NULL,
  realized_usd numeric NOT NULL,
  realized_eth numeric NOT NULL,
  avg_hold_seconds numeric,
  is_full_exit boolean NOT NULL
);

GRANT ALL ON public.realized_pnl_events_cache TO service_role;
ALTER TABLE public.realized_pnl_events_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access" ON public.realized_pnl_events_cache FOR SELECT USING (false);

CREATE INDEX IF NOT EXISTS idx_rpec_sell_ts ON public.realized_pnl_events_cache (sell_ts);
CREATE INDEX IF NOT EXISTS idx_rpec_belief ON public.realized_pnl_events_cache (belief_id);

CREATE OR REPLACE FUNCTION public.refresh_realized_pnl_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  DELETE FROM public.realized_pnl_events_cache;
  INSERT INTO public.realized_pnl_events_cache
  SELECT * FROM public.realized_pnl_events() WHERE tokens_sold > 0;
END;
$$;

-- Rewrite summary functions to read from cache
CREATE OR REPLACE FUNCTION public.pnl_headline(range_key text)
RETURNS TABLE(realized_usd numeric, realized_eth numeric, exits integer, tokens_sold numeric, realized_usd_prev numeric, realized_eth_prev numeric, exits_prev integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH cur AS (
    SELECT
      COALESCE(SUM(realized_usd),0)::numeric AS r_usd,
      COALESCE(SUM(realized_eth)/1e18,0)::numeric AS r_eth,
      COUNT(*)::int AS n,
      COALESCE(SUM(tokens_sold)/1e18,0)::numeric AS toks
    FROM public.realized_pnl_events_cache
    WHERE cs IS NULL OR (sell_ts >= cs AND sell_ts < ce)
  ),
  prev AS (
    SELECT
      SUM(realized_usd)::numeric AS r_usd,
      (SUM(realized_eth)/1e18)::numeric AS r_eth,
      COUNT(*)::int AS n
    FROM public.realized_pnl_events_cache
    WHERE cs IS NOT NULL AND sell_ts >= cs - wn AND sell_ts < cs
  )
  SELECT cur.r_usd, cur.r_eth, cur.n, cur.toks,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.r_usd,0) END,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.r_eth,0) END,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.n,0) END
  FROM cur, prev;
END; $$;

CREATE OR REPLACE FUNCTION public.pnl_outcomes(range_key text)
RETURNS TABLE(realized_usd numeric, total_sells integer, profitable_sells integer, profitable_exit_rate numeric, avg_return numeric, full_exits integer, median_hold_seconds numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH ev AS (
    SELECT * FROM public.realized_pnl_events_cache
    WHERE cs IS NULL OR (sell_ts >= cs AND sell_ts < ce)
  )
  SELECT
    COALESCE(SUM(ev.realized_usd),0)::numeric,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE ev.realized_usd > 0)::int,
    CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE ev.realized_usd > 0))::numeric / COUNT(*) ELSE NULL END,
    CASE WHEN COALESCE(SUM(ev.cost_usd),0) > 0 THEN SUM(ev.realized_usd) / SUM(ev.cost_usd) ELSE NULL END,
    COUNT(*) FILTER (WHERE ev.is_full_exit)::int,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY ev.avg_hold_seconds) FILTER (WHERE ev.is_full_exit AND ev.avg_hold_seconds IS NOT NULL))::numeric
  FROM ev;
END; $$;

CREATE OR REPLACE FUNCTION public.pnl_by_belief(range_key text, top_n integer DEFAULT 200)
RETURNS TABLE(belief_id integer, realized_usd numeric, realized_eth numeric, exits integer, profitable_exits integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH ev AS (
    SELECT * FROM public.realized_pnl_events_cache
    WHERE cs IS NULL OR (sell_ts >= cs AND sell_ts < ce)
  )
  SELECT
    ev.belief_id,
    COALESCE(SUM(ev.realized_usd),0)::numeric,
    COALESCE(SUM(ev.realized_eth)/1e18,0)::numeric,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE ev.realized_usd > 0)::int
  FROM ev
  GROUP BY ev.belief_id
  ORDER BY ABS(COALESCE(SUM(ev.realized_usd),0)) DESC NULLS LAST
  LIMIT GREATEST(top_n, 1);
END; $$;

CREATE OR REPLACE FUNCTION public.pnl_buckets(granularity text DEFAULT 'hour', buckets_back integer DEFAULT 24)
RETURNS TABLE(bucket timestamptz, realized_usd numeric, realized_eth numeric, exits integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE step interval; tz text := 'America/New_York';
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
    FROM generate_series(0, GREATEST(buckets_back,1)-1) AS n
  ),
  window_bounds AS (SELECT MIN(b) AS start_at FROM series),
  agg AS (
    SELECT
      (date_trunc(granularity, e.sell_ts AT TIME ZONE tz) AT TIME ZONE tz) AS b,
      COALESCE(SUM(e.realized_usd),0) AS r_usd,
      COALESCE(SUM(e.realized_eth)/1e18,0) AS r_eth,
      COUNT(*)::int AS n
    FROM public.realized_pnl_events_cache e, window_bounds
    WHERE e.sell_ts >= window_bounds.start_at
    GROUP BY 1
  )
  SELECT s.b, COALESCE(a.r_usd,0), COALESCE(a.r_eth,0), COALESCE(a.n,0)
  FROM series s LEFT JOIN agg a ON a.b = s.b
  ORDER BY s.b;
END; $$;

-- Initial populate
SELECT public.refresh_realized_pnl_cache();
