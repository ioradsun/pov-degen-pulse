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
  WITH active AS (
    SELECT DISTINCT wallet_address
    FROM public.trades
    WHERE is_canonical = TRUE
      AND block_timestamp >= NOW() - INTERVAL '24 hours'
  ),
  classified AS (
    SELECT
      a.wallet_address,
      EXISTS (
        SELECT 1 FROM public.trades t
        WHERE t.wallet_address = a.wallet_address
          AND t.is_canonical = TRUE
          AND t.block_timestamp < NOW() - INTERVAL '24 hours'
      ) AS is_repeat
    FROM active a
  )
  SELECT
    COUNT(*) FILTER (WHERE NOT is_repeat)::INT AS new_wallets,
    COUNT(*) FILTER (WHERE is_repeat)::INT     AS repeat_wallets,
    CASE WHEN COUNT(*) = 0 THEN NULL
         ELSE (COUNT(*) FILTER (WHERE is_repeat))::NUMERIC / COUNT(*)::NUMERIC
    END AS repeat_rate
  FROM classified;
$$;

GRANT EXECUTE ON FUNCTION public.repeat_wallet_rate() TO anon, authenticated;