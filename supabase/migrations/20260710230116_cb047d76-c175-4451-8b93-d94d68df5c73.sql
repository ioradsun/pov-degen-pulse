
CREATE TABLE public.indexer_state (
  chain_id            INT           PRIMARY KEY,
  last_indexed_block  BIGINT        NOT NULL DEFAULT 0,
  last_indexed_at     TIMESTAMPTZ,
  last_error          TEXT,
  last_error_at       TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- service_role only — the indexer runs privileged from the server route.
GRANT ALL ON public.indexer_state TO service_role;

ALTER TABLE public.indexer_state ENABLE ROW LEVEL SECURITY;
-- No policies. RLS is on and no policy exists → anon/authenticated cannot read
-- or write. Only service_role (which bypasses RLS) can touch it.

-- Seed a row for Base so the indexer has a starting point on first run.
-- Setting last_indexed_block=0 lets the indexer initialize itself to
-- (head - N) on first tick without a NULL check.
INSERT INTO public.indexer_state (chain_id, last_indexed_block)
VALUES (8453, 0)
ON CONFLICT (chain_id) DO NOTHING;
