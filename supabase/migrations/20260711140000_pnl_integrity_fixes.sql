-- Four integrity fixes to trader outcomes before the percentage can be
-- trusted publicly:
--
-- 1. ROLLING WINDOWS. _pnl_range_bounds previously defined 24h/7d/30d as
--    calendar windows ENDING AT LAST MIDNIGHT (America/New_York) — today's
--    activity was invisible on every range except 1h. Now genuinely rolling:
--    now() - interval.
--
-- 2. WIN CLASSIFICATION IN ETH. The indexer applies one spot ETH/USD quote
--    to every event processed in a run — including backfilled history — so
--    per-event USD is not consistently timestamped. Whether a wallet WON is
--    now decided in ETH (natively consistent); USD aggregates are returned
--    for display alongside ETH.
--
-- 3. TRUE GROSS GAINS. gross_gains previously summed NET P&L of winning
--    wallets (a wallet +$100/-$80 contributed $20). Now returns both:
--    winners_net (net profit of net-profitable wallets, the honest headline
--    money figure) and gross_gains (sum of ALL positive realized events
--    before any netting).
--
-- (4. Cache freshness is fixed app-side: the indexer now refreshes
--     realized_pnl_events_cache whenever it inserts sells.)

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
  -- wallet level (primary) — wins decided in ETH
  sellers integer,
  profitable_wallets integer,
  profitable_wallet_rate numeric,
  winners_net_eth numeric,        -- net profit of net-profitable wallets (ETH)
  winners_net_usd numeric,        -- same wallets' USD sum, for display only
  gross_gains_eth numeric,        -- sum of ALL positive realized events, pre-netting
  net_realized_eth numeric,
  net_realized_usd numeric,       -- display only
  median_wallet_return numeric,   -- ETH-based: pnl_eth / cost_eth per wallet
  median_winning_return numeric,
  -- position level (secondary): wallet + market + side
  positions integer,
  profitable_positions integer,   -- positions with realized profit (ETH)
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
GRANT EXECUTE ON FUNCTION public.pnl_wallet_summary(text)
  TO anon, authenticated, service_role;
