-- Wallet-first P&L hierarchy.
--
-- Primary unit: WALLET — "did this person make money on POV?"
-- Secondary: POSITION (wallet + market + side) — "where did they win?"
-- Diagnostic: per-sell (existing pnl_outcomes) — "how did they exit?"
--
-- Built on realized_pnl_events_cache (FIFO-matched sells). Aggregating per
-- wallet fixes the distortion where one scaled exit counts as many wins,
-- and avoids per-share weighting where large positions dominate.
--
-- Range semantics: sells inside the selected window, cost basis inherently
-- lifetime (FIFO matches against all prior buys). range='all' is the pure
-- "did this person ever make money" answer.

CREATE OR REPLACE FUNCTION public.pnl_wallet_summary(range_key text)
RETURNS TABLE(
  -- wallet level (primary)
  sellers integer,
  profitable_wallets integer,
  profitable_wallet_rate numeric,
  gross_gains_usd numeric,        -- sum of P&L across winning wallets only
  gross_losses_usd numeric,       -- sum of P&L across losing wallets (negative)
  net_realized_usd numeric,
  median_wallet_return numeric,   -- median of per-wallet pnl/cost
  median_winning_return numeric,  -- median return among winning wallets
  -- position level (secondary): wallet + market + side
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
      SUM(ev.realized_usd) AS pnl,
      SUM(ev.cost_usd) AS cost
    FROM ev
    GROUP BY ev.wallet_address
  ),
  p AS (
    SELECT
      ev.wallet_address, ev.belief_id, ev.side,
      SUM(ev.realized_usd) AS pnl,
      SUM(ev.cost_usd) AS cost
    FROM ev
    GROUP BY ev.wallet_address, ev.belief_id, ev.side
  )
  SELECT
    (SELECT COUNT(*)::int FROM w),
    (SELECT COUNT(*) FILTER (WHERE w.pnl > 0)::int FROM w),
    (SELECT CASE WHEN COUNT(*) > 0
       THEN (COUNT(*) FILTER (WHERE w.pnl > 0))::numeric / COUNT(*)
       ELSE NULL END FROM w),
    (SELECT COALESCE(SUM(w.pnl) FILTER (WHERE w.pnl > 0), 0)::numeric FROM w),
    (SELECT COALESCE(SUM(w.pnl) FILTER (WHERE w.pnl < 0), 0)::numeric FROM w),
    (SELECT COALESCE(SUM(w.pnl), 0)::numeric FROM w),
    (SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY w.pnl / NULLIF(w.cost, 0)))::numeric
       FROM w WHERE w.cost > 0),
    (SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY w.pnl / NULLIF(w.cost, 0)))::numeric
       FROM w WHERE w.cost > 0 AND w.pnl > 0),
    (SELECT COUNT(*)::int FROM p),
    (SELECT COUNT(*) FILTER (WHERE p.pnl > 0)::int FROM p),
    (SELECT CASE WHEN COUNT(*) > 0
       THEN (COUNT(*) FILTER (WHERE p.pnl > 0))::numeric / COUNT(*)
       ELSE NULL END FROM p),
    (SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY p.pnl / NULLIF(p.cost, 0)))::numeric
       FROM p WHERE p.cost > 0);
END; $$;

REVOKE EXECUTE ON FUNCTION public.pnl_wallet_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_wallet_summary(text)
  TO anon, authenticated, service_role;
