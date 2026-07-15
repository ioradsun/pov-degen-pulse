
CREATE OR REPLACE FUNCTION public.growth_health(range_key text DEFAULT '7d', min_buyers int DEFAULT 3)
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
    (SELECT COUNT(*) FROM buyer_counts WHERE buyers >= min_buyers)::numeric,
    CASE WHEN (SELECT COUNT(*) FROM recent_beliefs) > 0
      THEN (SELECT COUNT(*) FROM buyer_counts WHERE buyers >= min_buyers)::numeric
           / (SELECT COUNT(*) FROM recent_beliefs)
      ELSE NULL END,
    (SELECT buy_usd * 0.05 FROM burn)::numeric;
$$;

REVOKE ALL ON FUNCTION public.growth_health(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.growth_health(text, int) FROM anon;
REVOKE ALL ON FUNCTION public.growth_health(text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.growth_health(text, int) TO service_role;
