
-- Migration: make the rhythm chart and belief board respect the dashboard's
-- timeframe picker instead of being hardcoded to 24h.

-- 1) activity_series(range_key) — hour-bucketed for short ranges (1h/24h),
--    day-bucketed for longer ones (7d/30d/all), so the chart stays readable
--    instead of drawing hundreds of hourly bars for a 30-day view.
CREATE OR REPLACE FUNCTION public.activity_series(range_key TEXT)
RETURNS TABLE (
  bucket         TIMESTAMPTZ,
  buy_volume_usd NUMERIC,
  buys           INT,
  sells          INT,
  created        INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH cfg AS (
    SELECT
      CASE WHEN range_key IN ('1h', '24h') THEN 'hour' ELSE 'day' END AS grain,
      CASE WHEN range_key IN ('1h', '24h') THEN INTERVAL '1 hour' ELSE INTERVAL '1 day' END AS step,
      CASE range_key
        WHEN '1h'  THEN NOW() - INTERVAL '1 hour'
        WHEN '24h' THEN NOW() - INTERVAL '24 hours'
        WHEN '7d'  THEN NOW() - INTERVAL '7 days'
        WHEN '30d' THEN NOW() - INTERVAL '30 days'
        WHEN 'all' THEN COALESCE((SELECT MIN(created_at) FROM public.beliefs), NOW() - INTERVAL '24 hours')
        ELSE NOW() - INTERVAL '24 hours'
      END AS start_ts
  ),
  bounds AS (
    SELECT
      date_trunc(cfg.grain, cfg.start_ts) AS floor_start,
      date_trunc(cfg.grain, NOW())        AS floor_end,
      cfg.grain,
      cfg.step,
      cfg.start_ts
    FROM cfg
  ),
  buckets AS (
    SELECT generate_series(floor_start, floor_end, step) AS bucket FROM bounds
  ),
  trade_agg AS (
    SELECT
      date_trunc((SELECT grain FROM bounds), block_timestamp) AS bucket,
      COALESCE(SUM(gross_amount_usd) FILTER (WHERE action = 'buy'), 0) AS buy_volume_usd,
      COUNT(*) FILTER (WHERE action = 'buy')  AS buys,
      COUNT(*) FILTER (WHERE action = 'sell') AS sells
    FROM public.trades
    WHERE is_canonical = TRUE AND block_timestamp >= (SELECT start_ts FROM bounds)
    GROUP BY 1
  ),
  belief_agg AS (
    SELECT
      date_trunc((SELECT grain FROM bounds), created_at) AS bucket,
      COUNT(*) AS created
    FROM public.beliefs
    WHERE created_at >= (SELECT start_ts FROM bounds)
    GROUP BY 1
  )
  SELECT
    b.bucket,
    COALESCE(t.buy_volume_usd, 0),
    COALESCE(t.buys, 0)::INT,
    COALESCE(t.sells, 0)::INT,
    COALESCE(bl.created, 0)::INT
  FROM buckets b
  LEFT JOIN trade_agg  t  ON t.bucket  = b.bucket
  LEFT JOIN belief_agg bl ON bl.bucket = b.bucket
  ORDER BY b.bucket;
$$;
GRANT EXECUTE ON FUNCTION public.activity_series(TEXT) TO anon, authenticated;

-- 2) behavioral_grid — expose per-range buy volume (1h/24h/7d/30d already
--    computed by refresh_belief_stats(); all-time is summed live here) so
--    "what people believe" can be ranked by whatever timeframe is selected.
CREATE OR REPLACE VIEW public.behavioral_grid AS
SELECT
  b.belief_id,
  b.title,
  b.creator_address,
  b.created_at,
  s.buy_volume_1h_usd,
  s.buy_volume_24h_usd,
  s.buy_volume_7d_usd,
  s.buy_volume_30d_usd,
  COALESCE(t.buy_volume_all_usd, 0) AS buy_volume_all_usd,
  s.split_pct,
  s.ignition_score,
  s.momentum,
  s.whale_activity_pct,
  s.distribution_gini,
  s.delta_conviction_1h,
  s.lifecycle_stage,
  s.unique_wallets_24h,
  c.quality_score AS creator_quality
FROM public.beliefs b
JOIN public.belief_stats s ON s.belief_id = b.belief_id
LEFT JOIN public.creators c ON c.creator_address = b.creator_address
LEFT JOIN LATERAL (
  SELECT SUM(gross_amount_usd) AS buy_volume_all_usd
  FROM public.trades t
  WHERE t.belief_id = b.belief_id AND t.action = 'buy' AND t.is_canonical = TRUE
) t ON TRUE
WHERE b.title IS NOT NULL AND s.lifecycle_stage != 'archived';

GRANT SELECT ON public.behavioral_grid TO anon, authenticated;
