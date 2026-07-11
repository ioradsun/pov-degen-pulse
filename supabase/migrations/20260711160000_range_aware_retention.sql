-- Range-aware retention & growth.
--
-- The dashboard now has a single global timeframe control, so these two
-- functions — which were previously pinned to a fixed 7-day / all-time
-- window — take the same range_key as headline_metrics(), value_flow(), etc.
--
-- Semantics of "did people come back", generalized to a window W:
--   * Eligibility: a wallet is eligible once its first-ever buy is at least W
--     ago, so it has had the full window to return. (For 'all', every wallet
--     that has ever bought is eligible.)
--   * Return: the wallet made another canonical buy after its first, within W
--     of that first buy. For day-scale windows (7d/30d/all) we require the
--     return to land on a different calendar day, so buying twice in one
--     session doesn't count as "retained". For sub-day windows (1h/24h) any
--     strictly-later buy counts, since a calendar-day rule is too coarse.
--   * 'all' uses an unbounded return window — "what share of all buyers ever
--     came back at least once on a later day".
--
-- Grants: SECURITY DEFINER, executable by service_role only, matching the
-- hardening in 20260711135911. The retention endpoint calls these via the
-- service-role admin client.

-- ---------------------------------------------------------------------------
-- repeat_wallet_rate(range_key)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.repeat_wallet_rate();
DROP FUNCTION IF EXISTS public.repeat_wallet_rate(text);

CREATE FUNCTION public.repeat_wallet_rate(range_key text DEFAULT '7d')
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

-- ---------------------------------------------------------------------------
-- growth_health(range_key)
-- ---------------------------------------------------------------------------
-- Return-column names change (dropping the _7d suffix, now that the window is
-- the selected range), so the function must be dropped before recreation.
DROP FUNCTION IF EXISTS public.growth_health();
DROP FUNCTION IF EXISTS public.growth_health(text);

CREATE FUNCTION public.growth_health(range_key text DEFAULT '7d')
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
