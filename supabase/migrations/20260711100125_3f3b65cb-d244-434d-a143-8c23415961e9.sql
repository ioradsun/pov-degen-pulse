
ALTER TABLE public.beliefs
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS creator_display_name TEXT;

DROP VIEW IF EXISTS public.live_activity_events;

CREATE VIEW public.live_activity_events AS
SELECT concat(beliefs.chain_id::text, ':', beliefs.creation_tx_hash, ':', beliefs.creation_log_index) AS event_id,
    beliefs.chain_id,
    beliefs.creation_tx_hash AS tx_hash,
    beliefs.creation_log_index AS log_index,
    beliefs.created_block AS block_number,
    beliefs.created_at AS event_timestamp,
    'new_belief'::text AS event_type,
    NULL::text AS action,
    NULL::text AS side,
    beliefs.belief_id,
    beliefs.title AS belief_text,
    beliefs.slug AS belief_slug,
    beliefs.creator_address AS wallet_address,
    NULL::numeric AS amount_usd,
    NULL::text AS payment_token_symbol,
    true AS is_confirmed,
    true AS is_canonical
FROM beliefs
UNION ALL
SELECT t.event_id,
    t.chain_id,
    t.tx_hash,
    t.log_index,
    t.block_number,
    t.block_timestamp AS event_timestamp,
    CASE
        WHEN t.action = 'buy'::text  AND t.side = 'yes'::text THEN 'yes_buy'::text
        WHEN t.action = 'buy'::text  AND t.side = 'no'::text  THEN 'no_buy'::text
        WHEN t.action = 'sell'::text AND t.side = 'yes'::text THEN 'yes_sell'::text
        WHEN t.action = 'sell'::text AND t.side = 'no'::text  THEN 'no_sell'::text
        ELSE NULL::text
    END AS event_type,
    t.action,
    t.side,
    t.belief_id,
    b.title AS belief_text,
    b.slug AS belief_slug,
    t.wallet_address,
    t.gross_amount_usd AS amount_usd,
    t.payment_token_symbol,
    t.is_confirmed,
    t.is_canonical
FROM trades t
JOIN beliefs b ON b.belief_id = t.belief_id
WHERE t.is_canonical = true;

ALTER VIEW public.live_activity_events SET (security_invoker = on);
GRANT SELECT ON public.live_activity_events TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.repeat_wallet_rate()
RETURNS TABLE (
  new_wallets    INT,
  repeat_wallets INT,
  repeat_rate    NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH first_buy AS (
    SELECT wallet_address, MIN(block_timestamp) AS first_ts
    FROM public.trades
    WHERE action = 'buy' AND is_canonical = TRUE
    GROUP BY wallet_address
  ),
  eligible AS (
    SELECT wallet_address, first_ts
    FROM first_buy
    WHERE first_ts <= NOW() - INTERVAL '7 days'
  ),
  repeats AS (
    SELECT DISTINCT e.wallet_address
    FROM eligible e
    JOIN public.trades t
      ON t.wallet_address = e.wallet_address
     AND t.action = 'buy'
     AND t.is_canonical = TRUE
     AND t.block_timestamp > e.first_ts
     AND t.block_timestamp <= e.first_ts + INTERVAL '7 days'
     AND date_trunc('day', t.block_timestamp) <> date_trunc('day', e.first_ts)
  )
  SELECT
    (SELECT COUNT(*) FROM eligible)::INT,
    (SELECT COUNT(*) FROM repeats)::INT,
    CASE WHEN (SELECT COUNT(*) FROM eligible) > 0
      THEN (SELECT COUNT(*) FROM repeats)::NUMERIC / (SELECT COUNT(*) FROM eligible)
      ELSE NULL
    END;
$$;
GRANT EXECUTE ON FUNCTION public.repeat_wallet_rate() TO anon, authenticated;
