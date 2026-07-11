-- value_flow() currently returns only USD columns. Add ETH-denominated twins
-- so the Value Flow panel can switch currency like the rest of the dashboard.
-- Native amounts (gross_amount_native, wei) are exact and don't need a price join.
DROP FUNCTION IF EXISTS public.value_flow(text);

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

REVOKE ALL ON FUNCTION public.value_flow(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.value_flow(text) FROM anon;
REVOKE ALL ON FUNCTION public.value_flow(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.value_flow(text) TO service_role;

-- The dashboard now has a single global timeframe control, so repeat_wallet_rate()
-- and growth_health() need to accept the same range_key as headline_metrics() and
-- value_flow(). This drops the old fixed-window signatures and recreates them
-- as range-aware versions.
DROP FUNCTION IF EXISTS public.repeat_wallet_rate();
DROP FUNCTION IF EXISTS public.repeat_wallet_rate(text);

CREATE OR REPLACE FUNCTION public.repeat_wallet_rate(range_key text DEFAULT '7d')
RETURNS TABLE (
  new_wallets    int,
  repeat_wallets int,
  repeat_rate    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH cfg AS (
    SELECT
      CASE range_key
        WHEN '1h'  THEN INTERVAL '1 hour'
        WHEN '24h' THEN INTERVAL '24 hours'
        WHEN '7d'  THEN INTERVAL '7 days'
        WHEN '30d' THEN INTERVAL '30 days'
        WHEN 'all' THEN NULL
        ELSE INTERVAL '7 days'
      END AS w,
      (range_key IN ('7d', '30d', 'all')) AS use_day
  ),
  first_buy AS (
    SELECT wallet_address, MIN(block_timestamp) AS first_ts
    FROM public.trades
    WHERE action = 'buy' AND is_canonical = TRUE
    GROUP BY wallet_address
  ),
  eligible AS (
    SELECT fb.wallet_address, fb.first_ts
    FROM first_buy fb
    CROSS JOIN cfg
    WHERE cfg.w IS NULL OR fb.first_ts <= NOW() - cfg.w
  ),
  repeats AS (
    SELECT DISTINCT e.wallet_address
    FROM eligible e
    CROSS JOIN cfg
    JOIN public.trades t
      ON t.wallet_address = e.wallet_address
     AND t.action = 'buy'
     AND t.is_canonical = TRUE
     AND t.block_timestamp > e.first_ts
     AND (cfg.w IS NULL OR t.block_timestamp <= e.first_ts + cfg.w)
     AND (
       NOT cfg.use_day
       OR date_trunc('day', t.block_timestamp) <> date_trunc('day', e.first_ts)
     )
  )
  SELECT
    (SELECT COUNT(*) FROM eligible)::int,
    (SELECT COUNT(*) FROM repeats)::int,
    CASE WHEN (SELECT COUNT(*) FROM eligible) > 0
      THEN (SELECT COUNT(*) FROM repeats)::numeric / (SELECT COUNT(*) FROM eligible)
      ELSE NULL
    END;
$$;

REVOKE ALL ON FUNCTION public.repeat_wallet_rate(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repeat_wallet_rate(text) FROM anon;
REVOKE ALL ON FUNCTION public.repeat_wallet_rate(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.repeat_wallet_rate(text) TO service_role;

DROP FUNCTION IF EXISTS public.growth_health();
DROP FUNCTION IF EXISTS public.growth_health(text);

CREATE OR REPLACE FUNCTION public.growth_health(range_key text DEFAULT '7d')
RETURNS TABLE(
  beliefs_created  numeric,
  beliefs_filled   numeric,
  belief_fill_rate numeric,
  degen_burn_usd   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH cfg AS (
    SELECT
      CASE range_key
        WHEN '1h'  THEN INTERVAL '1 hour'
        WHEN '24h' THEN INTERVAL '24 hours'
        WHEN '7d'  THEN INTERVAL '7 days'
        WHEN '30d' THEN INTERVAL '30 days'
        WHEN 'all' THEN NULL
        ELSE INTERVAL '7 days'
      END AS w
  ),
  recent_beliefs AS (
    SELECT b.belief_id
    FROM public.beliefs b
    CROSS JOIN cfg
    WHERE cfg.w IS NULL OR b.created_at >= NOW() - cfg.w
  ),
  buyer_counts AS (
    SELECT t.belief_id, COUNT(DISTINCT t.wallet_address) AS buyers
    FROM public.trades t
    WHERE t.action = 'buy' AND t.is_canonical = TRUE
      AND t.belief_id IN (SELECT belief_id FROM recent_beliefs)
    GROUP BY t.belief_id
  ),
  burn AS (
    SELECT COALESCE(SUM(t.gross_amount_usd), 0) AS buy_usd
    FROM public.trades t
    CROSS JOIN cfg
    WHERE t.action = 'buy' AND t.is_canonical = TRUE
      AND (cfg.w IS NULL OR t.block_timestamp >= NOW() - cfg.w)
  )
  SELECT
    (SELECT COUNT(*) FROM recent_beliefs)::numeric,
    (SELECT COUNT(*) FROM buyer_counts WHERE buyers >= 3)::numeric,
    CASE WHEN (SELECT COUNT(*) FROM recent_beliefs) > 0
      THEN (SELECT COUNT(*) FROM buyer_counts WHERE buyers >= 3)::numeric
           / (SELECT COUNT(*) FROM recent_beliefs)
      ELSE NULL END,
    (SELECT buy_usd * 0.05 FROM burn)::numeric;
$$;

REVOKE ALL ON FUNCTION public.growth_health(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.growth_health(text) FROM anon;
REVOKE ALL ON FUNCTION public.growth_health(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.growth_health(text) TO service_role;