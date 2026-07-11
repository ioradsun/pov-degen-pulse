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
REVOKE EXECUTE ON FUNCTION public.growth_health() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_health() TO service_role;