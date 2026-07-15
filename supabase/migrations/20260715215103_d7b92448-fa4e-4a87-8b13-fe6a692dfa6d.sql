
CREATE OR REPLACE FUNCTION public.escape_velocity_beliefs(
  range_key text DEFAULT '7d',
  min_buyers int DEFAULT 3
)
RETURNS TABLE(
  belief_id int,
  title text,
  slug text,
  creator_address text,
  creator_display_name text,
  created_at timestamptz,
  unique_buyers int,
  buy_volume_usd numeric,
  buy_volume_eth numeric
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
    SELECT b.*
    FROM public.beliefs b
    CROSS JOIN cfg
    WHERE cfg.w IS NULL OR b.created_at >= NOW() - cfg.w
  ),
  agg AS (
    SELECT
      t.belief_id,
      COUNT(DISTINCT t.wallet_address)::int AS unique_buyers,
      COALESCE(SUM(t.gross_amount_usd), 0)::numeric AS buy_volume_usd,
      COALESCE(SUM(t.gross_amount_native), 0)::numeric / 1e18 AS buy_volume_eth
    FROM public.trades t
    WHERE t.action = 'buy' AND t.is_canonical = TRUE
      AND t.belief_id IN (SELECT belief_id FROM recent_beliefs)
    GROUP BY t.belief_id
  )
  SELECT
    rb.belief_id,
    rb.title,
    rb.slug,
    rb.creator_address,
    rb.creator_display_name,
    rb.created_at,
    a.unique_buyers,
    a.buy_volume_usd,
    a.buy_volume_eth
  FROM recent_beliefs rb
  JOIN agg a ON a.belief_id = rb.belief_id
  WHERE a.unique_buyers >= min_buyers
  ORDER BY a.unique_buyers DESC, a.buy_volume_usd DESC;
$$;

REVOKE ALL ON FUNCTION public.escape_velocity_beliefs(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.escape_velocity_beliefs(text, int)
  TO anon, authenticated, service_role;
