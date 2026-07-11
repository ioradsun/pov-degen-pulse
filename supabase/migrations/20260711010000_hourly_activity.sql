
-- Migration: hourly_activity() — per-hour POV buy volume / trade / belief
-- creation buckets, used by the dashboard's rhythm chart. Replaces the old
-- client-side RPC pipeline that derived these buckets from raw chain events
-- in the browser; this is the Supabase-backed source of truth instead.
CREATE OR REPLACE FUNCTION public.hourly_activity(hours_back INT DEFAULT 24)
RETURNS TABLE (
  hour           TIMESTAMPTZ,
  buy_volume_usd NUMERIC,
  buys           INT,
  sells          INT,
  created        INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH hours AS (
    SELECT date_trunc('hour', NOW()) - (n || ' hours')::interval AS hour
    FROM generate_series(0, GREATEST(hours_back, 1) - 1) AS n
  ),
  trade_agg AS (
    SELECT
      date_trunc('hour', block_timestamp) AS hour,
      COALESCE(SUM(gross_amount_usd) FILTER (WHERE action = 'buy'), 0) AS buy_volume_usd,
      COUNT(*) FILTER (WHERE action = 'buy')  AS buys,
      COUNT(*) FILTER (WHERE action = 'sell') AS sells
    FROM public.trades
    WHERE is_canonical = TRUE
      AND block_timestamp >= NOW() - (hours_back || ' hours')::interval
    GROUP BY 1
  ),
  belief_agg AS (
    SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS created
    FROM public.beliefs
    WHERE created_at >= NOW() - (hours_back || ' hours')::interval
    GROUP BY 1
  )
  SELECT
    h.hour,
    COALESCE(t.buy_volume_usd, 0),
    COALESCE(t.buys, 0)::INT,
    COALESCE(t.sells, 0)::INT,
    COALESCE(b.created, 0)::INT
  FROM hours h
  LEFT JOIN trade_agg  t ON t.hour = h.hour
  LEFT JOIN belief_agg b ON b.hour = h.hour
  ORDER BY h.hour;
$$;
GRANT EXECUTE ON FUNCTION public.hourly_activity(INT) TO anon, authenticated;
