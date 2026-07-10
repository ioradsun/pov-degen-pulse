# POV Pulse — Final Build Spec

> Consolidated spec for the actual stack: **TanStack Start on Cloudflare Workers + Supabase (Lovable Cloud)**. No viem indexer in this pass — tables get populated by an external writer (deferred). Everything below is the simplest correct implementation, with the best-practice traps closed.
>
> Order of operations: enable Cloud → run migrations 001–004 → deploy read routes → verify with `/api/public/health` → wire frontend in a follow-up pass.

---

## 1. Purpose & Non-Goals

**Purpose.** Ship a read-optimized data layer that answers three questions:

- What are users creating, buying, and selling right now? *(Live Feed)*
- How is POV performing across 1h / 24h / 7d / 30d? *(Headline metrics)*
- Which beliefs are igniting, trending, dominant, or cooling? *(Behavioral Grid + Lifecycle)*

**Non-goals for this pass:**

- No indexer, no belief-text hydrator, no price backfill (all require external Node process with viem)
- No wallet PnL, no creator retention, no chart series endpoint
- No frontend wiring — that's a follow-up turn
- No writes from the app — writes go through `service_role` from an external process

The migrations ship a system that runs correctly on empty tables. Endpoints return empty arrays until a writer populates rows.

---

## 2. Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  External writer         │        │  Frontend (TanStack)     │
│  (viem indexer, later)   │        │  Cloudflare Workers      │
│                          │        │                          │
│  Uses SUPABASE_SERVICE_KEY        │  Uses SUPABASE_ANON_KEY  │
└────────────┬─────────────┘        └─────────────┬────────────┘
             │                                    │
             │ writes                             │ reads via
             │ (bypasses RLS)                     │ /api/public/*
             ▼                                    ▼
        ┌────────────────────────────────────────────────┐
        │              Supabase Postgres                 │
        │                                                │
        │   Tables (6) → RLS + GRANTs                    │
        │   Views (2)  → public-safe                     │
        │   Functions  → SECURITY DEFINER + locked path  │
        │   pg_cron    → runs functions every 60s        │
        │   Realtime   → publications on 3 tables        │
        └────────────────────────────────────────────────┘

```

**Key stack constraints:**

- Cloudflare Workers can't hold long-lived connections → cron lives in Postgres via `pg_cron`
- No `SUPABASE_SERVICE_KEY` in Workers → cron uses `SECURITY DEFINER` functions
- API routes under `src/routes/api/public/*` bypass auth on the published site
- Frontend Supabase client uses `SUPABASE_ANON_KEY` — RLS is the security perimeter

---

## 3. Migration 001 — Schema, Grants, RLS

Six tables. Grants set explicitly. RLS on with SELECT policies mirroring grants. Writes only via `service_role` (which bypasses RLS by design).

```sql
-- ============================================
-- Migration 001: Core schema
-- ============================================

-- 1. beliefs
CREATE TABLE beliefs (
  belief_id             BIGINT       PRIMARY KEY,
  chain_id              INT          NOT NULL DEFAULT 8453,
  market_address        TEXT         NOT NULL,
  creator_address       TEXT         NOT NULL,
  title                 TEXT,                        -- nullable until hydrated
  raw_title_source      TEXT,                        -- 'event' | 'view_call' | 'metadata_event'
  is_ai_generated       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_block         BIGINT       NOT NULL,
  created_at            TIMESTAMPTZ  NOT NULL,
  creation_tx_hash      TEXT         NOT NULL,
  creation_log_index    INT          NOT NULL,
  hydration_attempts    INT          NOT NULL DEFAULT 0,
  hydrated_at           TIMESTAMPTZ,
  UNIQUE (chain_id, creation_tx_hash, creation_log_index)
);

CREATE INDEX idx_beliefs_created_at      ON beliefs(created_at DESC);
CREATE INDEX idx_beliefs_creator         ON beliefs(creator_address);
CREATE INDEX idx_beliefs_needs_hydration ON beliefs(belief_id)
  WHERE title IS NULL AND hydration_attempts < 10;

-- 2. trades
CREATE TABLE trades (
  event_id              TEXT         PRIMARY KEY,   -- chain_id:tx_hash:log_index
  chain_id              INT          NOT NULL DEFAULT 8453,
  tx_hash               TEXT         NOT NULL,
  log_index             INT          NOT NULL,
  block_number          BIGINT       NOT NULL,
  block_timestamp       TIMESTAMPTZ  NOT NULL,
  belief_id             BIGINT       NOT NULL REFERENCES beliefs(belief_id),
  wallet_address        TEXT         NOT NULL,
  action                TEXT         NOT NULL CHECK (action IN ('buy','sell')),
  side                  TEXT         NOT NULL CHECK (side   IN ('yes','no')),
  gross_amount_native   NUMERIC(78,0) NOT NULL,
  gross_amount_usd      NUMERIC(20,4),
  payment_token         TEXT         NOT NULL,
  payment_token_symbol  TEXT         NOT NULL,
  is_confirmed          BOOLEAN      NOT NULL DEFAULT TRUE,
  is_canonical          BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_trades_timestamp   ON trades(block_timestamp DESC);
CREATE INDEX idx_trades_belief_time ON trades(belief_id, block_timestamp DESC);
CREATE INDEX idx_trades_wallet_time ON trades(wallet_address, block_timestamp DESC);
CREATE INDEX idx_trades_large       ON trades(block_timestamp DESC)
  WHERE gross_amount_usd >= 500 AND is_canonical = TRUE;

-- 3. belief_stats (materialized per-belief metrics, refreshed by cron)
CREATE TABLE belief_stats (
  belief_id             BIGINT       PRIMARY KEY REFERENCES beliefs(belief_id),
  computed_at           TIMESTAMPTZ  NOT NULL,
  buy_volume_1h_usd     NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_volume_24h_usd    NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_volume_7d_usd     NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_volume_30d_usd    NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_velocity_15m      NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_velocity_baseline NUMERIC(20,4) NOT NULL DEFAULT 0,
  ignition_score        NUMERIC(10,4),
  split_pct             NUMERIC(6,4),
  momentum              NUMERIC(10,4),            -- NULL in V1
  whale_activity_pct    NUMERIC(6,4),
  distribution_gini     NUMERIC(6,4),             -- NULL in V1
  delta_conviction_1h   NUMERIC(6,4),             -- NULL in V1
  lifecycle_stage       TEXT         NOT NULL DEFAULT 'new'
    CHECK (lifecycle_stage IN ('new','igniting','trending','dominant','cooling','archived')),
  lifecycle_since       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  unique_wallets_24h    INT          NOT NULL DEFAULT 0
);

CREATE INDEX idx_stats_lifecycle  ON belief_stats(lifecycle_stage);
CREATE INDEX idx_stats_ignition   ON belief_stats(ignition_score DESC NULLS LAST);
CREATE INDEX idx_stats_volume_24h ON belief_stats(buy_volume_24h_usd DESC);

-- 4. wallets
CREATE TABLE wallets (
  wallet_address        TEXT          PRIMARY KEY,
  first_seen_at         TIMESTAMPTZ   NOT NULL,
  last_seen_at          TIMESTAMPTZ   NOT NULL,
  total_volume_usd      NUMERIC(20,4) NOT NULL DEFAULT 0,
  trade_count           INT           NOT NULL DEFAULT 0,
  unique_beliefs_traded INT           NOT NULL DEFAULT 0,
  tier                  TEXT          NOT NULL DEFAULT 'ant'
    CHECK (tier IN ('whale','mid','ant')),
  realized_pnl_usd      NUMERIC(20,4)                        -- V1.1
);

-- 5. creators
CREATE TABLE creators (
  creator_address       TEXT          PRIMARY KEY,
  first_market_at       TIMESTAMPTZ   NOT NULL,
  markets_created       INT           NOT NULL DEFAULT 0,
  total_earned_usd      NUMERIC(20,4) NOT NULL DEFAULT 0,
  avg_market_volume_usd NUMERIC(20,4) NOT NULL DEFAULT 0,
  quality_score         NUMERIC(6,4),
  retention_rate        NUMERIC(6,4)                         -- V1.1
);

-- 6. price_ticks
CREATE TABLE price_ticks (
  token             TEXT           NOT NULL,
  block_timestamp   TIMESTAMPTZ    NOT NULL,
  usd_price         NUMERIC(20,10) NOT NULL,
  source            TEXT           NOT NULL,
  PRIMARY KEY (token, block_timestamp)
);

CREATE INDEX idx_price_lookup ON price_ticks(token, block_timestamp DESC);

-- ============================================
-- RLS: enable on all tables
-- ============================================

ALTER TABLE beliefs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE belief_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE creators     ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_ticks  ENABLE ROW LEVEL SECURITY;

-- Public-read tables
CREATE POLICY "beliefs_read"      ON beliefs      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "trades_read"       ON trades       FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "belief_stats_read" ON belief_stats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "creators_read"     ON creators     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "price_ticks_read"  ON price_ticks  FOR SELECT TO anon, authenticated USING (true);

-- Wallet PnL kept behind auth wall
CREATE POLICY "wallets_read_authed" ON wallets FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies. All writes must use service_role,
-- which bypasses RLS by design. No writes possible from the frontend.

-- ============================================
-- GRANTs (RLS + GRANT are both required by Supabase)
-- ============================================

GRANT SELECT ON beliefs, trades, belief_stats, creators, price_ticks TO anon, authenticated;
GRANT SELECT ON wallets TO authenticated;
GRANT ALL    ON ALL TABLES IN SCHEMA public TO service_role;

```

---

## 4. Migration 002 — Views + Realtime Publication

```sql
-- ============================================
-- Migration 002: Views + Realtime
-- ============================================

-- Unified live feed. WHERE title IS NOT NULL is load-bearing:
-- it makes the `Belief #638` bug structurally impossible.
CREATE OR REPLACE VIEW live_activity_events AS
SELECT
  CONCAT(chain_id::TEXT, ':', creation_tx_hash, ':', creation_log_index) AS event_id,
  chain_id,
  creation_tx_hash    AS tx_hash,
  creation_log_index  AS log_index,
  created_block       AS block_number,
  created_at          AS event_timestamp,
  'new_belief'        AS event_type,
  NULL::TEXT          AS action,
  NULL::TEXT          AS side,
  belief_id,
  title               AS belief_text,
  creator_address     AS wallet_address,
  NULL::NUMERIC       AS amount_usd,
  NULL::TEXT          AS payment_token_symbol,
  TRUE                AS is_confirmed,
  TRUE                AS is_canonical
FROM beliefs
WHERE title IS NOT NULL

UNION ALL

SELECT
  t.event_id,
  t.chain_id,
  t.tx_hash,
  t.log_index,
  t.block_number,
  t.block_timestamp AS event_timestamp,
  CASE
    WHEN t.action = 'buy'  AND t.side = 'yes' THEN 'yes_buy'
    WHEN t.action = 'buy'  AND t.side = 'no'  THEN 'no_buy'
    WHEN t.action = 'sell' AND t.side = 'yes' THEN 'yes_sell'
    WHEN t.action = 'sell' AND t.side = 'no'  THEN 'no_sell'
  END AS event_type,
  t.action, t.side,
  t.belief_id,
  b.title AS belief_text,
  t.wallet_address,
  t.gross_amount_usd AS amount_usd,
  t.payment_token_symbol,
  t.is_confirmed,
  t.is_canonical
FROM trades t
JOIN beliefs b ON b.belief_id = t.belief_id
WHERE t.is_canonical = TRUE
  AND b.title IS NOT NULL;

COMMENT ON VIEW live_activity_events IS
  'Unified feed. Excludes beliefs with NULL title (un-hydrated) so the UI never renders "#638".
   If tables have rows but the feed is empty, run /api/public/health to check hydration.';

-- Behavioral grid: joined stats + belief metadata
CREATE OR REPLACE VIEW behavioral_grid AS
SELECT
  b.belief_id,
  b.title,
  b.creator_address,
  b.created_at,
  s.buy_volume_24h_usd,
  s.split_pct,
  s.ignition_score,
  s.momentum,
  s.whale_activity_pct,
  s.distribution_gini,
  s.delta_conviction_1h,
  s.lifecycle_stage,
  s.unique_wallets_24h,
  c.quality_score AS creator_quality
FROM beliefs b
JOIN belief_stats s ON s.belief_id = b.belief_id
LEFT JOIN creators c ON c.creator_address = b.creator_address
WHERE b.title IS NOT NULL
  AND s.lifecycle_stage != 'archived';

-- Views inherit table RLS. Explicit grants still needed.
GRANT SELECT ON live_activity_events, behavioral_grid TO anon, authenticated;

-- ============================================
-- Realtime publication (idempotent)
-- ============================================
-- Subscriptions connect fine without this, but never fire. Silent failure mode.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'trades'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'beliefs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.beliefs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'belief_stats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.belief_stats;
  END IF;
END $$;

```

---

## 5. Migration 003 — Functions

Every DEFINER function locks `search_path`. Without it, a shadowed table name in another schema can hijack definer privileges — standard Postgres foot-gun.

```sql
-- ============================================
-- Migration 003: Functions
-- ============================================

-- 5.1 Headline metrics: one function, four ranges
CREATE OR REPLACE FUNCTION public.headline_metrics(range_key TEXT)
RETURNS TABLE (
  buy_volume_usd       NUMERIC,
  active_traders       INT,
  new_beliefs          INT,
  creator_revenue_usd  NUMERIC,
  degen_allocation_usd NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH r AS (
    SELECT CASE range_key
      WHEN '1h'  THEN INTERVAL '1 hour'
      WHEN '24h' THEN INTERVAL '24 hours'
      WHEN '7d'  THEN INTERVAL '7 days'
      WHEN '30d' THEN INTERVAL '30 days'
      ELSE INTERVAL '24 hours'
    END AS window
  ),
  buys AS (
    SELECT
      COALESCE(SUM(gross_amount_usd), 0)::NUMERIC AS vol,
      COUNT(DISTINCT wallet_address)::INT        AS traders
    FROM trades, r
    WHERE action = 'buy'
      AND is_canonical = TRUE
      AND block_timestamp >= NOW() - r.window
  ),
  creates AS (
    SELECT COUNT(*)::INT AS n
    FROM beliefs, r
    WHERE title IS NOT NULL
      AND created_at >= NOW() - r.window
  )
  SELECT
    buys.vol,
    buys.traders,
    creates.n,
    (buys.vol * 0.10 * 0.3333)::NUMERIC AS creator_revenue_usd,
    (buys.vol * 0.10 * 0.50)::NUMERIC   AS degen_allocation_usd
  FROM buys, creates;
$$;

GRANT EXECUTE ON FUNCTION public.headline_metrics(TEXT) TO anon, authenticated;

-- 5.2 Refresh belief stats. Runs every 60s via pg_cron.
-- Guard clause skips the run past a size threshold so it never takes down prod
-- when the table grows. When you hit the guard, upgrade to incremental refresh.
CREATE OR REPLACE FUNCTION public.refresh_belief_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  belief_count INT;
BEGIN
  SELECT COUNT(*) INTO belief_count FROM beliefs WHERE title IS NOT NULL;

  -- Guard: naive full-scan is fine up to ~500 beliefs. Past that, this
  -- function becomes an incident. Skip loudly instead of crashing silently.
  IF belief_count > 500 THEN
    RAISE WARNING 'refresh_belief_stats skipped: % beliefs exceeds naive threshold. Upgrade to incremental refresh.', belief_count;
    RETURN;
  END IF;

  INSERT INTO belief_stats (
    belief_id, computed_at,
    buy_volume_1h_usd, buy_volume_24h_usd, buy_volume_7d_usd, buy_volume_30d_usd,
    buy_velocity_15m, buy_velocity_baseline,
    ignition_score, split_pct, whale_activity_pct,
    unique_wallets_24h,
    lifecycle_stage, lifecycle_since
  )
  SELECT
    b.belief_id,
    NOW(),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '1 hour'),   0),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '7 days'),   0),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '30 days'),  0),
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '15 min'),   0) / 15.0,
    COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '4 hours'),  0) / 240.0,
    -- Ignition = 15m velocity / 4h baseline, NULL when baseline is 0
    CASE
      WHEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '4 hours'), 0) > 0
      THEN (COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '15 min'), 0) / 15.0)
         / (COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '4 hours'), 0) / 240.0)
      ELSE NULL
    END,
    -- Split = YES $ / total $
    CASE
      WHEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy'), 0) > 0
      THEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.side='yes'), 0)
         / COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy'), 0)
      ELSE NULL
    END,
    -- Whale activity = % of $ from >=$500 buys in last 24h
    CASE
      WHEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0) > 0
      THEN COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.gross_amount_usd >= 500 AND t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0)
         / COALESCE(SUM(t.gross_amount_usd) FILTER (WHERE t.action='buy' AND t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0)
      ELSE NULL
    END,
    COALESCE(COUNT(DISTINCT t.wallet_address) FILTER (WHERE t.block_timestamp >= NOW() - INTERVAL '24 hours'), 0)::INT,
    'new',
    NOW()
  FROM beliefs b
  LEFT JOIN trades t
    ON t.belief_id = b.belief_id
    AND t.is_canonical = TRUE
    AND t.block_timestamp >= NOW() - INTERVAL '30 days'
  WHERE b.title IS NOT NULL
  GROUP BY b.belief_id
  ON CONFLICT (belief_id) DO UPDATE SET
    computed_at            = EXCLUDED.computed_at,
    buy_volume_1h_usd      = EXCLUDED.buy_volume_1h_usd,
    buy_volume_24h_usd     = EXCLUDED.buy_volume_24h_usd,
    buy_volume_7d_usd      = EXCLUDED.buy_volume_7d_usd,
    buy_volume_30d_usd     = EXCLUDED.buy_volume_30d_usd,
    buy_velocity_15m       = EXCLUDED.buy_velocity_15m,
    buy_velocity_baseline  = EXCLUDED.buy_velocity_baseline,
    ignition_score         = EXCLUDED.ignition_score,
    split_pct              = EXCLUDED.split_pct,
    whale_activity_pct     = EXCLUDED.whale_activity_pct,
    unique_wallets_24h     = EXCLUDED.unique_wallets_24h;
    -- momentum, gini, delta_conviction stay NULL in V1 (deferred to worker in V1.1)
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_belief_stats() TO service_role;

-- 5.3 Lifecycle state machine, priority order matters
CREATE OR REPLACE FUNCTION public.update_lifecycle_stages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  top_20_threshold NUMERIC;
  top_10_threshold NUMERIC;
BEGIN
  -- Compute thresholds once
  SELECT COALESCE(PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY buy_volume_24h_usd), 0)
    INTO top_20_threshold FROM belief_stats;
  SELECT COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY buy_volume_24h_usd), 0)
    INTO top_10_threshold FROM belief_stats;

  -- Apply in priority order. Last matching stage wins because we UPDATE in sequence.
  -- Order: archived → cooling → new → trending → dominant → igniting (final wins)

  -- archived: no volume, no trade in 72h
  UPDATE belief_stats s SET lifecycle_stage = 'archived', lifecycle_since = NOW()
  FROM beliefs b
  WHERE s.belief_id = b.belief_id
    AND s.buy_volume_24h_usd = 0
    AND NOT EXISTS (
      SELECT 1 FROM trades t
      WHERE t.belief_id = s.belief_id
        AND t.block_timestamp >= NOW() - INTERVAL '72 hours'
    )
    AND s.lifecycle_stage != 'archived';

  -- new: <2h old, <10 wallets
  UPDATE belief_stats s SET lifecycle_stage = 'new', lifecycle_since = NOW()
  FROM beliefs b
  WHERE s.belief_id = b.belief_id
    AND b.created_at >= NOW() - INTERVAL '2 hours'
    AND s.unique_wallets_24h < 10
    AND s.lifecycle_stage != 'new';

  -- cooling: velocity dropped below 40% of baseline
  UPDATE belief_stats SET lifecycle_stage = 'cooling', lifecycle_since = NOW()
  WHERE buy_velocity_baseline > 0
    AND buy_velocity_15m < buy_velocity_baseline * 0.4
    AND lifecycle_stage NOT IN ('cooling','archived');

  -- trending: top 20 by 24h volume
  UPDATE belief_stats SET lifecycle_stage = 'trending', lifecycle_since = NOW()
  WHERE buy_volume_24h_usd >= top_20_threshold
    AND buy_volume_24h_usd > 0
    AND lifecycle_stage NOT IN ('trending','dominant','igniting');

  -- dominant: >7d old, top 10, split has stabilized (>15pp off center)
  UPDATE belief_stats s SET lifecycle_stage = 'dominant', lifecycle_since = NOW()
  FROM beliefs b
  WHERE s.belief_id = b.belief_id
    AND b.created_at < NOW() - INTERVAL '7 days'
    AND s.buy_volume_24h_usd >= top_10_threshold
    AND ABS(s.split_pct - 0.5) > 0.15
    AND s.lifecycle_stage NOT IN ('dominant','igniting');

  -- igniting: last, so it wins any tie. velocity >= 3x baseline
  UPDATE belief_stats SET lifecycle_stage = 'igniting', lifecycle_since = NOW()
  WHERE ignition_score >= 3
    AND lifecycle_stage != 'igniting';
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lifecycle_stages() TO service_role;

```

---

## 6. Migration 004 — pg_cron

Two gotchas closed: extension must be created, and jobs are verified to fail-loud if the tier doesn't support `pg_cron`.

```sql
-- ============================================
-- Migration 004: Scheduled jobs
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Refresh stats every 60s
SELECT cron.schedule(
  'refresh-belief-stats',
  '* * * * *',
  $$SELECT public.refresh_belief_stats();$$
);

-- Update lifecycle every 60s (runs after stats in the same minute is fine — 
-- the guard skips on scale, and stage updates are idempotent)
SELECT cron.schedule(
  'update-lifecycle-stages',
  '* * * * *',
  $$SELECT public.update_lifecycle_stages();$$
);

-- Verify: if pg_cron isn't actually available on this project's tier,
-- schedule() silently succeeds but jobs never run. Fail migration instead.
DO $$
DECLARE
  job_count INT;
BEGIN
  SELECT COUNT(*) INTO job_count FROM cron.job
  WHERE jobname IN ('refresh-belief-stats', 'update-lifecycle-stages');
  IF job_count < 2 THEN
    RAISE EXCEPTION 'pg_cron jobs not registered. Confirm pg_cron is enabled for this Supabase project.';
  END IF;
END $$;

```

---

## 7. API Routes

Four read endpoints. All under `/api/public/*` so they bypass Cloudflare auth on the published site. All use the anon key. All validate params with Zod enums (not regex strings) so bad input fails loud at the boundary.

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!  // never the service key in Workers
);

// src/lib/schemas.ts
import { z } from 'zod';
export const RangeSchema = z.enum(['1h', '24h', '7d', '30d']);
export const SortSchema  = z.enum([
  'ignition', 'volume_24h', 'momentum', 'whale', 'split', 'delta_conviction'
]);

```

### 7.1 `GET /api/public/feed`

```typescript
// src/routes/api/public/feed.ts
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { z } from 'zod';
import { supabase } from '~/lib/supabase';

const QuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(250).default(100),
  cursor: z.string().optional(),           // "timestamp:event_id"
  large:  z.enum(['true', 'false']).optional(),
});

export const APIRoute = createAPIFileRoute('/api/public/feed')({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const { limit, cursor, large } = parsed.data;

    let query = supabase
      .from('live_activity_events')
      .select('*')
      .order('event_timestamp', { ascending: false })
      .order('event_id',        { ascending: false })
      .limit(limit);

    if (cursor) {
      const [ts, eventId] = cursor.split(':');
      query = query.or(
        `event_timestamp.lt.${ts},and(event_timestamp.eq.${ts},event_id.lt.${eventId})`
      );
    }

    if (large === 'true') {
      query = query.gte('amount_usd', 500);
    }

    const { data, error } = await query;
    if (error) return new Response(JSON.stringify({ error }), { status: 500 });

    const last = data?.[data.length - 1];
    const nextCursor = last
      ? `${last.event_timestamp}:${last.event_id}`
      : null;

    return Response.json({ events: data ?? [], nextCursor });
  },
});

```

### 7.2 `GET /api/public/headline`

```typescript
// src/routes/api/public/headline.ts
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { RangeSchema } from '~/lib/schemas';
import { supabase } from '~/lib/supabase';

export const APIRoute = createAPIFileRoute('/api/public/headline')({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const parsed = RangeSchema.safeParse(url.searchParams.get('range') ?? '24h');
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'invalid range' }), { status: 400 });
    }

    const { data, error } = await supabase.rpc('headline_metrics', { range_key: parsed.data });
    if (error) return new Response(JSON.stringify({ error }), { status: 500 });

    return Response.json({
      range: parsed.data,
      ...data?.[0],
      computedAt: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30' },  // 30s edge cache
    });
  },
});

```

### 7.3 `GET /api/public/grid`

```typescript
// src/routes/api/public/grid.ts
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { z } from 'zod';
import { SortSchema } from '~/lib/schemas';
import { supabase } from '~/lib/supabase';

const SORT_COLUMN: Record<z.infer<typeof SortSchema>, string> = {
  ignition:         'ignition_score',
  volume_24h:       'buy_volume_24h_usd',
  momentum:         'momentum',
  whale:            'whale_activity_pct',
  split:            'split_pct',
  delta_conviction: 'delta_conviction_1h',
};

const QuerySchema = z.object({
  sort:  SortSchema.default('ignition'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const APIRoute = createAPIFileRoute('/api/public/grid')({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { data, error } = await supabase
      .from('behavioral_grid')
      .select('*')
      .order(SORT_COLUMN[parsed.data.sort], { ascending: false, nullsFirst: false })
      .limit(parsed.data.limit);

    if (error) return new Response(JSON.stringify({ error }), { status: 500 });
    return Response.json({ rows: data ?? [] });
  },
});

```

### 7.4 `GET /api/public/belief/$id`

```typescript
// src/routes/api/public/belief.$id.ts
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { z } from 'zod';
import { supabase } from '~/lib/supabase';

export const APIRoute = createAPIFileRoute('/api/public/belief/$id')({
  GET: async ({ params }) => {
    const id = z.coerce.number().int().positive().safeParse(params.id);
    if (!id.success) {
      return new Response(JSON.stringify({ error: 'invalid id' }), { status: 400 });
    }

    const [belief, stats, recentTrades] = await Promise.all([
      supabase.from('beliefs').select('*').eq('belief_id', id.data).single(),
      supabase.from('belief_stats').select('*').eq('belief_id', id.data).single(),
      supabase.from('trades').select('*')
        .eq('belief_id', id.data)
        .eq('is_canonical', true)
        .order('block_timestamp', { ascending: false })
        .limit(20),
    ]);

    if (belief.error || !belief.data)      return new Response('not found', { status: 404 });
    if (!belief.data.title)                return new Response('not hydrated', { status: 425 });

    return Response.json({
      belief:       belief.data,
      stats:        stats.data,
      recentTrades: recentTrades.data ?? [],
    });
  },
});

```

### 7.5 `GET /api/public/health` — operational visibility

The one that saves an afternoon of "why is the feed empty" debugging.

```typescript
// src/routes/api/public/health.ts
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { supabase } from '~/lib/supabase';

export const APIRoute = createAPIFileRoute('/api/public/health')({
  GET: async () => {
    const [total, hydrated, latestTrade, latestStats] = await Promise.all([
      supabase.from('beliefs').select('*', { count: 'exact', head: true }),
      supabase.from('beliefs').select('*', { count: 'exact', head: true })
        .not('title', 'is', null),
      supabase.from('trades').select('block_timestamp')
        .order('block_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('belief_stats').select('computed_at')
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const beliefs_total = total.count ?? 0;
    const beliefs_hydrated = hydrated.count ?? 0;
    const latest = latestTrade.data?.block_timestamp;

    return Response.json({
      beliefs_total,
      beliefs_hydrated,
      beliefs_pending_hydration: beliefs_total - beliefs_hydrated,
      latest_trade_at: latest ?? null,
      seconds_since_last_trade: latest
        ? Math.floor((Date.now() - new Date(latest).getTime()) / 1000)
        : null,
      last_stats_refresh: latestStats.data?.computed_at ?? null,
      writer_status: beliefs_total === 0 ? 'no writer connected' : 'ok',
    });
  },
});

```

---

## 8. Frontend Wiring (deferred, mapped here)

Not built in this pass. Swap targets:


| Current                                | Becomes                                | Data source                                                   |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `src/hooks/pov/useActivity.ts`         | `useLiveFeed()`                        | `/api/public/feed` + Supabase Realtime on `trades`, `beliefs` |
| `src/components/pulse/LiveFeed.tsx`    | Consumes `useLiveFeed`                 | Same                                                          |
| `src/components/pulse/StatGrid.tsx`    | Reads headline API behind feature flag | `/api/public/headline?range=24h`                              |
| `src/components/pulse/BeliefBoard.tsx` | Reads grid API behind feature flag     | `/api/public/grid`                                            |


Client-side RPC hooks stay wired as the fallback until an external writer is producing rows. Feature flag pattern lets you flip surfaces one at a time.

**Rendering rules for the frontend when it lands:**

- Any `momentum`, `distribution_gini`, or `delta_conviction_1h` column: render `—` for NULL, never `0`. They're deferred, not zero.
- `writer_status: 'no writer connected'` from `/api/public/health`: show a dev-only banner. Users never see it.

---

## 9. What's NOT in This Build (explicit)


| Feature                                                | Why                                                  | Owner for later                     |
| ------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------- |
| Viem indexer                                           | Needs long-lived Node process; Workers can't hold it | External deployment (Fly / Railway) |
| Belief text hydrator                                   | Needs `viem.readContract`                            | Same external process               |
| Price backfill (Coingecko/Chainlink)                   | Needs HTTP calls from a worker                       | Same                                |
| `momentum`, `distribution_gini`, `delta_conviction_1h` | Compute cleanly in application code, not SQL         | Node worker in V1.1                 |
| Wallet PnL / creator retention                         | Needs resolved-market data we don't have             | V1.1                                |
| Chart series endpoint                                  | Needs meaningful trade history first                 | V1.1                                |
| Frontend wiring / realtime subscription                | Wait for tables to have rows                         | Next turn                           |
| Reorg invalidation                                     | Base reorgs vanishingly rare                         | If ever needed                      |


---

## 10. Sequence

1. Enable Lovable Cloud on this project.
2. Run **Migration 001** (schema + RLS + grants). Verify with: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';` — every table should show `rowsecurity = true`.
3. Run **Migration 002** (views + realtime publication). Verify with: `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` — should list `trades`, `beliefs`, `belief_stats`.
4. Run **Migration 003** (functions). Verify with: `SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace;` — should list all three functions.
5. Run **Migration 004** (pg_cron). Migration will `RAISE EXCEPTION` if jobs didn't register.
6. Deploy the 5 API routes.
7. Hit `/api/public/health` — expect `beliefs_total: 0, writer_status: "no writer connected"`. That's the correct empty state.
8. Stop. Confirm before touching frontend hooks, wiring realtime, or building the external writer.

---

## 11. Definition of Done (this build)

1. All 6 tables exist with correct RLS and grants.
2. Both views exist and are `SELECT`-able as `anon`.
3. All three functions exist with `SECURITY DEFINER` + locked `search_path`.
4. Both cron jobs registered and visible in `cron.job`.
5. All 5 API endpoints return valid JSON (empty arrays are valid).
6. `/api/public/health` reports accurate counts on empty tables.
7. Realtime publication includes `trades`, `beliefs`, `belief_stats`.
8. No writes possible from `anon` or `authenticated` via API or Realtime (verify by attempting an INSERT from a client using anon key — should fail with RLS error).

Anything past this list is out of scope for this pass.

---

The above is 5 migrations + 5 API files. Two afternoons of work for someone who knows the stack. Everything harder is deferred, everything correctness-critical is closed. Ship this, then plug in a writer, then wire the frontend.