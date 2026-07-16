import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Range } from "@/lib/pov/ranges";
import { WALLET_RE, type WalletReport, type WalletTimeline } from "@/lib/pov/wallet";

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
  range: Range;
  threshold?: number;
  new_wallets: number;
  repeat_wallets: number;
  repeat_rate: number | null;
  beliefs_created: number;
  beliefs_filled: number;
  belief_fill_rate: number | null;
  degen_burn_usd: number;
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

/** Repeat-wallet & growth health, scoped to the global timeframe. */
export function useApiRetention(range: Range = "24h", threshold: number = 3) {
  return useQuery({
    queryKey: ["pov", "retention", range, threshold],
    queryFn: () =>
      fetchJson<RetentionMetrics>(
        `/api/public/retention?range=${range}&threshold=${threshold}`,
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export interface EscapeVelocityBelief {
  belief_id: number;
  title: string | null;
  slug: string | null;
  creator_address: string;
  creator_display_name: string | null;
  created_at: string;
  unique_buyers: number;
  buy_volume_usd: number;
  buy_volume_eth: number;
}

/** Beliefs that reached the Escape Velocity buyer threshold in the window. */
export function useApiEscapeVelocityBeliefs(
  range: Range,
  threshold: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["pov", "escape-velocity-beliefs", range, threshold],
    queryFn: () =>
      fetchJson<{ range: Range; threshold: number; rows: EscapeVelocityBelief[] }>(
        `/api/public/escape-velocity?range=${range}&threshold=${threshold}`,
      ),
    enabled,
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
  price_pnl_usd?: number | null;
  price_profitable_sells?: number | null;
  price_profitable_rate?: number | null;
  price_avg_return?: number | null;
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

export interface PnlWalletSummary {
  range: string;
  sellers: number | null;
  profitable_wallets: number | null;
  profitable_wallet_rate: number | null;
  winners_net_eth: number | null;
  winners_net_usd: number | null;
  gross_gains_eth: number | null;
  net_realized_eth: number | null;
  net_realized_usd: number | null;
  median_wallet_return: number | null;
  median_winning_return: number | null;
  positions: number | null;
  profitable_positions: number | null;
  profitable_position_rate: number | null;
  median_position_return: number | null;
}

export function useApiPnlWallets(range: Range = "24h") {
  return useQuery({
    queryKey: ["pov", "pnl-wallets", range],
    queryFn: () => fetchJson<PnlWalletSummary>(`/api/public/pnl/wallets?range=${range}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** One cumulative snapshot of trader outcomes as of a point in time. */
export interface OutcomesSnapshot {
  label: "now" | "prev";
  // sold (realized)
  sellers: number;
  realized_winners: number;
  realized_net_eth: number;
  realized_net_usd: number;
  // holding (unrealized / paper)
  holders: number;
  holder_winners: number;
  unrealized_eth: number;
  unrealized_usd: number;
  holding_value_eth: number;
  holding_value_usd: number;
  // all-in cash view
  money_in_eth: number;
  money_in_usd: number;
  money_out_eth: number;
  money_out_usd: number;
  net_eth: number;
  net_usd: number;
  // wallet ledger — every trader in exactly one bucket by combined total P&L
  wallets_total: number;
  ahead: number;
  behind: number;
  banked: number; // cashed out, up (real)
  paper_up: number; // still holding, up (paper)
  underwater: number; // still holding, down (paper)
  locked_loss: number; // cashed out, down (real)
  // concentration of realized (real) gains
  top3_gain_share: number | null;
  top5_gain_share: number | null;
  // position ledger — every (wallet, belief, side) position in one state
  won_positions: number; // closed, came out ahead (real)
  lost_positions: number; // closed, came out behind (real)
  open_positions: number; // still open, not settled (paper)
  open_up: number; // open and up at last trade price (paper)
  open_down: number; // open and down at last trade price (paper)
  // capital-weighted avg ROI per state (fraction; 0.4 = +40%), null if empty
  won_roi: number | null;
  lost_roi: number | null;
  open_up_roi: number | null;
  open_down_roi: number | null;
}

export interface TraderOutcomes {
  range: Range;
  now: OutcomesSnapshot | null;
  prev: OutcomesSnapshot | null;
  computedAt: string;
}

/**
 * Cumulative trader outcomes (sold + holding + net), with a `prev` snapshot
 * one window back so the UI can show the change over the selected timeframe.
 */
export function useApiTraderOutcomes(range: Range = "24h") {
  return useQuery({
    queryKey: ["pov", "trader-outcomes", range],
    queryFn: () => fetchJson<TraderOutcomes>(`/api/public/trader-outcomes?range=${range}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
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
        qc.invalidateQueries({ queryKey: ["pov", "trader-outcomes"] });
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

/** Lifetime position breakdown + summary for a single wallet address. */
export function useApiWallet(address: string | undefined) {
  const addr = (address ?? "").toLowerCase();
  return useQuery({
    queryKey: ["pov", "wallet", addr],
    queryFn: () => fetchJson<WalletReport>(`/api/public/wallet/${addr}`),
    enabled: WALLET_RE.test(addr),
    staleTime: 30_000,
  });
}

/** Daily P&L timeline for a wallet (registers + backfills it on first view). */
export function useApiWalletTimeline(address: string | undefined) {
  const addr = (address ?? "").toLowerCase();
  return useQuery({
    queryKey: ["pov", "wallet-timeline", addr],
    queryFn: () => fetchJson<WalletTimeline>(`/api/public/wallet/${addr}/timeline`),
    enabled: WALLET_RE.test(addr),
    staleTime: 60_000,
  });
}

export interface PriceDeltaRow {
  yes_pct: number | null;
  yes_start: number | null;
  yes_end: number | null;
  yes_trades: number;
  no_pct: number | null;
  no_start: number | null;
  no_end: number | null;
  no_trades: number;
}

/**
 * YES/NO share-price % change for a batch of belief ids over the selected range.
 * Returns a map keyed by belief_id as a string.
 */
export function useApiBeliefPriceDeltas(range: Range, beliefIds: number[]) {
  const ids = Array.from(new Set(beliefIds.filter((n) => Number.isFinite(n) && n > 0))).sort(
    (a, b) => a - b,
  );
  const key = ids.join(",");
  return useQuery({
    queryKey: ["pov", "belief-price-deltas", range, key],
    queryFn: () =>
      fetchJson<{ range: Range; deltas: Record<string, PriceDeltaRow> }>(
        `/api/public/belief-price-deltas?range=${range}&ids=${encodeURIComponent(key)}`,
      ),
    enabled: ids.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

