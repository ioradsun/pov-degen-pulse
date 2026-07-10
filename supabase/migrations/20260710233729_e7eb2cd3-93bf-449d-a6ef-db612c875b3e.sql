CREATE OR REPLACE FUNCTION public.refresh_belief_stats()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE belief_count INT;
BEGIN
  SELECT COUNT(*) INTO belief_count FROM public.beliefs;
  IF belief_count > 5000 THEN
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

  PERFORM public.update_lifecycle_stages();
END;
$function$;

SELECT public.refresh_belief_stats();