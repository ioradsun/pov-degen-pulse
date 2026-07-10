
ALTER FUNCTION public.headline_metrics(TEXT) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.refresh_belief_stats()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_lifecycle_stages() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_belief_stats()   TO service_role;
GRANT  EXECUTE ON FUNCTION public.update_lifecycle_stages() TO service_role;
