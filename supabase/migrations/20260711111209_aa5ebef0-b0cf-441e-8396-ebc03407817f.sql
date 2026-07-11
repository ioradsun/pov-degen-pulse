-- FIFO cost-basis walker. One row per sell. Sales without matching prior
-- buys (indexed coverage gap) contribute zero cost -> realized = proceeds;
-- with our full indexer coverage this should not happen in practice.
CREATE OR REPLACE FUNCTION public.realized_pnl_events()
RETURNS TABLE(
  event_id text,
  wallet_address text,
  belief_id integer,
  side text,
  sell_ts timestamptz,
  tokens_sold numeric,
  proceeds_usd numeric,
  proceeds_eth numeric,
  cost_usd numeric,
  cost_eth numeric,
  realized_usd numeric,
  realized_eth numeric,
  avg_hold_seconds numeric,
  is_full_exit boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  k text;
  lots jsonb;
  new_lots jsonb;
  lot jsonb;
  i int;
  remaining numeric;
  consumed numeric;
  lot_tw numeric;
  lot_cu numeric;
  lot_ce numeric;
  lot_ts numeric;
  unit_cost_usd numeric;
  unit_cost_eth numeric;
  acc_cost_usd numeric;
  acc_cost_eth numeric;
  acc_hold numeric;
  tokens_matched numeric;
  positions_map jsonb := '{}'::jsonb;
BEGIN
  FOR r IN
    SELECT
      t.wallet_address, t.belief_id, t.side, t.action, t.block_timestamp,
      t.log_index, t.tokens_delta,
      COALESCE(t.gross_amount_usd, 0) AS gross_usd,
      COALESCE(t.gross_amount_native::numeric, 0) AS gross_native,
      t.event_id AS eid
    FROM public.trades t
    WHERE t.is_canonical = TRUE
      AND t.tokens_delta IS NOT NULL AND t.tokens_delta > 0
      AND t.action IN ('buy','sell')
      AND t.side IN ('yes','no')
    ORDER BY t.block_timestamp, t.log_index
  LOOP
    k := r.wallet_address || ':' || r.belief_id || ':' || r.side;
    lots := COALESCE(positions_map -> k, '[]'::jsonb);

    IF r.action = 'buy' THEN
      lots := lots || jsonb_build_array(jsonb_build_object(
        'tw', r.tokens_delta::text,
        'cu', r.gross_usd::text,
        'ce', r.gross_native::text,
        'ts', extract(epoch FROM r.block_timestamp)::text
      ));
      positions_map := jsonb_set(positions_map, ARRAY[k], lots, true);
      CONTINUE;
    END IF;

    -- SELL: consume FIFO
    remaining := r.tokens_delta;
    acc_cost_usd := 0; acc_cost_eth := 0; acc_hold := 0;
    new_lots := '[]'::jsonb;

    FOR i IN 0 .. GREATEST(jsonb_array_length(lots) - 1, -1) LOOP
      lot := lots -> i;
      IF lot IS NULL THEN CONTINUE; END IF;
      IF remaining <= 0 THEN
        new_lots := new_lots || jsonb_build_array(lot);
        CONTINUE;
      END IF;
      lot_tw := (lot->>'tw')::numeric;
      lot_cu := (lot->>'cu')::numeric;
      lot_ce := (lot->>'ce')::numeric;
      lot_ts := (lot->>'ts')::numeric;

      IF lot_tw <= remaining THEN
        consumed := lot_tw;
        acc_cost_usd := acc_cost_usd + lot_cu;
        acc_cost_eth := acc_cost_eth + lot_ce;
        acc_hold := acc_hold + consumed * (extract(epoch FROM r.block_timestamp) - lot_ts);
        remaining := remaining - consumed;
        -- lot fully consumed; drop it
      ELSE
        consumed := remaining;
        unit_cost_usd := lot_cu / lot_tw;
        unit_cost_eth := lot_ce / lot_tw;
        acc_cost_usd := acc_cost_usd + unit_cost_usd * consumed;
        acc_cost_eth := acc_cost_eth + unit_cost_eth * consumed;
        acc_hold := acc_hold + consumed * (extract(epoch FROM r.block_timestamp) - lot_ts);
        remaining := 0;
        new_lots := new_lots || jsonb_build_array(jsonb_build_object(
          'tw', (lot_tw - consumed)::text,
          'cu', (lot_cu - unit_cost_usd * consumed)::text,
          'ce', (lot_ce - unit_cost_eth * consumed)::text,
          'ts', lot->>'ts'
        ));
      END IF;
    END LOOP;

    positions_map := jsonb_set(positions_map, ARRAY[k], new_lots, true);

    tokens_matched := r.tokens_delta - remaining;

    event_id := r.eid;
    wallet_address := r.wallet_address;
    belief_id := r.belief_id;
    side := r.side;
    sell_ts := r.block_timestamp;
    tokens_sold := tokens_matched;
    proceeds_usd := CASE WHEN r.tokens_delta > 0
      THEN r.gross_usd * tokens_matched / r.tokens_delta ELSE 0 END;
    proceeds_eth := CASE WHEN r.tokens_delta > 0
      THEN r.gross_native * tokens_matched / r.tokens_delta ELSE 0 END;
    cost_usd := acc_cost_usd;
    cost_eth := acc_cost_eth;
    realized_usd := proceeds_usd - acc_cost_usd;
    realized_eth := proceeds_eth - acc_cost_eth;
    avg_hold_seconds := CASE WHEN tokens_matched > 0 THEN acc_hold / tokens_matched ELSE NULL END;
    is_full_exit := (jsonb_array_length(new_lots) = 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.realized_pnl_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.realized_pnl_events() TO anon, authenticated, service_role;

-- Range window bounds (mirrors headline_metrics semantics: today-anchored)
CREATE OR REPLACE FUNCTION public._pnl_range_bounds(range_key text)
RETURNS TABLE(cur_start timestamptz, cur_end timestamptz, win interval)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH tz AS (SELECT 'America/New_York'::text AS zone),
  midnight AS (
    SELECT (date_trunc('day', now() AT TIME ZONE zone)) AT TIME ZONE zone AS today_start FROM tz
  )
  SELECT
    CASE range_key
      WHEN '1h'  THEN now() - INTERVAL '1 hour'
      WHEN '24h' THEN (SELECT today_start FROM midnight) - INTERVAL '1 day'
      WHEN '7d'  THEN (SELECT today_start FROM midnight) - INTERVAL '7 days'
      WHEN '30d' THEN (SELECT today_start FROM midnight) - INTERVAL '30 days'
      WHEN 'all' THEN NULL
      ELSE (SELECT today_start FROM midnight) - INTERVAL '1 day'
    END,
    CASE range_key
      WHEN '1h'  THEN now()
      WHEN 'all' THEN NULL
      ELSE (SELECT today_start FROM midnight)
    END,
    CASE range_key
      WHEN '1h'  THEN INTERVAL '1 hour'
      WHEN '24h' THEN INTERVAL '1 day'
      WHEN '7d'  THEN INTERVAL '7 days'
      WHEN '30d' THEN INTERVAL '30 days'
      ELSE INTERVAL '1 day'
    END;
$$;

CREATE OR REPLACE FUNCTION public.pnl_headline(range_key text)
RETURNS TABLE(
  realized_usd numeric, realized_eth numeric,
  exits integer, tokens_sold numeric,
  realized_usd_prev numeric, realized_eth_prev numeric,
  exits_prev integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH ev AS (SELECT * FROM public.realized_pnl_events()),
  cur AS (
    SELECT
      COALESCE(SUM(realized_usd),0)::numeric AS r_usd,
      COALESCE(SUM(realized_eth)/1e18,0)::numeric AS r_eth,
      COUNT(*)::int AS n,
      COALESCE(SUM(tokens_sold)/1e18,0)::numeric AS toks
    FROM ev
    WHERE cs IS NULL OR (sell_ts >= cs AND sell_ts < ce)
  ),
  prev AS (
    SELECT
      SUM(realized_usd)::numeric AS r_usd,
      (SUM(realized_eth)/1e18)::numeric AS r_eth,
      COUNT(*)::int AS n
    FROM ev
    WHERE cs IS NOT NULL AND sell_ts >= cs - wn AND sell_ts < cs
  )
  SELECT cur.r_usd, cur.r_eth, cur.n, cur.toks,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.r_usd,0) END,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.r_eth,0) END,
    CASE WHEN cs IS NULL THEN NULL ELSE COALESCE(prev.n,0) END
  FROM cur, prev;
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_headline(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_headline(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pnl_outcomes(range_key text)
RETURNS TABLE(
  realized_usd numeric,
  total_sells integer,
  profitable_sells integer,
  profitable_exit_rate numeric,
  avg_return numeric,
  full_exits integer,
  median_hold_seconds numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH ev AS (
    SELECT * FROM public.realized_pnl_events()
    WHERE (cs IS NULL OR (sell_ts >= cs AND sell_ts < ce))
      AND tokens_sold > 0
  )
  SELECT
    COALESCE(SUM(realized_usd),0)::numeric,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE realized_usd > 0)::int,
    CASE WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE realized_usd > 0))::numeric / COUNT(*)
      ELSE NULL END,
    -- Cost-weighted average return: sum(realized) / sum(cost)
    CASE WHEN COALESCE(SUM(cost_usd),0) > 0
      THEN SUM(realized_usd) / SUM(cost_usd)
      ELSE NULL END,
    COUNT(*) FILTER (WHERE is_full_exit)::int,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_hold_seconds)
      FILTER (WHERE is_full_exit AND avg_hold_seconds IS NOT NULL)
  FROM ev;
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_outcomes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_outcomes(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pnl_by_belief(range_key text, top_n integer DEFAULT 200)
RETURNS TABLE(
  belief_id integer,
  realized_usd numeric,
  realized_eth numeric,
  exits integer,
  profitable_exits integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn FROM public._pnl_range_bounds(range_key) b;
  RETURN QUERY
  WITH ev AS (
    SELECT * FROM public.realized_pnl_events()
    WHERE (cs IS NULL OR (sell_ts >= cs AND sell_ts < ce))
      AND tokens_sold > 0
  )
  SELECT
    ev.belief_id,
    COALESCE(SUM(ev.realized_usd),0)::numeric,
    COALESCE(SUM(ev.realized_eth)/1e18,0)::numeric,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE ev.realized_usd > 0)::int
  FROM ev
  GROUP BY ev.belief_id
  ORDER BY ABS(COALESCE(SUM(ev.realized_usd),0)) DESC NULLS LAST
  LIMIT GREATEST(top_n, 1);
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_by_belief(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_by_belief(text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pnl_buckets(granularity text DEFAULT 'hour', buckets_back integer DEFAULT 24)
RETURNS TABLE(bucket timestamptz, realized_usd numeric, realized_eth numeric, exits integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  step interval;
  tz text := 'America/New_York';
BEGIN
  IF granularity NOT IN ('hour','day','week','month') THEN
    RAISE EXCEPTION 'invalid granularity: %', granularity;
  END IF;
  step := CASE granularity
    WHEN 'hour' THEN interval '1 hour'
    WHEN 'day' THEN interval '1 day'
    WHEN 'week' THEN interval '1 week'
    WHEN 'month' THEN interval '1 month'
  END;
  RETURN QUERY
  WITH series AS (
    SELECT (date_trunc(granularity, (NOW() AT TIME ZONE tz)) AT TIME ZONE tz) - (n * step) AS b
    FROM generate_series(0, GREATEST(buckets_back, 1) - 1) AS n
  ),
  window_bounds AS (SELECT MIN(b) AS start_at FROM series),
  ev AS (
    SELECT * FROM public.realized_pnl_events(), window_bounds
    WHERE sell_ts >= window_bounds.start_at
  ),
  agg AS (
    SELECT
      (date_trunc(granularity, sell_ts AT TIME ZONE tz) AT TIME ZONE tz) AS b,
      COALESCE(SUM(realized_usd),0) AS r_usd,
      COALESCE(SUM(realized_eth)/1e18,0) AS r_eth,
      COUNT(*)::int AS n
    FROM ev
    GROUP BY 1
  )
  SELECT s.b, COALESCE(a.r_usd,0), COALESCE(a.r_eth,0), COALESCE(a.n,0)
  FROM series s LEFT JOIN agg a ON a.b = s.b
  ORDER BY s.b;
END; $$;
REVOKE EXECUTE ON FUNCTION public.pnl_buckets(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pnl_buckets(text, integer) TO anon, authenticated, service_role;