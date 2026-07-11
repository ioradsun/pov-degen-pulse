DROP FUNCTION IF EXISTS public.trader_outcomes(text);

CREATE OR REPLACE FUNCTION public.trader_outcomes(range_key text)
RETURNS TABLE(
  label text,
  sellers int,
  realized_winners int,
  realized_net_eth numeric,
  realized_net_usd numeric,
  holders int,
  holder_winners int,
  unrealized_eth numeric,
  unrealized_usd numeric,
  holding_value_eth numeric,
  holding_value_usd numeric,
  money_in_eth numeric,
  money_in_usd numeric,
  money_out_eth numeric,
  money_out_usd numeric,
  net_eth numeric,
  net_usd numeric,
  wallets_total int,
  ahead int,
  behind int,
  banked int,
  paper_up int,
  underwater int,
  locked_loss int,
  top3_gain_share numeric,
  top5_gain_share numeric,
  won_positions int,
  lost_positions int,
  open_positions int,
  open_up int,
  open_down int
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;

  RETURN QUERY
  WITH cutoffs AS (
    SELECT 'now'::text AS lbl, now() AS t
    UNION ALL
    SELECT 'prev', cs WHERE cs IS NOT NULL
  ),
  tr AS (
    SELECT c.lbl, t.wallet_address, t.belief_id, t.side, t.action,
      t.tokens_delta::numeric AS tk,
      t.gross_amount_native::numeric AS gross_wei,
      COALESCE(t.gross_amount_usd,0)::numeric AS gross_usd
    FROM cutoffs c
    JOIN public.trades t
      ON t.is_canonical = TRUE
     AND t.action IN ('buy','sell')
     AND t.side IN ('yes','no')
     AND t.tokens_delta > 0
     AND t.block_timestamp <= c.t
  ),
  per_key AS (
    SELECT lbl, wallet_address, belief_id, side,
      SUM(CASE WHEN action='buy'  THEN tk        ELSE 0 END) AS bought_tk,
      SUM(CASE WHEN action='sell' THEN tk        ELSE 0 END) AS sold_tk,
      SUM(CASE WHEN action='buy'  THEN gross_wei ELSE 0 END) AS buy_wei,
      SUM(CASE WHEN action='sell' THEN gross_wei ELSE 0 END) AS sell_wei,
      SUM(CASE WHEN action='buy'  THEN gross_usd ELSE 0 END) AS buy_usd,
      SUM(CASE WHEN action='sell' THEN gross_usd ELSE 0 END) AS sell_usd
    FROM tr
    GROUP BY lbl, wallet_address, belief_id, side
  ),
  ev AS (
    SELECT c.lbl, e.wallet_address, e.belief_id, e.side,
      SUM(e.cost_eth)     AS cost_consumed_wei,
      SUM(e.cost_usd)     AS cost_consumed_usd,
      SUM(e.realized_eth) AS r_eth_wei,
      SUM(e.realized_usd) AS r_usd
    FROM cutoffs c
    JOIN public.realized_pnl_events_cache e ON e.sell_ts <= c.t
    GROUP BY c.lbl, e.wallet_address, e.belief_id, e.side
  ),
  last_price AS (
    SELECT DISTINCT ON (belief_id, side)
      belief_id, side,
      gross_amount_native::numeric / NULLIF(tokens_delta::numeric,0) AS px_wei_per_tkwei,
      COALESCE(gross_amount_usd,0)::numeric / NULLIF(tokens_delta::numeric,0) AS px_usd_per_tkwei
    FROM public.trades
    WHERE is_canonical = TRUE AND tokens_delta > 0 AND action IN ('buy','sell')
    ORDER BY belief_id, side, block_timestamp DESC, log_index DESC
  ),
  pos AS (
    SELECT p.lbl, p.wallet_address, p.belief_id, p.side,
      p.bought_tk,
      (p.bought_tk - p.sold_tk)                         AS remaining_tk,
      (p.buy_wei - COALESCE(ev.cost_consumed_wei,0))    AS remaining_cost_wei,
      (p.buy_usd - COALESCE(ev.cost_consumed_usd,0))    AS remaining_cost_usd,
      p.buy_wei, p.sell_wei, p.buy_usd, p.sell_usd,
      COALESCE(ev.r_eth_wei,0)                          AS r_eth_wei,
      COALESCE(ev.r_usd,0)                              AS r_usd,
      lp.px_wei_per_tkwei, lp.px_usd_per_tkwei
    FROM per_key p
    LEFT JOIN ev
      ON ev.lbl = p.lbl
     AND ev.wallet_address = p.wallet_address
     AND ev.belief_id = p.belief_id
     AND ev.side = p.side
    LEFT JOIN last_price lp
      ON lp.belief_id = p.belief_id AND lp.side = p.side
  ),
  per_wallet AS (
    SELECT
      p.lbl, p.wallet_address,
      SUM(p.buy_wei)     AS in_wei,
      SUM(p.buy_usd)     AS in_usd,
      SUM(p.sell_wei)    AS out_wei,
      SUM(p.sell_usd)    AS out_usd,
      SUM(p.r_eth_wei)   AS realized_eth_wei,
      SUM(p.r_usd)       AS realized_usd,
      SUM(GREATEST(p.remaining_tk,0) * COALESCE(p.px_wei_per_tkwei,0)) AS hold_wei,
      SUM(GREATEST(p.remaining_tk,0) * COALESCE(p.px_usd_per_tkwei,0)) AS hold_usd,
      SUM(GREATEST(p.remaining_cost_wei,0)) AS rem_cost_wei,
      SUM(GREATEST(p.remaining_cost_usd,0)) AS rem_cost_usd,
      SUM(GREATEST(p.remaining_tk,0))       AS rem_tk_total
    FROM pos p
    GROUP BY p.lbl, p.wallet_address
  ),
  scored AS (
    SELECT pw.*,
      (pw.realized_eth_wei + pw.hold_wei - pw.rem_cost_wei) AS total_wei,
      (pw.rem_tk_total > 0)                                 AS has_open
    FROM per_wallet pw
  ),
  gains AS (
    SELECT lbl, realized_eth_wei AS g,
      row_number() OVER (PARTITION BY lbl ORDER BY realized_eth_wei DESC) AS rnk
    FROM per_wallet
    WHERE out_wei > 0 AND realized_eth_wei > 0
  ),
  conc AS (
    SELECT lbl,
      (SUM(g) FILTER (WHERE rnk <= 3)) / NULLIF(SUM(g),0) AS top3,
      (SUM(g) FILTER (WHERE rnk <= 5)) / NULLIF(SUM(g),0) AS top5
    FROM gains
    GROUP BY lbl
  ),
  posstat AS (
    SELECT p.lbl,
      COUNT(*) FILTER (
        WHERE p.remaining_tk <= p.bought_tk * 1e-4
          AND p.sell_wei > 0 AND p.r_eth_wei > 0
      )::int AS won_positions,
      COUNT(*) FILTER (
        WHERE p.remaining_tk <= p.bought_tk * 1e-4
          AND p.sell_wei > 0 AND p.r_eth_wei <= 0
      )::int AS lost_positions,
      COUNT(*) FILTER (WHERE p.remaining_tk > p.bought_tk * 1e-4)::int AS open_positions,
      COUNT(*) FILTER (
        WHERE p.remaining_tk > p.bought_tk * 1e-4
          AND (GREATEST(p.remaining_tk,0) * COALESCE(p.px_wei_per_tkwei,0)
               - GREATEST(p.remaining_cost_wei,0)) > 0
      )::int AS open_up,
      COUNT(*) FILTER (
        WHERE p.remaining_tk > p.bought_tk * 1e-4
          AND (GREATEST(p.remaining_tk,0) * COALESCE(p.px_wei_per_tkwei,0)
               - GREATEST(p.remaining_cost_wei,0)) <= 0
      )::int AS open_down
    FROM pos p
    GROUP BY p.lbl
  )
  SELECT
    s.lbl AS label,
    COUNT(*) FILTER (WHERE s.out_wei > 0)::int AS sellers,
    COUNT(*) FILTER (WHERE s.out_wei > 0 AND s.realized_eth_wei > 0)::int AS realized_winners,
    (COALESCE(SUM(s.realized_eth_wei) FILTER (WHERE s.out_wei > 0),0) / 1e18)::numeric AS realized_net_eth,
    (COALESCE(SUM(s.realized_usd)     FILTER (WHERE s.out_wei > 0),0))::numeric        AS realized_net_usd,
    COUNT(*) FILTER (WHERE s.rem_tk_total > 0)::int AS holders,
    COUNT(*) FILTER (WHERE s.rem_tk_total > 0 AND (s.hold_wei - s.rem_cost_wei) > 0)::int AS holder_winners,
    (COALESCE(SUM(s.hold_wei - s.rem_cost_wei) FILTER (WHERE s.rem_tk_total > 0),0) / 1e18)::numeric AS unrealized_eth,
    (COALESCE(SUM(s.hold_usd - s.rem_cost_usd) FILTER (WHERE s.rem_tk_total > 0),0))::numeric        AS unrealized_usd,
    (COALESCE(SUM(s.hold_wei) FILTER (WHERE s.rem_tk_total > 0),0) / 1e18)::numeric AS holding_value_eth,
    (COALESCE(SUM(s.hold_usd) FILTER (WHERE s.rem_tk_total > 0),0))::numeric        AS holding_value_usd,
    (COALESCE(SUM(s.in_wei),0)  / 1e18)::numeric AS money_in_eth,
    (COALESCE(SUM(s.in_usd),0))::numeric         AS money_in_usd,
    (COALESCE(SUM(s.out_wei),0) / 1e18)::numeric AS money_out_eth,
    (COALESCE(SUM(s.out_usd),0))::numeric        AS money_out_usd,
    ((COALESCE(SUM(s.out_wei),0) + COALESCE(SUM(s.hold_wei) FILTER (WHERE s.rem_tk_total > 0),0) - COALESCE(SUM(s.in_wei),0)) / 1e18)::numeric AS net_eth,
    ( COALESCE(SUM(s.out_usd),0) + COALESCE(SUM(s.hold_usd) FILTER (WHERE s.rem_tk_total > 0),0) - COALESCE(SUM(s.in_usd),0))::numeric        AS net_usd,
    COUNT(*)::int AS wallets_total,
    COUNT(*) FILTER (WHERE s.total_wei > 0)::int AS ahead,
    COUNT(*) FILTER (WHERE s.total_wei <= 0)::int AS behind,
    COUNT(*) FILTER (WHERE NOT s.has_open AND s.total_wei > 0)::int AS banked,
    COUNT(*) FILTER (WHERE s.has_open AND s.total_wei > 0)::int AS paper_up,
    COUNT(*) FILTER (WHERE s.has_open AND s.total_wei <= 0)::int AS underwater,
    COUNT(*) FILTER (WHERE NOT s.has_open AND s.total_wei <= 0)::int AS locked_loss,
    MAX(conc.top3) AS top3_gain_share,
    MAX(conc.top5) AS top5_gain_share,
    MAX(posstat.won_positions)  AS won_positions,
    MAX(posstat.lost_positions) AS lost_positions,
    MAX(posstat.open_positions) AS open_positions,
    MAX(posstat.open_up)        AS open_up,
    MAX(posstat.open_down)      AS open_down
  FROM scored s
  LEFT JOIN conc ON conc.lbl = s.lbl
  LEFT JOIN posstat ON posstat.lbl = s.lbl
  GROUP BY s.lbl;
END; $$;

REVOKE ALL ON FUNCTION public.trader_outcomes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trader_outcomes(text) TO anon, authenticated, service_role;