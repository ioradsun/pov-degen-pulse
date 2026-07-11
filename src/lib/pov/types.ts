export type EventKind =
  "created" | "buy" | "sell" | "boost" | "fee" | "transfer" | "approval" | "admin" | "unknown";

export interface DegenSnapshot {
  ts: number;
  priceUsd: number;
  priceEth: number;
  change24h: number;
  volume24h: number;
  liquidityUsd: number;
  marketCap: number;
  buys24h: number;
  sells24h: number;
}
