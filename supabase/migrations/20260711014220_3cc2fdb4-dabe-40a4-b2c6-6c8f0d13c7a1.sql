
-- Lock down maintenance-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.update_lifecycle_stages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_belief_stats() FROM PUBLIC, anon, authenticated;

-- Public analytics helpers: switch to SECURITY INVOKER so callers use their own RLS.
-- anon/authenticated already have SELECT on trades via RLS, so these still work.
ALTER FUNCTION public.repeat_wallet_rate() SECURITY INVOKER;
ALTER FUNCTION public.hourly_activity(integer) SECURITY INVOKER;

-- Allow anonymous read on wallets (public on-chain analytics data)
GRANT SELECT ON public.wallets TO anon;
CREATE POLICY "wallets_read_anon" ON public.wallets FOR SELECT TO anon USING (true);
