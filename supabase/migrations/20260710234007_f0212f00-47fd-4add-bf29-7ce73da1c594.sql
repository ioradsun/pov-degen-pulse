CREATE OR REPLACE VIEW public.live_activity_events AS
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
            WHEN t.action = 'buy'::text AND t.side = 'yes'::text THEN 'yes_buy'::text
            WHEN t.action = 'buy'::text AND t.side = 'no'::text THEN 'no_buy'::text
            WHEN t.action = 'sell'::text AND t.side = 'yes'::text THEN 'yes_sell'::text
            WHEN t.action = 'sell'::text AND t.side = 'no'::text THEN 'no_sell'::text
            ELSE NULL::text
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
   FROM trades t
     JOIN beliefs b ON b.belief_id = t.belief_id
  WHERE t.is_canonical = true;

ALTER VIEW public.live_activity_events SET (security_invoker = on);