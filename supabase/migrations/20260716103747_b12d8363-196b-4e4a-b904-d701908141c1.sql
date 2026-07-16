
CREATE OR REPLACE FUNCTION public.belief_price_deltas(range_key text, belief_ids bigint[])
RETURNS TABLE(
  belief_id bigint,
  yes_start numeric,
  yes_end numeric,
  yes_pct numeric,
  yes_trades integer,
  no_start numeric,
  no_end numeric,
  no_pct numeric,
  no_trades integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH b AS (
    SELECT cur_start, cur_end FROM public._pnl_range_bounds(range_key)
  ),
  scoped AS (
    SELECT
      t.belief_id,
      t.side,
      t.block_timestamp,
      t.log_index,
      (t.gross_amount_usd / NULLIF(t.tokens_delta, 0))::numeric AS px
    FROM public.trades t, b
    WHERE t.is_canonical = TRUE
      AND t.belief_id = ANY(belief_ids)
      AND t.side IN ('yes','no')
      AND t.tokens_delta IS NOT NULL AND t.tokens_delta > 0
      AND t.gross_amount_usd IS NOT NULL
      AND (b.cur_start IS NULL OR (t.block_timestamp >= b.cur_start AND t.block_timestamp < b.cur_end))
  ),
  ranked AS (
    SELECT
      s.belief_id, s.side, s.px,
      ROW_NUMBER() OVER (PARTITION BY s.belief_id, s.side ORDER BY s.block_timestamp ASC,  s.log_index ASC)  AS rn_first,
      ROW_NUMBER() OVER (PARTITION BY s.belief_id, s.side ORDER BY s.block_timestamp DESC, s.log_index DESC) AS rn_last,
      COUNT(*)   OVER (PARTITION BY s.belief_id, s.side) AS n
    FROM scoped s
  ),
  per_side AS (
    SELECT
      r.belief_id,
      r.side,
      MAX(CASE WHEN r.rn_first = 1 THEN r.px END) AS px_start,
      MAX(CASE WHEN r.rn_last  = 1 THEN r.px END) AS px_end,
      MAX(r.n)::int AS n
    FROM ranked r
    GROUP BY r.belief_id, r.side
  ),
  pivoted AS (
    SELECT
      bid AS belief_id,
      MAX(CASE WHEN side='yes' THEN px_start END) AS yes_start,
      MAX(CASE WHEN side='yes' THEN px_end   END) AS yes_end,
      COALESCE(MAX(CASE WHEN side='yes' THEN n END), 0) AS yes_trades,
      MAX(CASE WHEN side='no'  THEN px_start END) AS no_start,
      MAX(CASE WHEN side='no'  THEN px_end   END) AS no_end,
      COALESCE(MAX(CASE WHEN side='no'  THEN n END), 0) AS no_trades
    FROM (SELECT UNNEST(belief_ids) AS bid) ids
    LEFT JOIN per_side ON per_side.belief_id = ids.bid
    GROUP BY bid
  )
  SELECT
    p.belief_id,
    p.yes_start,
    p.yes_end,
    CASE WHEN p.yes_start IS NOT NULL AND p.yes_start > 0 AND p.yes_end IS NOT NULL
      THEN ((p.yes_end - p.yes_start) / p.yes_start) * 100 ELSE NULL END,
    p.yes_trades::int,
    p.no_start,
    p.no_end,
    CASE WHEN p.no_start IS NOT NULL AND p.no_start > 0 AND p.no_end IS NOT NULL
      THEN ((p.no_end - p.no_start) / p.no_start) * 100 ELSE NULL END,
    p.no_trades::int
  FROM pivoted p;
$$;

REVOKE ALL ON FUNCTION public.belief_price_deltas(text, bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.belief_price_deltas(text, bigint[]) TO anon, authenticated, service_role;
