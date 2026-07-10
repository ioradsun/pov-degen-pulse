CREATE OR REPLACE VIEW public.behavioral_grid AS
SELECT b.belief_id,
    b.title,
    b.creator_address,
    b.created_at,
    s.buy_volume_24h_usd,
    s.split_pct,
    s.ignition_score,
    s.momentum,
    s.whale_activity_pct,
    s.distribution_gini,
    s.delta_conviction_1h,
    s.lifecycle_stage,
    s.unique_wallets_24h,
    c.quality_score AS creator_quality
   FROM beliefs b
     JOIN belief_stats s ON s.belief_id = b.belief_id
     LEFT JOIN creators c ON c.creator_address = b.creator_address
  WHERE s.lifecycle_stage <> 'archived'::text;