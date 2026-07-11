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
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY ev.avg_hold_seconds)
      FILTER (WHERE ev.is_full_exit AND ev.avg_hold_seconds IS NOT NULL))::numeric
  FROM ev;
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_outcomes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_outcomes(text) TO anon, authenticated, service_role;