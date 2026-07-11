CREATE OR REPLACE FUNCTION public.repeat_wallet_rate()
 RETURNS TABLE(new_wallets integer, repeat_wallets integer, repeat_rate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH first_buy AS (
    SELECT wallet_address, MIN(block_timestamp) AS first_ts
    FROM public.trades
    WHERE action = 'buy' AND is_canonical = TRUE
    GROUP BY wallet_address
  ),
  eligible AS (
    SELECT wallet_address, first_ts
    FROM first_buy
    WHERE first_ts <= NOW() - INTERVAL '24 hours'
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
$function$;