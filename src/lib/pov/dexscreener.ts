import { DEGEN } from "./constants";
import type { DegenSnapshot } from "./types";

interface Pair {
  chainId?: string;
  priceUsd?: string;
  priceNative?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  txns?: { h24?: { buys?: number; sells?: number } };
}

export async function fetchDegenSnapshot(): Promise<DegenSnapshot | null> {
  try {
    const r = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${DEGEN.address}`,
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { pairs?: Pair[] };
    const pairs = j?.pairs ?? [];
    if (!pairs.length) return null;
    const base = pairs.filter((p) => p.chainId === "base");
    const pool = (base.length ? base : pairs).sort(
      (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
    )[0];
    return {
      ts: Date.now(),
      priceUsd: parseFloat(pool.priceUsd ?? "0"),
      priceEth: parseFloat(pool.priceNative ?? "0"),
      change24h: pool.priceChange?.h24 ?? 0,
      volume24h: pool.volume?.h24 ?? 0,
      liquidityUsd: pool.liquidity?.usd ?? 0,
      marketCap: pool.marketCap ?? pool.fdv ?? 0,
      buys24h: pool.txns?.h24?.buys ?? 0,
      sells24h: pool.txns?.h24?.sells ?? 0,
    };
  } catch {
    return null;
  }
}
