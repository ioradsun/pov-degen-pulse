
-- Migration 002: Views + Realtime

CREATE OR REPLACE VIEW public.live_activity_events AS
SELECT
  CONCAT(chain_id::TEXT, ':', creation_tx_hash, ':', creation_log_index) AS event_id,
  chain_id,
  creation_tx_hash    AS tx_hash,
  creation_log_index  AS log_index,
  created_block       AS block_number,
  created_at          AS event_timestamp,
  'new_belief'::TEXT  AS event_type,
  NULL::TEXT          AS action,
  NULL::TEXT          AS side,
  belief_id,
  title               AS belief_text,
  creator_address     AS wallet_address,
  NULL::NUMERIC       AS amount_usd,
  NULL::TEXT          AS payment_token_symbol,
  TRUE                AS is_confirmed,
  TRUE                AS is_canonical
FROM public.beliefs
WHERE title IS NOT NULL

UNION ALL

SELECT
  t.event_id,
  t.chain_id,
  t.tx_hash,
  t.log_index,
  t.block_number,
  t.block_timestamp AS event_timestamp,
  CASE
    WHEN t.action = 'buy'  AND t.side = 'yes' THEN 'yes_buy'
    WHEN t.action = 'buy'  AND t.side = 'no'  THEN 'no_buy'
    WHEN t.action = 'sell' AND t.side = 'yes' THEN 'yes_sell'
    WHEN t.action = 'sell' AND t.side = 'no'  THEN 'no_sell'
  END AS event_type,
  t.action,
  t.side,
  t.belief_id,
  b.title AS belief_text,
  t.wallet_address,
  t.gross_amount_usd AS amount_usd,
  t.payment_token_symbol,
  t.is_confirmed,
  t.is_canonical
FROM public.trades t
JOIN public.beliefs b ON b.belief_id = t.belief_id
WHERE t.is_canonical = TRUE
  AND b.title IS NOT NULL;

CREATE OR REPLACE VIEW public.behavioral_grid AS
SELECT
  b.belief_id,
  b.title,
  b.creator_address,
  b.created_at,
  s.buy_volume_24h_usd,
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
WHERE b.title IS NOT NULL
  AND s.lifecycle_stage != 'archived';

GRANT SELECT ON public.live_activity_events TO anon, authenticated;
GRANT SELECT ON public.behavioral_grid TO anon, authenticated;

-- Realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='trades') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='beliefs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.beliefs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='belief_stats') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.belief_stats;
  END IF;
END $$;
