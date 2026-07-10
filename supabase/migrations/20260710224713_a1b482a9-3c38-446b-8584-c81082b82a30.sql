
-- Migration 001: Core schema, RLS, grants

CREATE TABLE public.beliefs (
  belief_id             BIGINT       PRIMARY KEY,
  chain_id              INT          NOT NULL DEFAULT 8453,
  market_address        TEXT         NOT NULL,
  creator_address       TEXT         NOT NULL,
  title                 TEXT,
  raw_title_source      TEXT,
  is_ai_generated       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_block         BIGINT       NOT NULL,
  created_at            TIMESTAMPTZ  NOT NULL,
  creation_tx_hash      TEXT         NOT NULL,
  creation_log_index    INT          NOT NULL,
  hydration_attempts    INT          NOT NULL DEFAULT 0,
  hydrated_at           TIMESTAMPTZ,
  UNIQUE (chain_id, creation_tx_hash, creation_log_index)
);
CREATE INDEX idx_beliefs_created_at      ON public.beliefs(created_at DESC);
CREATE INDEX idx_beliefs_creator         ON public.beliefs(creator_address);
CREATE INDEX idx_beliefs_needs_hydration ON public.beliefs(belief_id)
  WHERE title IS NULL AND hydration_attempts < 10;

GRANT SELECT ON public.beliefs TO anon, authenticated;
GRANT ALL ON public.beliefs TO service_role;
ALTER TABLE public.beliefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "beliefs_read" ON public.beliefs FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.trades (
  event_id              TEXT         PRIMARY KEY,
  chain_id              INT          NOT NULL DEFAULT 8453,
  tx_hash               TEXT         NOT NULL,
  log_index             INT          NOT NULL,
  block_number          BIGINT       NOT NULL,
  block_timestamp       TIMESTAMPTZ  NOT NULL,
  belief_id             BIGINT       NOT NULL REFERENCES public.beliefs(belief_id),
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
CREATE INDEX idx_trades_timestamp   ON public.trades(block_timestamp DESC);
CREATE INDEX idx_trades_belief_time ON public.trades(belief_id, block_timestamp DESC);
CREATE INDEX idx_trades_wallet_time ON public.trades(wallet_address, block_timestamp DESC);
CREATE INDEX idx_trades_large       ON public.trades(block_timestamp DESC)
  WHERE gross_amount_usd >= 500 AND is_canonical = TRUE;

GRANT SELECT ON public.trades TO anon, authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades_read" ON public.trades FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.belief_stats (
  belief_id             BIGINT       PRIMARY KEY REFERENCES public.beliefs(belief_id),
  computed_at           TIMESTAMPTZ  NOT NULL,
  buy_volume_1h_usd     NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_volume_24h_usd    NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_volume_7d_usd     NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_volume_30d_usd    NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_velocity_15m      NUMERIC(20,4) NOT NULL DEFAULT 0,
  buy_velocity_baseline NUMERIC(20,4) NOT NULL DEFAULT 0,
  ignition_score        NUMERIC(10,4),
  split_pct             NUMERIC(6,4),
  momentum              NUMERIC(10,4),
  whale_activity_pct    NUMERIC(6,4),
  distribution_gini     NUMERIC(6,4),
  delta_conviction_1h   NUMERIC(6,4),
  lifecycle_stage       TEXT         NOT NULL DEFAULT 'new'
    CHECK (lifecycle_stage IN ('new','igniting','trending','dominant','cooling','archived')),
  lifecycle_since       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  unique_wallets_24h    INT          NOT NULL DEFAULT 0
);
CREATE INDEX idx_stats_lifecycle  ON public.belief_stats(lifecycle_stage);
CREATE INDEX idx_stats_ignition   ON public.belief_stats(ignition_score DESC NULLS LAST);
CREATE INDEX idx_stats_volume_24h ON public.belief_stats(buy_volume_24h_usd DESC);

GRANT SELECT ON public.belief_stats TO anon, authenticated;
GRANT ALL ON public.belief_stats TO service_role;
ALTER TABLE public.belief_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "belief_stats_read" ON public.belief_stats FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.wallets (
  wallet_address        TEXT          PRIMARY KEY,
  first_seen_at         TIMESTAMPTZ   NOT NULL,
  last_seen_at          TIMESTAMPTZ   NOT NULL,
  total_volume_usd      NUMERIC(20,4) NOT NULL DEFAULT 0,
  trade_count           INT           NOT NULL DEFAULT 0,
  unique_beliefs_traded INT           NOT NULL DEFAULT 0,
  tier                  TEXT          NOT NULL DEFAULT 'ant'
    CHECK (tier IN ('whale','mid','ant')),
  realized_pnl_usd      NUMERIC(20,4)
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_read_authed" ON public.wallets FOR SELECT TO authenticated USING (true);

CREATE TABLE public.creators (
  creator_address       TEXT          PRIMARY KEY,
  first_market_at       TIMESTAMPTZ   NOT NULL,
  markets_created       INT           NOT NULL DEFAULT 0,
  total_earned_usd      NUMERIC(20,4) NOT NULL DEFAULT 0,
  avg_market_volume_usd NUMERIC(20,4) NOT NULL DEFAULT 0,
  quality_score         NUMERIC(6,4),
  retention_rate        NUMERIC(6,4)
);

GRANT SELECT ON public.creators TO anon, authenticated;
GRANT ALL ON public.creators TO service_role;
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creators_read" ON public.creators FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.price_ticks (
  token             TEXT           NOT NULL,
  block_timestamp   TIMESTAMPTZ    NOT NULL,
  usd_price         NUMERIC(20,10) NOT NULL,
  source            TEXT           NOT NULL,
  PRIMARY KEY (token, block_timestamp)
);
CREATE INDEX idx_price_lookup ON public.price_ticks(token, block_timestamp DESC);

GRANT SELECT ON public.price_ticks TO anon, authenticated;
GRANT ALL ON public.price_ticks TO service_role;
ALTER TABLE public.price_ticks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_ticks_read" ON public.price_ticks FOR SELECT TO anon, authenticated USING (true);
