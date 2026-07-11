
-- Migration: repeat_wallet_rate() — 7-day repeat wallet rate.
-- Cohort is wallets whose first-ever buy happened at least 7 days ago (so
-- every wallet counted has had the full 7-day window to return); a wallet
-- "repeats" if it buys again on a different calendar day within 7 days of
-- its first buy.
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
