-- Cumulative trader-outcome model.
--
-- First principles: a wallet is ONE cumulative ledger, not a per-window slice.
-- At any instant T it has (a) realized P&L from everything it has sold, and
-- (b) unrealized P&L on everything it still holds, marked at the last price.
-- The timeframe selector is an AS-OF + comparison lens: the headline is the
-- cumulative state as of now(); the delta is now() minus (now() - window).
--
-- Wins/losses are decided in ETH (native wei, exact). USD is stamped at
-- ingest-time spot and returned only for display. Held shares are valued at
-- the most recent trade price for that belief+side (see belief_marks) — an
-- estimate ("paper"), never a live curve quote.
--
-- Two heavy pieces here replay the trade tape in FIFO order:
--   * realized side reads the existing realized_pnl_events_cache (already
--     FIFO-matched and refreshed by the indexer on every sell).
--   * open_positions() replays buys/sells up to an as-of point and returns the
--     leftover (unsold) lots — the cost basis of what each wallet still holds.

-- ---------------------------------------------------------------------------
-- open_positions(as_of): unsold FIFO lots per wallet:belief:side as of a time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_positions(as_of timestamptz)
RETURNS TABLE(
  wallet_address text,
  belief_id integer,
  side text,
  tokens_open numeric,   -- token base units (1e18) still held
  cost_eth_open numeric, -- wei paid for the still-held tokens (FIFO)
  cost_usd_open numeric
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
  unit_cost_usd numeric;
  unit_cost_eth numeric;
  positions_map jsonb := '{}'::jsonb;
  kv RECORD;
  sum_tw numeric;
  sum_cu numeric;
  sum_ce numeric;
  j int;
BEGIN
  FOR r IN
    SELECT
      t.wallet_address, t.belief_id, t.side, t.action, t.block_timestamp,
      t.log_index, t.tokens_delta,
      COALESCE(t.gross_amount_usd, 0) AS gross_usd,
      COALESCE(t.gross_amount_native::numeric, 0) AS gross_native
    FROM public.trades t
    WHERE t.is_canonical = TRUE
      AND t.tokens_delta IS NOT NULL AND t.tokens_delta > 0
      AND t.action IN ('buy','sell')
      AND t.side IN ('yes','no')
      AND (as_of IS NULL OR t.block_timestamp <= as_of)
    ORDER BY t.block_timestamp, t.log_index
  LOOP
    k := r.wallet_address || ':' || r.belief_id || ':' || r.side;
    lots := COALESCE(positions_map -> k, '[]'::jsonb);

    IF r.action = 'buy' THEN
      lots := lots || jsonb_build_array(jsonb_build_object(
        'tw', r.tokens_delta::text,
        'cu', r.gross_usd::text,
        'ce', r.gross_native::text
      ));
      positions_map := jsonb_set(positions_map, ARRAY[k], lots, true);
      CONTINUE;
    END IF;

    -- SELL: consume FIFO, keep the remainder.
    remaining := r.tokens_delta;
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
      IF lot_tw <= remaining THEN
        remaining := remaining - lot_tw;  -- lot fully consumed; drop it
      ELSE
        consumed := remaining;
        unit_cost_usd := lot_cu / lot_tw;
        unit_cost_eth := lot_ce / lot_tw;
        remaining := 0;
        new_lots := new_lots || jsonb_build_array(jsonb_build_object(
          'tw', (lot_tw - consumed)::text,
          'cu', (lot_cu - unit_cost_usd * consumed)::text,
          'ce', (lot_ce - unit_cost_eth * consumed)::text
        ));
      END IF;
    END LOOP;
    positions_map := jsonb_set(positions_map, ARRAY[k], new_lots, true);
  END LOOP;

  -- Emit the residual (still-held) lots, summed per position.
  FOR kv IN SELECT key, value FROM jsonb_each(positions_map) LOOP
    sum_tw := 0; sum_cu := 0; sum_ce := 0;
    FOR j IN 0 .. GREATEST(jsonb_array_length(kv.value) - 1, -1) LOOP
      lot := kv.value -> j;
      IF lot IS NULL THEN CONTINUE; END IF;
      sum_tw := sum_tw + (lot->>'tw')::numeric;
      sum_cu := sum_cu + (lot->>'cu')::numeric;
      sum_ce := sum_ce + (lot->>'ce')::numeric;
    END LOOP;
    IF sum_tw > 0 THEN
      wallet_address := split_part(kv.key, ':', 1);
      belief_id := split_part(kv.key, ':', 2)::integer;
      side := split_part(kv.key, ':', 3);
      tokens_open := sum_tw;
      cost_eth_open := sum_ce;
      cost_usd_open := sum_cu;
      RETURN NEXT;
    END IF;
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.open_positions(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_positions(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- belief_marks(as_of): last trade price per belief:side as of a time.
-- Price is expressed per token base unit so value = tokens_open * price.
--   eth_per_token = gross_native (wei) / tokens_delta (base units)
--   usd_per_token = gross_usd (USD)   / tokens_delta (base units)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.belief_marks(as_of timestamptz)
RETURNS TABLE(
  belief_id integer,
  side text,
  eth_per_token numeric,
  usd_per_token numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (t.belief_id, t.side)
    t.belief_id,
    t.side,
    CASE WHEN t.tokens_delta > 0
      THEN t.gross_amount_native::numeric / t.tokens_delta ELSE 0 END,
    CASE WHEN t.tokens_delta > 0 AND t.gross_amount_usd IS NOT NULL
      THEN t.gross_amount_usd / t.tokens_delta ELSE 0 END
  FROM public.trades t
  WHERE t.is_canonical = TRUE
    AND t.tokens_delta IS NOT NULL AND t.tokens_delta > 0
    AND t.action IN ('buy','sell')
    AND t.side IN ('yes','no')
    AND (as_of IS NULL OR t.block_timestamp <= as_of)
  ORDER BY t.belief_id, t.side, t.block_timestamp DESC, t.log_index DESC;
$$;

REVOKE ALL ON FUNCTION public.belief_marks(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.belief_marks(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- _outcomes_at(as_of): one row of cumulative trader outcomes as of a time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._outcomes_at(as_of timestamptz)
RETURNS TABLE(
  -- SOLD (realized), per wallet, cumulative
  sellers integer,
  realized_winners integer,
  realized_net_eth numeric,
  realized_net_usd numeric,
  -- HOLDING (unrealized / paper), per wallet, at last price
  holders integer,
  holder_winners integer,
  unrealized_eth numeric,
  unrealized_usd numeric,
  holding_value_eth numeric,
  holding_value_usd numeric,
  -- ALL-IN cash view
  money_in_eth numeric,
  money_in_usd numeric,
  money_out_eth numeric,
  money_out_usd numeric,
  net_eth numeric,
  net_usd numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH
  rev AS (  -- realized per wallet from the FIFO cache, cumulative <= as_of
    SELECT
      c.wallet_address,
      SUM(c.realized_eth) AS pnl_eth,
      SUM(c.realized_usd) AS pnl_usd
    FROM public.realized_pnl_events_cache c
    WHERE c.tokens_sold > 0
      AND (as_of IS NULL OR c.sell_ts <= as_of)
    GROUP BY c.wallet_address
  ),
  op AS (SELECT * FROM public.open_positions(as_of)),
  mk AS (SELECT * FROM public.belief_marks(as_of)),
  hold AS (  -- per wallet: current paper value & cost of still-held shares
    SELECT
      op.wallet_address,
      SUM(op.tokens_open * COALESCE(mk.eth_per_token, 0)) AS val_eth_wei,
      SUM(op.tokens_open * COALESCE(mk.usd_per_token, 0)) AS val_usd,
      SUM(op.cost_eth_open) AS cost_eth,
      SUM(op.cost_usd_open) AS cost_usd
    FROM op
    LEFT JOIN mk ON mk.belief_id = op.belief_id AND mk.side = op.side
    GROUP BY op.wallet_address
  ),
  flows AS (  -- gross cash in (buys) / out (sells), cumulative <= as_of
    SELECT
      COALESCE(SUM(t.gross_amount_native::numeric) FILTER (WHERE t.action = 'buy'), 0) AS in_wei,
      COALESCE(SUM(t.gross_amount_usd)             FILTER (WHERE t.action = 'buy'), 0) AS in_usd,
      COALESCE(SUM(t.gross_amount_native::numeric) FILTER (WHERE t.action = 'sell'), 0) AS out_wei,
      COALESCE(SUM(t.gross_amount_usd)             FILTER (WHERE t.action = 'sell'), 0) AS out_usd
    FROM public.trades t
    WHERE t.is_canonical = TRUE
      AND t.action IN ('buy','sell')
      AND (as_of IS NULL OR t.block_timestamp <= as_of)
  )
  SELECT
    (SELECT COUNT(*)::int FROM rev),
    (SELECT COUNT(*) FILTER (WHERE rev.pnl_eth > 0)::int FROM rev),
    (SELECT COALESCE(SUM(rev.pnl_eth), 0)::numeric / 1e18 FROM rev),
    (SELECT COALESCE(SUM(rev.pnl_usd), 0)::numeric FROM rev),
    (SELECT COUNT(*)::int FROM hold),
    (SELECT COUNT(*) FILTER (WHERE (hold.val_eth_wei - hold.cost_eth) > 0)::int FROM hold),
    (SELECT COALESCE(SUM(hold.val_eth_wei - hold.cost_eth), 0)::numeric / 1e18 FROM hold),
    (SELECT COALESCE(SUM(hold.val_usd - hold.cost_usd), 0)::numeric FROM hold),
    (SELECT COALESCE(SUM(hold.val_eth_wei), 0)::numeric / 1e18 FROM hold),
    (SELECT COALESCE(SUM(hold.val_usd), 0)::numeric FROM hold),
    (SELECT flows.in_wei / 1e18 FROM flows),
    (SELECT flows.in_usd FROM flows),
    (SELECT flows.out_wei / 1e18 FROM flows),
    (SELECT flows.out_usd FROM flows),
    (SELECT (flows.out_wei - flows.in_wei) / 1e18 FROM flows)
      + (SELECT COALESCE(SUM(hold.val_eth_wei), 0)::numeric / 1e18 FROM hold),
    (SELECT (flows.out_usd - flows.in_usd) FROM flows)
      + (SELECT COALESCE(SUM(hold.val_usd), 0)::numeric FROM hold);
END; $$;

REVOKE ALL ON FUNCTION public._outcomes_at(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._outcomes_at(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- trader_outcomes(range_key): two snapshots — 'now' and 'prev' (= now - window).
-- The caller diffs them to get the windowed delta. 'all' returns only 'now'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trader_outcomes(range_key text)
RETURNS TABLE(
  label text,
  sellers integer,
  realized_winners integer,
  realized_net_eth numeric,
  realized_net_usd numeric,
  holders integer,
  holder_winners integer,
  unrealized_eth numeric,
  unrealized_usd numeric,
  holding_value_eth numeric,
  holding_value_usd numeric,
  money_in_eth numeric,
  money_in_usd numeric,
  money_out_eth numeric,
  money_out_usd numeric,
  net_eth numeric,
  net_usd numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE cs timestamptz; ce timestamptz; wn interval;
BEGIN
  SELECT b.cur_start, b.cur_end, b.win INTO cs, ce, wn
  FROM public._pnl_range_bounds(range_key) b;

  RETURN QUERY SELECT 'now'::text, o.* FROM public._outcomes_at(now()) o;

  -- Windowed ranges get a baseline snapshot to diff against. cs = now - window.
  IF cs IS NOT NULL THEN
    RETURN QUERY SELECT 'prev'::text, o.* FROM public._outcomes_at(cs) o;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.trader_outcomes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trader_outcomes(text) TO service_role;
