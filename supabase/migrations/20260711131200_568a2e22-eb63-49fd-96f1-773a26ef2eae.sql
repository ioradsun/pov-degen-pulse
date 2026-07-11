DROP FUNCTION IF EXISTS public.pnl_outcomes(text);
CREATE OR REPLACE FUNCTION public.pnl_outcomes(range_key text)
RETURNS TABLE(
  realized_usd numeric,
  total_sells integer,
  profitable_sells integer,
  profitable_exit_rate numeric,
  avg_return numeric,
  full_exits integer,
  median_hold_seconds numeric,
  price_pnl_usd numeric,
  price_profitable_sells integer,
  price_profitable_rate numeric,
  price_avg_return numeric
)
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
    CASE WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE ev.realized_usd > 0))::numeric / COUNT(*)
      ELSE NULL END,
    CASE WHEN COALESCE(SUM(ev.cost_usd),0) > 0
      THEN SUM(ev.realized_usd) / SUM(ev.cost_usd) ELSE NULL END,
    COUNT(*) FILTER (WHERE ev.is_full_exit)::int,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY ev.avg_hold_seconds)
      FILTER (WHERE ev.is_full_exit AND ev.avg_hold_seconds IS NOT NULL))::numeric,
    COALESCE(SUM(ev.proceeds_usd - 0.9 * ev.cost_usd),0)::numeric,
    COUNT(*) FILTER (WHERE ev.proceeds_usd > 0.9 * ev.cost_usd)::int,
    CASE WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE ev.proceeds_usd > 0.9 * ev.cost_usd))::numeric / COUNT(*)
      ELSE NULL END,
    CASE WHEN COALESCE(SUM(0.9 * ev.cost_usd),0) > 0
      THEN SUM(ev.proceeds_usd - 0.9 * ev.cost_usd) / SUM(0.9 * ev.cost_usd)
      ELSE NULL END
  FROM ev;
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_outcomes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_outcomes(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.value_flow(range_key text)
RETURNS TABLE(
  buy_volume_usd numeric,
  sell_proceeds_usd numeric,
  net_conviction_usd numeric,
  degen_burn_usd numeric,
  creator_earned_usd numeric,
  agent_pool_usd numeric,
  buyers integer,
  holders_never_sold integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH tr AS (
    SELECT * FROM public.trades t
    WHERE t.is_canonical = TRUE
      AND t.action IN ('buy','sell')
      AND (cs IS NULL OR (t.block_timestamp >= cs AND t.block_timestamp < ce))
  ),
  agg AS (
    SELECT
      COALESCE(SUM(gross_amount_usd) FILTER (WHERE action = 'buy'),0)::numeric AS buys,
      COALESCE(SUM(gross_amount_usd) FILTER (WHERE action = 'sell'),0)::numeric AS sells,
      COUNT(DISTINCT wallet_address) FILTER (WHERE action = 'buy')::int AS buyers
    FROM tr
  ),
  holders AS (
    SELECT COUNT(*)::int AS n FROM (
      SELECT wallet_address FROM tr GROUP BY wallet_address
      HAVING COUNT(*) FILTER (WHERE action = 'buy') > 0
         AND COUNT(*) FILTER (WHERE action = 'sell') = 0
    ) w
  )
  SELECT
    agg.buys,
    agg.sells,
    (agg.buys - agg.sells)::numeric,
    (agg.buys * 0.05)::numeric,
    (agg.buys * 0.033333)::numeric,
    (agg.buys * 0.016667)::numeric,
    agg.buyers,
    holders.n
  FROM agg, holders;
END; $$;
REVOKE EXECUTE ON FUNCTION public.value_flow(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.value_flow(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._pnl_range_bounds(range_key text)
RETURNS TABLE(cur_start timestamptz, cur_end timestamptz, win interval)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT
    CASE range_key
      WHEN '1h'  THEN now() - INTERVAL '1 hour'
      WHEN '24h' THEN now() - INTERVAL '24 hours'
      WHEN '7d'  THEN now() - INTERVAL '7 days'
      WHEN '30d' THEN now() - INTERVAL '30 days'
      WHEN 'all' THEN NULL
      ELSE now() - INTERVAL '24 hours'
    END,
    CASE range_key WHEN 'all' THEN NULL ELSE now() END,
    CASE range_key
      WHEN '1h'  THEN INTERVAL '1 hour'
      WHEN '24h' THEN INTERVAL '24 hours'
      WHEN '7d'  THEN INTERVAL '7 days'
      WHEN '30d' THEN INTERVAL '30 days'
      ELSE INTERVAL '24 hours'
    END;
$$;

DROP FUNCTION IF EXISTS public.pnl_wallet_summary(text);
CREATE OR REPLACE FUNCTION public.pnl_wallet_summary(range_key text)
RETURNS TABLE(
  sellers integer,
  profitable_wallets integer,
  profitable_wallet_rate numeric,
  winners_net_eth numeric,
  winners_net_usd numeric,
  gross_gains_eth numeric,
  net_realized_eth numeric,
  net_realized_usd numeric,
  median_wallet_return numeric,
  median_winning_return numeric,
  positions integer,
  profitable_positions integer,
  profitable_position_rate numeric,
  median_position_return numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn
  FROM public._pnl_range_bounds(range_key) b;

  RETURN QUERY
  WITH ev AS (
    SELECT * FROM public.realized_pnl_events_cache
    WHERE cs IS NULL OR (sell_ts >= cs AND sell_ts < ce)
  ),
  w AS (
    SELECT
      ev.wallet_address,
      SUM(ev.realized_eth) AS pnl_eth,
      SUM(ev.cost_eth) AS cost_eth,
      SUM(ev.realized_usd) AS pnl_usd
    FROM ev
    GROUP BY ev.wallet_address
  ),
  p AS (
    SELECT
      ev.wallet_address, ev.belief_id, ev.side,
      SUM(ev.realized_eth) AS pnl_eth,
      SUM(ev.cost_eth) AS cost_eth
    FROM ev
    GROUP BY ev.wallet_address, ev.belief_id, ev.side
  )
  SELECT
    (SELECT COUNT(*)::int FROM w),
    (SELECT COUNT(*) FILTER (WHERE w.pnl_eth > 0)::int FROM w),
    (SELECT CASE WHEN COUNT(*) > 0
       THEN (COUNT(*) FILTER (WHERE w.pnl_eth > 0))::numeric / COUNT(*)
       ELSE NULL END FROM w),
    (SELECT COALESCE(SUM(w.pnl_eth) FILTER (WHERE w.pnl_eth > 0), 0)::numeric / 1e18 FROM w),
    (SELECT COALESCE(SUM(w.pnl_usd) FILTER (WHERE w.pnl_eth > 0), 0)::numeric FROM w),
    (SELECT COALESCE(SUM(ev.realized_eth) FILTER (WHERE ev.realized_eth > 0), 0)::numeric / 1e18 FROM ev),
    (SELECT COALESCE(SUM(w.pnl_eth), 0)::numeric / 1e18 FROM w),
    (SELECT COALESCE(SUM(w.pnl_usd), 0)::numeric FROM w),
    (SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY w.pnl_eth / NULLIF(w.cost_eth, 0)))::numeric
       FROM w WHERE w.cost_eth > 0),
    (SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY w.pnl_eth / NULLIF(w.cost_eth, 0)))::numeric
       FROM w WHERE w.cost_eth > 0 AND w.pnl_eth > 0),
    (SELECT COUNT(*)::int FROM p),
    (SELECT COUNT(*) FILTER (WHERE p.pnl_eth > 0)::int FROM p),
    (SELECT CASE WHEN COUNT(*) > 0
       THEN (COUNT(*) FILTER (WHERE p.pnl_eth > 0))::numeric / COUNT(*)
       ELSE NULL END FROM p),
    (SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY p.pnl_eth / NULLIF(p.cost_eth, 0)))::numeric
       FROM p WHERE p.cost_eth > 0);
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_wallet_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_wallet_summary(text) TO anon, authenticated, service_role;
