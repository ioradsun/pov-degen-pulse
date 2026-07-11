import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Range } from "@/lib/pov/ranges";

export interface FeedEvent {
  event_id: string;
  chain_id: number;
  tx_hash: string;
  log_index: number;
  block_number: number;
  event_timestamp: string;
  event_type: "new_belief" | "yes_buy" | "no_buy" | "yes_sell" | "no_sell";
  action: "buy" | "sell" | null;
  side: "yes" | "no" | null;
  belief_id: number;
  belief_text: string | null;
  belief_slug: string | null;
  wallet_address: string;
  amount_usd: number | null;
  payment_token_symbol: string | null;
  is_confirmed: boolean;
  is_canonical: boolean;
}

export interface HeadlineMetrics {
  range: Range;
  buy_volume_usd?: number;
  active_traders?: number;
  new_beliefs?: number;
  creator_revenue_usd?: number;
  degen_allocation_usd?: number;
  /** Equal-length window immediately before the selected range; null for "all". */
  buy_volume_usd_prev?: number | null;
  active_traders_prev?: number | null;
  new_beliefs_prev?: number | null;
  creator_revenue_usd_prev?: number | null;
  degen_allocation_usd_prev?: number | null;
  buy_volume_eth?: number;
  creator_revenue_eth?: number;
  degen_allocation_eth?: number;
  buy_volume_eth_prev?: number | null;
  creator_revenue_eth_prev?: number | null;
  degen_allocation_eth_prev?: number | null;
  transactions?: number;
  transactions_prev?: number | null;
  computedAt: string;
}

export interface GridRow {
  belief_id: number;
  title: string | null;
  slug: string | null;
  creator_address: string;
  creator_display_name: string | null;
  created_at: string;
  /** Buy volume for the range the grid was queried with. */
  buy_volume_usd: number;
  buy_volume_1h_usd: number;
  buy_volume_24h_usd: number;
  buy_volume_7d_usd: number;
  buy_volume_30d_usd: number;
  buy_volume_all_usd: number;
  split_pct: number | null;
  ignition_score: number | null;
  momentum: number | null;
  whale_activity_pct: number | null;
  distribution_gini: number | null;
  delta_conviction_1h: number | null;
  lifecycle_stage: string;
  unique_wallets_24h: number;
  creator_quality: number | null;
  market_cap_usd: number;

}

export type GridSort = "ignition" | "volume" | "momentum" | "whale" | "split" | "delta_conviction";

export interface RhythmBucket {
  bucket: string;
  buy_volume_usd: number;
  buy_volume_eth: number;
  buys: number;
  sells: number;
  created: number;
  active_traders: number;
}

export interface RetentionMetrics {
  new_wallets: number;
  repeat_wallets: number;
  repeat_rate: number | null;
  computedAt: string;
}

export type WriterStatus = "ok" | "stalled" | "starting" | "no writer connected";

