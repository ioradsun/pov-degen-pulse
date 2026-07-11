
-- Migration: re-assert the correct repeat_wallet_rate() definition.
--
-- A second, different implementation of this function
-- (20260711012108_5887e672-...sql) landed after the original
-- (20260711013000_repeat_wallet_rate.sql) and ended up as the live
-- definition. That version answers a different question — "of wallets
-- active in the last 24h, how many have ever traded before?" — which can
-- report repeat_wallets > new_wallets and drifts every hour instead of
-- measuring 7-day return behavior.
--
-- Restore the originally specified metric: of wallets whose first-ever buy
-- was at least 7 days ago (so they've had the full window to return), what
-- share bought again on a different calendar day within 7 days of that
-- first buy.
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
