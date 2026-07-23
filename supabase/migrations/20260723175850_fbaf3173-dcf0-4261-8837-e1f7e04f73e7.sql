
CREATE OR REPLACE FUNCTION public.wallet_positions(addr text)
 RETURNS TABLE(belief_id bigint, title text, slug text, side text, in_eth numeric, out_eth numeric, realized_eth numeric, remaining_tokens numeric, hold_value_eth numeric, remaining_cost_eth numeric, unrealized_eth numeric, roi numeric, state text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  tr_stream AS (
    SELECT t.belief_id, t.side, t.action,
      t.tokens_delta::numeric AS dt,
      t.gross_amount_native::numeric AS wei,
      SUM(CASE WHEN t.action='buy' THEN t.tokens_delta::numeric ELSE -t.tokens_delta::numeric END)
        OVER (PARTITION BY t.belief_id, t.side ORDER BY t.block_timestamp, t.log_index) AS supply_after
    FROM public.trades t
    WHERE t.is_canonical = TRUE
      AND t.action IN ('buy','sell')
      AND t.side IN ('yes','no')
      AND t.tokens_delta > 0
      AND (t.belief_id, t.side) IN (SELECT belief_id, side FROM per_key)
  ),
  cur_supply AS (
    SELECT belief_id, side,
      SUM(CASE WHEN action='buy' THEN dt ELSE -dt END) AS s_now
    FROM tr_stream GROUP BY belief_id, side
  ),
  fit_points AS (
    SELECT belief_id, side, action,
      CASE WHEN action='sell' THEN supply_after + dt/2 ELSE supply_after - dt/2 END AS mid_s,
      CASE WHEN action='sell' THEN wei/dt ELSE (wei*0.9)/dt END AS px
    FROM tr_stream
  ),
  fit_sells AS (
    SELECT belief_id, side,
      regr_slope(px, mid_s)     AS m,
      regr_intercept(px, mid_s) AS b
    FROM fit_points WHERE action='sell'
    GROUP BY belief_id, side
    HAVING count(*) >= 3 AND regr_slope(px, mid_s) IS NOT NULL
  ),
  fit_buys AS (
    SELECT belief_id, side,
      regr_slope(px, mid_s)     AS m,
      regr_intercept(px, mid_s) AS b
    FROM fit_points WHERE action='buy'
    GROUP BY belief_id, side
    HAVING count(*) >= 2 AND regr_slope(px, mid_s) IS NOT NULL
  ),
  fit AS (
    SELECT COALESCE(s.belief_id, b2.belief_id) AS belief_id,
           COALESCE(s.side, b2.side) AS side,
           COALESCE(s.m, b2.m) AS m,
           COALESCE(s.b, b2.b) AS b
    FROM fit_sells s
    FULL OUTER JOIN fit_buys b2 ON b2.belief_id = s.belief_id AND b2.side = s.side
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
    SELECT p.belief_id, p.side, p.bought_tk, p.sold_tk, p.buy_wei, p.sell_wei,
      (p.bought_tk - p.sold_tk)                      AS remaining_tk,
      (p.buy_wei - COALESCE(ev.cost_consumed_wei,0)) AS remaining_cost_wei,
      COALESCE(ev.r_eth_wei,0)                       AS r_eth_wei,
      COALESCE(cs.s_now, 0)                          AS s_now,
      f.b AS fb, f.m AS fm,
      COALESCE(lp.px, 0)                             AS last_px
    FROM per_key p
    LEFT JOIN ev  ON ev.belief_id = p.belief_id AND ev.side = p.side
    LEFT JOIN cur_supply cs ON cs.belief_id = p.belief_id AND cs.side = p.side
    LEFT JOIN fit f ON f.belief_id = p.belief_id AND f.side = p.side
    LEFT JOIN last_price lp ON lp.belief_id = p.belief_id AND lp.side = p.side
  ),
  calc AS (
    SELECT pos.*,
      GREATEST(
        CASE
          WHEN pos.remaining_tk <= 0 THEN 0
          WHEN pos.fb IS NULL AND pos.fm IS NULL THEN pos.remaining_tk * pos.last_px
          ELSE COALESCE(pos.fb,0) * pos.remaining_tk
             + COALESCE(pos.fm,0) * pos.remaining_tk * (pos.s_now - pos.remaining_tk/2)
        END, 0
      ) AS hold_wei,
      GREATEST(pos.remaining_cost_wei,0) AS rem_cost_wei,
      (pos.remaining_tk <= pos.bought_tk * 1e-4) AS closed
    FROM pos
  ),
  calc2 AS (
    SELECT c.*, (c.hold_wei - c.rem_cost_wei) AS unreal_wei FROM calc c
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
    ((c.r_eth_wei + c.unreal_wei) / NULLIF(c.buy_wei, 0))::numeric,
    CASE
      WHEN c.closed AND (c.r_eth_wei + c.unreal_wei) > 0 THEN 'won'
      WHEN c.closed                                      THEN 'lost'
      WHEN (c.r_eth_wei + c.unreal_wei) > 0              THEN 'open_up'
      ELSE                                                    'open_down'
    END
  FROM calc2 c
  LEFT JOIN public.beliefs b ON b.belief_id = c.belief_id
  ORDER BY c.buy_wei DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.wallet_positions(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_positions(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.wallet_positions(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_positions(text) TO service_role;
