-- Trader outcomes, corrected + reframed.
--
-- 1) pnl_outcomes now also returns PRICE P&L: proceeds vs the 90% of each
--    buy that actually entered the curve. The existing realized_usd compares
--    net proceeds against GROSS cost (which includes POV's 10% buy fee), so
--    a round-trip at flat price shows ~-10% by construction. Price P&L
--    isolates curve movement — the number that reflects trader timing —
--    while realized_usd stays as the true all-in outcome.
--
-- 2) value_flow(range): where buy dollars actually go. On POV the fee is
--    not a loss into the void — it is the product working: 50% of the fee
--    buys and burns DEGEN, 33.33% pays the belief creator, 16.67% funds the
--    AI-agent pool. Splits are protocol constants (10% fee on gross buys);
--    on-chain buy-fee amounts are UNRESOLVED per VERIFICATION.md, so these
--    are labeled estimates derived from gross buy volume.

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
    -- Price P&L: exclude the 10% protocol fee from cost basis (0.9 x gross).
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

CREATE OR REPLACE FUNCTION public.value_flow(range_key text)
RETURNS TABLE(
  buy_volume_usd numeric,
  sell_proceeds_usd numeric,
  net_conviction_usd numeric,   -- capital still deployed backing beliefs
  degen_burn_usd numeric,        -- est. fee share buying & burning DEGEN (5% of buys)
  creator_earned_usd numeric,    -- est. creator share (3.3333% of buys)
  agent_pool_usd numeric,        -- est. AI-agent pool share (1.6667% of buys)
  buyers integer,
  holders_never_sold integer     -- wallets that bought in range and sold nothing in range
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
