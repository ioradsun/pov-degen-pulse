// Global DEGEN market data — aggregated across every venue CoinGecko tracks
// (all chains + CEXes), not a single pool. Used for price / 24h change /
// 24h volume / market cap. DexScreener still supplies pool-level texture
// (buy/sell counts, liquidity) that CoinGecko's simple endpoint doesn't carry.
//
// `degen-base` is CoinGecko's id for DEGEN's Base contract
// (0x4ed4E862860bEd51a9570b96d89aF5E1B0Efefed) — verified via the
// /coins/base/contract/<addr> mapping.

const CG_ID = "degen-base";

export interface DegenGlobal {
  priceUsd: number;
  priceEth: number;
  change24h: number; // percent
  volume24h: number; // USD, trailing 24h, all venues
  marketCap: number; // USD
}

export async function fetchDegenGlobal(): Promise<DegenGlobal | null> {
  try {
    const url =
      `https://api.coingecko.com/api/v3/simple/price?ids=${CG_ID}` +
      `&vs_currencies=usd,eth&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as Record<
      string,
      {
        usd?: number;
        eth?: number;
        usd_market_cap?: number;
        usd_24h_vol?: number;
        usd_24h_change?: number;
      }
    >;
    const d = j[CG_ID];
    if (!d || typeof d.usd !== "number") return null;
    return {
      priceUsd: d.usd ?? 0,
      priceEth: d.eth ?? 0,
      change24h: d.usd_24h_change ?? 0,
      volume24h: d.usd_24h_vol ?? 0,
      marketCap: d.usd_market_cap ?? 0,
    };
  } catch {
    return null;
  }
}
