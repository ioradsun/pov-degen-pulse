CREATE OR REPLACE FUNCTION public.belief_lifetime_totals()
RETURNS TABLE (
  belief_id bigint,
  buy_volume_all_usd numeric,
  sell_volume_all_usd numeric,
  unique_buyers_all integer,
  trades_all integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.belief_id,
    COALESCE(SUM(CASE WHEN t.action = 'buy'  THEN t.gross_amount_usd ELSE 0 END), 0)::numeric AS buy_volume_all_usd,
    COALESCE(SUM(CASE WHEN t.action = 'sell' THEN t.gross_amount_usd ELSE 0 END), 0)::numeric AS sell_volume_all_usd,
    COUNT(DISTINCT CASE WHEN t.action = 'buy' THEN t.wallet_address END)::integer AS unique_buyers_all,
    COUNT(*)::integer AS trades_all
  FROM public.trades t
  WHERE t.is_canonical = TRUE
  GROUP BY t.belief_id;
$$;

REVOKE ALL ON FUNCTION public.belief_lifetime_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.belief_lifetime_totals() TO anon, authenticated, service_role;
