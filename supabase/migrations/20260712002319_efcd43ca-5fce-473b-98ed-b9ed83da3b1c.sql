CREATE OR REPLACE FUNCTION public.wallet_positions(addr text)
RETURNS TABLE(
  belief_id bigint,
  title text,
  slug text,
  side text,
  in_eth numeric,
  out_eth numeric,
  realized_eth numeric,
  remaining_tokens numeric,
  hold_value_eth numeric,
  remaining_cost_eth numeric,
  unrealized_eth numeric,
  roi numeric,
  state text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  WITH w AS (SELECT lower(addr) AS a),
  per_key AS (
    SELECT t.belief_id, t.side,
      SUM(CASE WHEN t.action='buy'  THEN t.tokens_delta::numeric        ELSE 0 END) AS bought_tk,
      SUM(CASE WHEN t.action='sell' THEN t.tokens_delta::numeric        ELSE 0 END) AS sold_tk,
      SUM(CASE WHEN t.action='buy'  THEN t.gross_amount_native::numeric ELSE 0 END) AS buy_wei,
      SUM(CASE WHEN t.action='sell' THEN t.gross_amount_native::numeric ELSE 0 END) AS sell_wei
    FROM public.trades t, w
    WHERE t.is_canonical = TRUE
      AND t.action IN ('buy','sell')
      AND t.side IN ('yes','no')
      AND t.tokens_delta > 0
      AND lower(t.wallet_address) = w.a
    GROUP BY t.belief_id, t.side
  ),
  ev AS (
    SELECT e.belief_id, e.side,
      SUM(e.cost_eth)     AS cost_consumed_wei,
      SUM(e.realized_eth) AS r_eth_wei
    FROM public.realized_pnl_events_cache e, w
    WHERE lower(e.wallet_address) = w.a
    GROUP BY e.belief_id, e.side
  ),
  last_price AS (
    SELECT DISTINCT ON (belief_id, side)
      belief_id, side,
      gross_amount_native::numeric / NULLIF(tokens_delta::numeric,0) AS px
    FROM public.trades
    WHERE is_canonical = TRUE AND tokens_delta > 0 AND action IN ('buy','sell')
    ORDER BY belief_id, side, block_timestamp DESC, log_index DESC
  ),
  pos AS (
    SELECT p.belief_id, p.side, p.bought_tk, p.buy_wei, p.sell_wei,
      (p.bought_tk - p.sold_tk)                      AS remaining_tk,
      (p.buy_wei - COALESCE(ev.cost_consumed_wei,0)) AS remaining_cost_wei,
      COALESCE(ev.r_eth_wei,0)                       AS r_eth_wei,
      COALESCE(lp.px,0)                              AS px
    FROM per_key p
    LEFT JOIN ev ON ev.belief_id = p.belief_id AND ev.side = p.side
    LEFT JOIN last_price lp ON lp.belief_id = p.belief_id AND lp.side = p.side
  ),
  calc AS (
    SELECT pos.*,
      GREATEST(pos.remaining_tk,0) * pos.px                                       AS hold_wei,
      GREATEST(pos.remaining_cost_wei,0)                                          AS rem_cost_wei,
      (GREATEST(pos.remaining_tk,0) * pos.px - GREATEST(pos.remaining_cost_wei,0)) AS unreal_wei,
      (pos.remaining_tk <= pos.bought_tk * 1e-4 AND pos.sell_wei > 0)             AS closed
    FROM pos
  )
  SELECT
    c.belief_id::bigint,
    b.title,
    b.slug,
    c.side,
    (c.buy_wei      / 1e18)::numeric,
    (c.sell_wei     / 1e18)::numeric,
    (c.r_eth_wei    / 1e18)::numeric,
    c.remaining_tk,
    (c.hold_wei     / 1e18)::numeric,
    (c.rem_cost_wei / 1e18)::numeric,
    (c.unreal_wei   / 1e18)::numeric,
    CASE
      WHEN c.closed THEN c.r_eth_wei  / NULLIF(c.buy_wei,0)
      ELSE               c.unreal_wei / NULLIF(c.rem_cost_wei,0)
    END,
    CASE
      WHEN c.closed AND c.r_eth_wei > 0 THEN 'won'
      WHEN c.closed                     THEN 'lost'
      WHEN c.unreal_wei > 0             THEN 'open_up'
      ELSE                                   'open_down'
    END
  FROM calc c
  LEFT JOIN public.beliefs b ON b.belief_id = c.belief_id
  ORDER BY c.buy_wei DESC;
$$;

REVOKE ALL ON FUNCTION public.wallet_positions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_positions(text) TO anon, authenticated, service_role;