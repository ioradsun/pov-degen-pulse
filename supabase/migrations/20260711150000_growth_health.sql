-- Growth/retention health metrics for the consolidated dashboard.
--
-- belief_fill_rate_7d: of beliefs CREATED in the last 7 days, what share
-- attracted >= 3 distinct buying wallets? Supply-side health — are new
-- beliefs finding an audience, or launching into silence?
--
-- degen_burn_all_time_usd: est. cumulative DEGEN buyback & burn since
-- inception (5% of all-time gross buy volume — see value_flow() for the
-- per-range version and VERIFICATION.md for why this is an estimate: the
-- on-chain buy-fee split fields are unresolved, so splits are protocol
-- constants applied to gross buy volume, not read from events).

CREATE OR REPLACE FUNCTION public.growth_health()
RETURNS TABLE(
  beliefs_created_7d numeric,
  beliefs_filled_7d numeric,
  belief_fill_rate_7d numeric,
  degen_burn_all_time_usd numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  WITH recent_beliefs AS (
    SELECT belief_id FROM public.beliefs
    WHERE created_at >= now() - INTERVAL '7 days'
  ),
  buyer_counts AS (
    SELECT t.belief_id, COUNT(DISTINCT t.wallet_address) AS buyers
    FROM public.trades t
    WHERE t.action = 'buy' AND t.is_canonical = TRUE
      AND t.belief_id IN (SELECT belief_id FROM recent_beliefs)
    GROUP BY t.belief_id
  ),
  all_time AS (
    SELECT COALESCE(SUM(gross_amount_usd), 0) AS buy_usd
    FROM public.trades
    WHERE action = 'buy' AND is_canonical = TRUE
  )
  SELECT
    (SELECT COUNT(*) FROM recent_beliefs)::numeric,
    (SELECT COUNT(*) FROM buyer_counts WHERE buyers >= 3)::numeric,
    CASE WHEN (SELECT COUNT(*) FROM recent_beliefs) > 0
      THEN (SELECT COUNT(*) FROM buyer_counts WHERE buyers >= 3)::numeric
           / (SELECT COUNT(*) FROM recent_beliefs)
      ELSE NULL END,
    (SELECT buy_usd * 0.05 FROM all_time)::numeric;
$$;

REVOKE EXECUTE ON FUNCTION public.growth_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.growth_health() TO anon, authenticated, service_role;
