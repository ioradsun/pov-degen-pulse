-- Backfill all POV history from the on-chain source of truth.
--
-- The indexer cold-started with only a ~24h lookback, so realized/unrealized
-- P&L for positions opened before that window has no matching buy lots and
-- shows phantom profit. Re-point the cursor to just before the BeliefMarket
-- proxy's deploy block; the next pg_cron ticks grind forward MAX_BLOCK_RANGE
-- blocks at a time, re-scanning the full history.
--
-- This is safe to run repeatedly: trades upsert on event_id and beliefs upsert
-- on belief_id (both ignoreDuplicates), so re-scanning already-indexed blocks
-- is idempotent — no double counting.
--
-- Deploy block 48142231, tx 0xf3b801d5...1fafd7 (see VERIFICATION.md).
-- Setting the cursor to deploy-1 makes the next tick start exactly at deploy.

UPDATE public.indexer_state
SET last_indexed_block = 48142230,
    last_error = NULL,
    last_error_at = NULL,
    updated_at = now()
WHERE chain_id = 8453;
