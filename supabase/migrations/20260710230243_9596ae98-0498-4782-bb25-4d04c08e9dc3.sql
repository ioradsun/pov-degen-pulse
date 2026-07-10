
DROP FUNCTION IF EXISTS public.indexer_health();

CREATE OR REPLACE VIEW public.indexer_health
WITH (security_invoker = on) AS
SELECT chain_id, last_indexed_block, last_indexed_at, last_error
FROM public.indexer_state
WHERE chain_id = 8453;

-- The view is security_invoker, so callers need SELECT on the underlying
-- table. Grant it narrowly (only the four columns exposed above).
GRANT SELECT (chain_id, last_indexed_block, last_indexed_at, last_error)
  ON public.indexer_state TO anon, authenticated;
GRANT SELECT ON public.indexer_health TO anon, authenticated;

-- Allow reads through RLS for those two roles, restricted to the base row.
CREATE POLICY indexer_state_public_read ON public.indexer_state
  FOR SELECT TO anon, authenticated
  USING (chain_id = 8453);