export interface HealthResponse {
  beliefs_total: number;
  beliefs_hydrated: number;
  beliefs_pending_hydration: number;
  latest_trade_at: string | null;
  seconds_since_last_trade: number | null;
  last_stats_refresh: string | null;
  indexer: {
    chain_id?: number;
    last_indexed_block?: number;
    last_indexed_at: string | null;
    seconds_since_last_index: number | null;
    last_error: string | null;
  } | null;
  writer_status: WriterStatus;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export function useApiFeed(opts: { largeOnly?: boolean; limit?: number } = {}) {
  const { largeOnly = false, limit = 100 } = opts;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (largeOnly) params.set("large", "true");
  return useQuery({
    queryKey: ["pov", "feed", largeOnly, limit],
    queryFn: () =>
      fetchJson<{ events: FeedEvent[]; nextCursor: string | null }>(
        `/api/public/feed?${params.toString()}`,
      ),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useApiHeadline(range: Range = "24h") {
  return useQuery({
    queryKey: ["pov", "headline", range],
    queryFn: () => fetchJson<HeadlineMetrics>(`/api/public/headline?range=${range}`),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useApiGrid(sort: GridSort = "ignition", range: Range = "24h", limit = 12) {
  return useQuery({
    queryKey: ["pov", "grid", sort, range, limit],
    queryFn: () =>
      fetchJson<{ range: Range; rows: GridRow[] }>(
        `/api/public/grid?sort=${sort}&range=${range}&limit=${limit}`,
      ),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useApiMarketCaps() {
  return useQuery({
    queryKey: ["pov", "market-caps"],
    queryFn: () => fetchJson<{ caps: Record<string, number> }>("/api/public/market-caps"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}




export function useApiRhythm(range: Range = "24h") {
  return useQuery({
    queryKey: ["pov", "rhythm", range],
    queryFn: () =>
      fetchJson<{ range: Range; buckets: RhythmBucket[] }>(`/api/public/rhythm?range=${range}`),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export type HistoryGranularity = "hour" | "day" | "week" | "month";

export function useApiActivityBuckets(granularity: HistoryGranularity, buckets: number) {
  return useQuery({
    queryKey: ["pov", "activity-buckets", granularity, buckets],
    queryFn: () =>
      fetchJson<{ granularity: HistoryGranularity; buckets: RhythmBucket[] }>(
        `/api/public/activity-buckets?granularity=${granularity}&buckets=${buckets}`,
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** 7-day repeat wallet rate — an all-time cohort metric, not range-scoped. */
export function useApiRetention() {
  return useQuery({
    queryKey: ["pov", "retention"],
    queryFn: () => fetchJson<RetentionMetrics>("/api/public/retention"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

// ---------- Realized P&L (Trader Outcomes) ----------

export interface PnlHeadline {
  range: Range;
  realized_usd: number;
  realized_eth: number;
  exits: number;
  tokens_sold: number;
  realized_usd_prev: number | null;
  realized_eth_prev: number | null;
  exits_prev: number | null;
  computedAt: string;
}

export interface PnlOutcomes {
  range: Range;
  realized_usd: number;
  total_sells: number;
  profitable_sells: number;
  profitable_exit_rate: number | null;
  avg_return: number | null;
  full_exits: number;
  median_hold_seconds: number | null;
  computedAt: string;
}

export interface PnlBucket {
  bucket: string;
  realized_usd: number;
  realized_eth: number;
  exits: number;
}

export interface PnlByBeliefRow {
  belief_id: number;
  realized_usd: number;
  realized_eth: number;
  exits: number;
  profitable_exits: number;
}

export function useApiPnlHeadline(range: Range = "24h") {
  return useQuery({
    queryKey: ["pov", "pnl-headline", range],
    queryFn: () => fetchJson<PnlHeadline>(`/api/public/pnl/headline?range=${range}`),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useApiPnlOutcomes(range: Range = "24h") {
  return useQuery({
    queryKey: ["pov", "pnl-outcomes", range],
    queryFn: () => fetchJson<PnlOutcomes>(`/api/public/pnl/outcomes?range=${range}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useApiPnlBuckets(granularity: HistoryGranularity, buckets: number) {
  return useQuery({
    queryKey: ["pov", "pnl-buckets", granularity, buckets],
    queryFn: () =>
      fetchJson<{ granularity: HistoryGranularity; buckets: PnlBucket[] }>(
        `/api/public/pnl/buckets?granularity=${granularity}&buckets=${buckets}`,
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useApiPnlByBelief(range: Range = "24h", limit = 200) {
  return useQuery({
    queryKey: ["pov", "pnl-by-belief", range, limit],
    queryFn: () =>
      fetchJson<{ range: Range; rows: PnlByBeliefRow[] }>(
        `/api/public/pnl/by-belief?range=${range}&limit=${limit}`,
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}


/** Indexer/writer health — drives the header's live/stalled status. */
export function useApiHealth() {
  return useQuery({
    queryKey: ["pov", "health"],
    queryFn: () => fetchJson<HealthResponse>("/api/public/health"),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/** Subscribe once to Postgres changes and invalidate the POV queries. */
export function usePulseRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("pov-pulse")
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, () => {
        qc.invalidateQueries({ queryKey: ["pov", "feed"] });
        qc.invalidateQueries({ queryKey: ["pov", "headline"] });
        qc.invalidateQueries({ queryKey: ["pov", "retention"] });
        qc.invalidateQueries({ queryKey: ["pov", "rhythm"] });
        qc.invalidateQueries({ queryKey: ["pov", "grid"] });
        qc.invalidateQueries({ queryKey: ["pov", "pnl-headline"] });
        qc.invalidateQueries({ queryKey: ["pov", "pnl-outcomes"] });
        qc.invalidateQueries({ queryKey: ["pov", "pnl-buckets"] });
        qc.invalidateQueries({ queryKey: ["pov", "pnl-by-belief"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "beliefs" }, () => {
        qc.invalidateQueries({ queryKey: ["pov", "feed"] });
        qc.invalidateQueries({ queryKey: ["pov", "headline"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "belief_stats" }, () => {
        qc.invalidateQueries({ queryKey: ["pov", "grid"] });
        qc.invalidateQueries({ queryKey: ["pov", "market-caps"] });
      })

      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
