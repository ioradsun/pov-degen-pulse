ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS tokens_delta NUMERIC;
CREATE INDEX IF NOT EXISTS trades_tokens_delta_null_idx ON public.trades (block_number) WHERE tokens_delta IS NULL;