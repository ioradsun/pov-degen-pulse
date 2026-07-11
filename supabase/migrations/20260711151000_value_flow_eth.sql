-- value_flow() was USD-only, hardcoding the Value Flow panel to USD even
-- when the header currency toggle is set to ETH. Native amounts
-- (gross_amount_native, wei) are exact and don't need a price join, so add
-- ETH-denominated twins of every USD field as trailing columns.

CREATE OR REPLACE FUNCTION public.value_flow(range_key text)
RETURNS TABLE(
  buy_volume_usd numeric,
  sell_proceeds_usd numeric,
  net_conviction_usd numeric,
  degen_burn_usd numeric,
  creator_earned_usd numeric,
  agent_pool_usd numeric,
  buyers integer,
  holders_never_sold integer,
  buy_volume_eth numeric,
  sell_proceeds_eth numeric,
  net_conviction_eth numeric,
  degen_burn_eth numeric,
  creator_earned_eth numeric,
  agent_pool_eth numeric
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
      COALESCE(SUM(gross_amount_usd) FILTER (WHERE action = 'buy'),0)::numeric AS buys_usd,
      COALESCE(SUM(gross_amount_usd) FILTER (WHERE action = 'sell'),0)::numeric AS sells_usd,
      COALESCE(SUM(gross_amount_native) FILTER (WHERE action = 'buy'),0)::numeric / 1e18 AS buys_eth,
      COALESCE(SUM(gross_amount_native) FILTER (WHERE action = 'sell'),0)::numeric / 1e18 AS sells_eth,
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
    agg.buys_usd,
    agg.sells_usd,
    (agg.buys_usd - agg.sells_usd)::numeric,
    (agg.buys_usd * 0.05)::numeric,
    (agg.buys_usd * 0.033333)::numeric,
    (agg.buys_usd * 0.016667)::numeric,
    agg.buyers,
    holders.n,
    agg.buys_eth,
    agg.sells_eth,
    (agg.buys_eth - agg.sells_eth)::numeric,
    (agg.buys_eth * 0.05)::numeric,
    (agg.buys_eth * 0.033333)::numeric,
    (agg.buys_eth * 0.016667)::numeric
  FROM agg, holders;
END; $$;

REVOKE EXECUTE ON FUNCTION public.value_flow(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.value_flow(text) TO anon, authenticated, service_role;
