DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.headline_metrics(text)',
    'public.activity_buckets(text, integer)',
    'public.hourly_activity(integer)',
    'public.value_flow(text)',
    'public.repeat_wallet_rate(text)',
    'public.growth_health(text)',
    'public.trader_outcomes(text)',
    'public.pnl_headline(text)',
    'public.pnl_buckets(text, integer)',
    'public.pnl_by_belief(text, integer)',
    'public.pnl_outcomes(text)',
    'public.pnl_wallet_summary(text)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', fn);
  END LOOP;
END $$;