
CREATE OR REPLACE FUNCTION public.indexer_health()
RETURNS TABLE (
  chain_id INT,
  last_indexed_block BIGINT,
  last_indexed_at TIMESTAMPTZ,
  last_error TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT chain_id, last_indexed_block, last_indexed_at, last_error
  FROM public.indexer_state
  WHERE chain_id = 8453
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.indexer_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.indexer_health() TO anon, authenticated, service_role;
