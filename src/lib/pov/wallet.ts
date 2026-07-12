/**
 * Per-wallet breakdown types + rollup. Shared by the API route (server) and the
 * useApiWallet hook (client), so keep this file free of react / supabase imports.
 *
 * A row is one position — the wallet's stake in one market side (belief × side),
 * the same grain as trader_outcomes(). All ETH amounts are native (wei / 1e18).
 */

export type PositionState = "won" | "lost" | "open_up" | "open_down";

export interface WalletPosition {
  belief_id: number;
  title: string | null;
  slug: string | null;
  side: "yes" | "no";
  in_eth: number; // money in (buy cost)
  out_eth: number; // cash out (sell proceeds)
  realized_eth: number; // FIFO-realized P&L
  remaining_tokens: number; // still held (token wei)
  hold_value_eth: number; // held tokens marked at last trade price
  remaining_cost_eth: number; // unmatched cost basis of what's still held
  unrealized_eth: number; // hold_value - remaining_cost
  roi: number | null; // closed → realized/in; open → unrealized/remaining_cost
  state: PositionState;
}

export interface WalletSummary {
  positions: number;
  deposited_eth: number; // total bought (money in)
  withdrawn_eth: number; // total sold (cash out)
  holding_value_eth: number; // current value of everything still held
  realized_eth: number; // banked P&L
  unrealized_eth: number; // paper P&L
  net_eth: number; // withdrawn + holding - deposited
  overall_roi: number | null; // net ÷ deposited
  won: number;
  lost: number;
  open_up: number;
  open_down: number;
}

export interface WalletReport {
  address: string;
  summary: WalletSummary;
  positions: WalletPosition[];
}

export const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Coerce a raw RPC row (numerics may arrive as strings) into a typed position. */
export function toWalletPosition(r: Record<string, unknown>): WalletPosition {
  const roi = r.roi == null ? null : num(r.roi);
  return {
    belief_id: num(r.belief_id),
    title: (r.title as string | null) ?? null,
    slug: (r.slug as string | null) ?? null,
    side: (r.side as "yes" | "no") ?? "yes",
    in_eth: num(r.in_eth),
    out_eth: num(r.out_eth),
    realized_eth: num(r.realized_eth),
    remaining_tokens: num(r.remaining_tokens),
    hold_value_eth: num(r.hold_value_eth),
    remaining_cost_eth: num(r.remaining_cost_eth),
    unrealized_eth: num(r.unrealized_eth),
    roi: roi != null && Number.isFinite(roi) ? roi : null,
    state: (r.state as PositionState) ?? "open_down",
  };
}

export function summarizePositions(positions: WalletPosition[]): WalletSummary {
  let deposited = 0;
  let withdrawn = 0;
  let realized = 0;
  let holding = 0;
  let unrealized = 0;
  for (const p of positions) {
    deposited += p.in_eth;
    withdrawn += p.out_eth;
    realized += p.realized_eth;
    holding += p.hold_value_eth;
    unrealized += p.unrealized_eth;
  }
  const net = withdrawn + holding - deposited;
  const count = (s: PositionState) => positions.filter((p) => p.state === s).length;
  return {
    positions: positions.length,
    deposited_eth: deposited,
    withdrawn_eth: withdrawn,
    holding_value_eth: holding,
    realized_eth: realized,
    unrealized_eth: unrealized,
    net_eth: net,
    overall_roi: deposited > 0 ? net / deposited : null,
    won: count("won"),
    lost: count("lost"),
    open_up: count("open_up"),
    open_down: count("open_down"),
  };
}
