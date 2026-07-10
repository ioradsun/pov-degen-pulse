
-- Migration 003: Functions
CREATE OR REPLACE FUNCTION public.headline_metrics(range_key TEXT)
RETURNS TABLE (
  buy_volume_usd       NUMERIC,
  active_traders       INT,
  new_beliefs          INT,
  creator_revenue_usd  NUMERIC,
  degen_allocation_usd NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH r AS (
    SELECT CASE range_key
      WHEN '1h'  THEN INTERVAL '1 hour'
      WHEN '24h' THEN INTERVAL '24 hours'
      WHEN '7d'  THEN INTERVAL '7 days'
      WHEN '30d' THEN INTERVAL '30 days'
      ELSE INTERVAL '24 hours'
    END AS window
  ),
  buys AS (
    SELECT
      COALESCE(SUM(gross_amount_usd), 0)::NUMERIC AS vol,
      COUNT(DISTINCT wallet_address)::INT        AS traders
    FROM public.trades, r
    WHERE action = 'buy' AND is_canonical = TRUE
      AND block_timestamp >= NOW() - r.window
  ),
  creates AS (
    SELECT COUNT(*)::INT AS n
    FROM public.beliefs, r
    WHERE title IS NOT NULL AND created_at >= NOW() - r.window
  )
  SELECT
    buys.vol,
    buys.traders,
    creates.n,
    (buys.vol * 0.10 * 0.3333)::NUMERIC,
    (buys.vol * 0.10 * 0.50)::NUMERIC
  FROM buys, creates;
$$;
GRANT EXECUTE ON FUNCTION public.headline_metrics(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_belief_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE belief_count INT;
BEGIN
  SELECT COUNT(*) INTO belief_count FROM public.beliefs WHERE title IS NOT NULL;
  IF belief_count > 500 THEN
    RAISE WARNING 'refresh_belief_stats skipped: % beliefs exceeds naive threshold.', belief_count;
    RETURN;
  END IF;

  INSERT INTO public.belief_stats (
    belief_id, computed_at,
    buy_volume_1h_usd, buy_volume_24h_usd, buy_volume_7d_usd, buy_volume_30d_usd,
    buy_velocity_15m, buy_velocity_baseline,
    ignition_score, split_pct, whale_activity_pct,
    unique_wallets_24h, lifecycle_stage, lifecycle_since
  )
  SELECT
    b.belief_id,
    NOW(),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '1 hour'),   0),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '7 days'),   0),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '30 days'),  0),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '15 min'),   0) / 15.0,
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '4 hours'),  0) / 240.0,
    CASE
      WHEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '4 hours'), 0) > 0
      THEN (COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '15 min'), 0) / 15.0)
         / (COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '4 hours'), 0) / 240.0)
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy'), 0) > 0
      THEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.side='yes'), 0)
         / COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy'), 0)
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0) > 0
      THEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.gross_amount_usd >= 500 AND t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0)
         / COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0)
      ELSE NULL
    END,
    COALESCE(COUNT(DISTINCT t.wallet_address) FILTER (WHERE t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0)::INT,
    'new',
    NOW()
  FROM public.beliefs b
  LEFT JOIN public.trades t
    ON t.belief_id = b.belief_id AND t.is_canonical = TRUE
    AND t.block_timestamp >= NOW() - INTERVAL '30 days'
  WHERE b.title IS NOT NULL
  GROUP BY b.belief_id
  ON CONFLICT (belief_id) DO UPDATE SET
    computed_at            = EXCLUDED.computed_at,
    buy_volume_1h_usd      = EXCLUDED.buy_volume_1h_usd,
    buy_volume_24h_usd     = EXCLUDED.buy_volume_24h_usd,
    buy_volume_7d_usd      = EXCLUDED.buy_volume_7d_usd,
    buy_volume_30d_usd     = EXCLUDED.buy_volume_30d_usd,
    buy_velocity_15m       = EXCLUDED.buy_velocity_15m,
    buy_velocity_baseline  = EXCLUDED.buy_velocity_baseline,
    ignition_score         = EXCLUDED.ignition_score,
    split_pct              = EXCLUDED.split_pct,
    whale_activity_pct     = EXCLUDED.whale_activity_pct,
    unique_wallets_24h     = EXCLUDED.unique_wallets_24h;
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_belief_stats() TO service_role;

CREATE OR REPLACE FUNCTION public.update_lifecycle_stages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  top_20_threshold NUMERIC;
  top_10_threshold NUMERIC;
BEGIN
  SELECT COALESCE(PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY buy_volume_24h_usd), 0) INTO top_20_threshold FROM public.belief_stats;
  SELECT COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY buy_volume_24h_usd), 0) INTO top_10_threshold FROM public.belief_stats;

  UPDATE public.belief_stats s SET lifecycle_stage='archived', lifecycle_since=NOW()
  FROM public.beliefs b
  WHERE s.belief_id=b.belief_id
    AND s.buy_volume_24h_usd=0
    AND NOT EXISTS (SELECT 1 FROM public.trades t WHERE t.belief_id=s.belief_id AND t.block_timestamp>=NOW()-INTERVAL '72 hours')
    AND s.lifecycle_stage!='archived';

  UPDATE public.belief_stats s SET lifecycle_stage='new', lifecycle_since=NOW()
  FROM public.beliefs b
  WHERE s.belief_id=b.belief_id
    AND b.created_at>=NOW()-INTERVAL '2 hours'
    AND s.unique_wallets_24h<10
    AND s.lifecycle_stage!='new';

  UPDATE public.belief_stats SET lifecycle_stage='cooling', lifecycle_since=NOW()
  WHERE buy_velocity_baseline>0 AND buy_velocity_15m<buy_velocity_baseline*0.4
    AND lifecycle_stage NOT IN ('cooling','archived');

  UPDATE public.belief_stats SET lifecycle_stage='trending', lifecycle_since=NOW()
  WHERE buy_volume_24h_usd>=top_20_threshold AND buy_volume_24h_usd>0
    AND lifecycle_stage NOT IN ('trending','dominant','igniting');

  UPDATE public.belief_stats s SET lifecycle_stage='dominant', lifecycle_since=NOW()
  FROM public.beliefs b
  WHERE s.belief_id=b.belief_id
    AND b.created_at<NOW()-INTERVAL '7 days'
    AND s.buy_volume_24h_usd>=top_10_threshold
    AND ABS(s.split_pct-0.5)>0.15
    AND s.lifecycle_stage NOT IN ('dominant','igniting');

  UPDATE public.belief_stats SET lifecycle_stage='igniting', lifecycle_since=NOW()
  WHERE ignition_score>=3 AND lifecycle_stage!='igniting';
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_lifecycle_stages() TO service_role;

-- Migration 004: pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('refresh-belief-stats',    '* * * * *', $$SELECT public.refresh_belief_stats();$$);
SELECT cron.schedule('update-lifecycle-stages', '* * * * *', $$SELECT public.update_lifecycle_stages();$$);

DO $$
DECLARE job_count INT;
BEGIN
  SELECT COUNT(*) INTO job_count FROM cron.job
  WHERE jobname IN ('refresh-belief-stats','update-lifecycle-stages');
  IF job_count < 2 THEN
    RAISE EXCEPTION 'pg_cron jobs did not register (found %).', job_count;
  END IF;
END $$;
