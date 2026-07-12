-- Wallet performance-over-time: save searched wallets, snapshot their P&L
-- daily, and serve the timeline for the wallet page chart.

CREATE TABLE IF NOT EXISTS public.wallet_watch (
  wallet_address text PRIMARY KEY,
  first_searched_at timestamptz NOT NULL DEFAULT now(),
  last_searched_at  timestamptz NOT NULL DEFAULT now(),
  search_count int NOT NULL DEFAULT 1,
  backfilled_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.wallet_pnl_snapshot (
  wallet_address text NOT NULL,
  snapshot_date date NOT NULL,
  deposited_eth numeric NOT NULL DEFAULT 0,
  withdrawn_eth numeric NOT NULL DEFAULT 0,
  realized_eth numeric NOT NULL DEFAULT 0,
  holding_value_eth numeric NOT NULL DEFAULT 0,
  unrealized_eth numeric NOT NULL DEFAULT 0,
  net_eth numeric NOT NULL DEFAULT 0,
  positions int NOT NULL DEFAULT 0,
  PRIMARY KEY (wallet_address, snapshot_date)
);

ALTER TABLE public.wallet_watch        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_pnl_snapshot ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.wallet_snapshot_now(addr text)
RETURNS TABLE(
  deposited_eth numeric, withdrawn_eth numeric, realized_eth numeric,
  holding_value_eth numeric, unrealized_eth numeric, net_eth numeric, positions int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT
    COALESCE(SUM(p.in_eth),0),
    COALESCE(SUM(p.out_eth),0),
    COALESCE(SUM(p.realized_eth),0),
    COALESCE(SUM(p.hold_value_eth),0),
    COALESCE(SUM(p.unrealized_eth),0),
    COALESCE(SUM(p.out_eth),0) + COALESCE(SUM(p.hold_value_eth),0) - COALESCE(SUM(p.in_eth),0),
    COUNT(*)::int
  FROM public.wallet_positions(addr) p;
$$;

CREATE OR REPLACE FUNCTION public.wallet_backfill_snapshots(addr text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE a text := lower(addr); tz text := 'America/New_York'; first_ts timestamptz;
BEGIN
  SELECT min(block_timestamp) INTO first_ts
  FROM public.trades
  WHERE lower(wallet_address) = a AND is_canonical = TRUE AND action IN ('buy','sell');

  IF first_ts IS NOT NULL THEN
    INSERT INTO public.wallet_pnl_snapshot
      (wallet_address, snapshot_date, deposited_eth, withdrawn_eth, realized_eth,
       holding_value_eth, unrealized_eth, net_eth, positions)
    WITH cut AS (
      SELECT d::date AS snap_date, ((d + interval '1 day') AT TIME ZONE tz) AS t_end
      FROM generate_series(
        date_trunc('day', first_ts AT TIME ZONE tz),
        date_trunc('day', now() AT TIME ZONE tz),
        interval '1 day'
      ) AS d
    ),
    per_day AS (
      SELECT c.snap_date, c.t_end, t.belief_id, t.side,
        SUM(CASE WHEN t.action='buy'  THEN t.tokens_delta::numeric        ELSE 0 END) AS bought_tk,
        SUM(CASE WHEN t.action='sell' THEN t.tokens_delta::numeric        ELSE 0 END) AS sold_tk,
        SUM(CASE WHEN t.action='buy'  THEN t.gross_amount_native::numeric ELSE 0 END) AS buy_wei,
        SUM(CASE WHEN t.action='sell' THEN t.gross_amount_native::numeric ELSE 0 END) AS sell_wei
      FROM cut c
      JOIN public.trades t
        ON t.is_canonical = TRUE AND t.action IN ('buy','sell') AND t.side IN ('yes','no')
       AND t.tokens_delta > 0 AND lower(t.wallet_address) = a
       AND t.block_timestamp <= c.t_end
      GROUP BY c.snap_date, c.t_end, t.belief_id, t.side
    ),
    ev_day AS (
      SELECT c.snap_date, e.belief_id, e.side,
        SUM(e.realized_eth) AS r_wei, SUM(e.cost_eth) AS cost_consumed_wei
      FROM cut c
      JOIN public.realized_pnl_events_cache e
        ON lower(e.wallet_address) = a AND e.sell_ts <= c.t_end
      GROUP BY c.snap_date, e.belief_id, e.side
    ),
    mark AS (
      SELECT pd.snap_date, pd.bought_tk, pd.buy_wei, pd.sell_wei,
        (pd.bought_tk - pd.sold_tk)              AS remaining_tk,
        COALESCE(ed.r_wei,0)                     AS r_wei,
        GREATEST(pd.buy_wei - COALESCE(ed.cost_consumed_wei,0),0) AS rem_cost_wei,
        (SELECT t2.gross_amount_native::numeric / NULLIF(t2.tokens_delta::numeric,0)
         FROM public.trades t2
         WHERE t2.is_canonical = TRUE AND t2.tokens_delta > 0 AND t2.action IN ('buy','sell')
           AND t2.belief_id = pd.belief_id AND t2.side = pd.side
           AND t2.block_timestamp <= pd.t_end
         ORDER BY t2.block_timestamp DESC, t2.log_index DESC
         LIMIT 1)                                AS px
      FROM per_day pd
      LEFT JOIN ev_day ed
        ON ed.snap_date = pd.snap_date AND ed.belief_id = pd.belief_id AND ed.side = pd.side
    )
    SELECT
      a,
      m.snap_date,
      (SUM(m.buy_wei)  / 1e18),
      (SUM(m.sell_wei) / 1e18),
      (SUM(m.r_wei)    / 1e18),
      (SUM(GREATEST(m.remaining_tk,0) * COALESCE(m.px,0)) / 1e18),
      ((SUM(GREATEST(m.remaining_tk,0) * COALESCE(m.px,0)) - SUM(m.rem_cost_wei)) / 1e18),
      ((SUM(m.sell_wei) + SUM(GREATEST(m.remaining_tk,0) * COALESCE(m.px,0)) - SUM(m.buy_wei)) / 1e18),
      COUNT(*) FILTER (WHERE m.bought_tk > 0)::int
    FROM mark m
    GROUP BY m.snap_date
    ON CONFLICT (wallet_address, snapshot_date) DO UPDATE SET
      deposited_eth = EXCLUDED.deposited_eth, withdrawn_eth = EXCLUDED.withdrawn_eth,
      realized_eth = EXCLUDED.realized_eth, holding_value_eth = EXCLUDED.holding_value_eth,
      unrealized_eth = EXCLUDED.unrealized_eth, net_eth = EXCLUDED.net_eth,
      positions = EXCLUDED.positions;
  END IF;

  UPDATE public.wallet_watch SET backfilled_at = now() WHERE wallet_address = a;
END; $$;

CREATE OR REPLACE FUNCTION public.wallet_snapshot_today(addr text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE a text := lower(addr);
BEGIN
  INSERT INTO public.wallet_pnl_snapshot
    (wallet_address, snapshot_date, deposited_eth, withdrawn_eth, realized_eth,
     holding_value_eth, unrealized_eth, net_eth, positions)
  SELECT a, (now() AT TIME ZONE 'America/New_York')::date, s.*
  FROM public.wallet_snapshot_now(a) s
  ON CONFLICT (wallet_address, snapshot_date) DO UPDATE SET
    deposited_eth = EXCLUDED.deposited_eth, withdrawn_eth = EXCLUDED.withdrawn_eth,
    realized_eth = EXCLUDED.realized_eth, holding_value_eth = EXCLUDED.holding_value_eth,
    unrealized_eth = EXCLUDED.unrealized_eth, net_eth = EXCLUDED.net_eth,
    positions = EXCLUDED.positions;
END; $$;

CREATE OR REPLACE FUNCTION public.wallet_register(addr text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE a text := lower(addr); needs_backfill boolean;
BEGIN
  IF a !~ '^0x[0-9a-f]{40}$' THEN RETURN; END IF;

  INSERT INTO public.wallet_watch (wallet_address) VALUES (a)
  ON CONFLICT (wallet_address) DO UPDATE
    SET last_searched_at = now(), search_count = public.wallet_watch.search_count + 1;

  SELECT (backfilled_at IS NULL) INTO needs_backfill
  FROM public.wallet_watch WHERE wallet_address = a;

  IF needs_backfill THEN
    PERFORM public.wallet_backfill_snapshots(a);
  END IF;
  PERFORM public.wallet_snapshot_today(a);
END; $$;

CREATE OR REPLACE FUNCTION public.snapshot_watched_wallets()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE w record;
BEGIN
  FOR w IN
    SELECT wallet_address FROM public.wallet_watch
    WHERE last_searched_at > now() - interval '30 days'
  LOOP
    PERFORM public.wallet_snapshot_today(w.wallet_address);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.wallet_timeline(addr text)
RETURNS TABLE(
  snapshot_date date, deposited_eth numeric, withdrawn_eth numeric, realized_eth numeric,
  holding_value_eth numeric, unrealized_eth numeric, net_eth numeric, positions int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT snapshot_date, deposited_eth, withdrawn_eth, realized_eth,
         holding_value_eth, unrealized_eth, net_eth, positions
  FROM public.wallet_pnl_snapshot
  WHERE wallet_address = lower(addr)
  ORDER BY snapshot_date;
$$;

REVOKE ALL ON FUNCTION public.wallet_snapshot_now(text)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_backfill_snapshots(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_snapshot_today(text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_register(text)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.snapshot_watched_wallets()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_timeline(text)           FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_register(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wallet_timeline(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wallet_snapshot_now(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_backfill_snapshots(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_snapshot_today(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_watched_wallets() TO service_role;

SELECT cron.schedule('daily-wallet-snapshots', '0 6 * * *',
  $$SELECT public.snapshot_watched_wallets();$$);