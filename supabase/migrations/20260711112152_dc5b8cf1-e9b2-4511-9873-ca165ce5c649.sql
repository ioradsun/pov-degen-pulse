
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
      COALESCE(SUM(e.realized_usd),0)::numeric AS r_usd,
      COALESCE(SUM(e.realized_eth)/1e18,0)::numeric AS r_eth,
      COUNT(*)::int AS n,
      COALESCE(SUM(e.tokens_sold)/1e18,0)::numeric AS toks
    FROM public.realized_pnl_events_cache e
    WHERE cs IS NULL OR (e.sell_ts >= cs AND e.sell_ts < ce)
  ),
  prev AS (
    SELECT
      SUM(e.realized_usd)::numeric AS r_usd,
      (SUM(e.realized_eth)/1e18)::numeric AS r_eth,
      COUNT(*)::int AS n
    FROM public.realized_pnl_events_cache e
    WHERE cs IS NOT NULL AND e.sell_ts >= cs - wn AND e.sell_ts < cs
  )
  SELECT cur.r_usd, cur.r_eth, cur.n, cur.toks,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.r_usd,0) END,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.r_eth,0) END,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.n,0) END
  FROM cur, prev;
END; $$;
