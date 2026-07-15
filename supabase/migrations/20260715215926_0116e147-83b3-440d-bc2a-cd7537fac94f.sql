
CREATE INDEX IF NOT EXISTS idx_belief_stats_buy_vol_24h_desc ON public.belief_stats (buy_volume_24h_usd DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_belief_stats_buy_vol_7d_desc  ON public.belief_stats (buy_volume_7d_usd  DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_belief_stats_buy_vol_30d_desc ON public.belief_stats (buy_volume_30d_usd DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_belief_stats_buy_vol_1h_desc  ON public.belief_stats (buy_volume_1h_usd  DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_trades_belief_action_ts ON public.trades (belief_id, action, block_timestamp) WHERE is_canonical = TRUE;
CREATE INDEX IF NOT EXISTS idx_trades_action_ts_canonical ON public.trades (action, block_timestamp) WHERE is_canonical = TRUE;
CREATE INDEX IF NOT EXISTS idx_beliefs_created_at_desc ON public.beliefs (created_at DESC);
