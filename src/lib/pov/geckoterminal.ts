import { DEGEN } from "./constants";

export interface OhlcBar {
  ts: number; // unix seconds, hour-floored
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number;
}

interface PoolsResp {
  data?: Array<{
    id?: string;
    attributes?: {
      address?: string;
      reserve_in_usd?: string;
      volume_usd?: { h24?: string };
    };
  }>;
}

interface OhlcResp {
  data?: {
    attributes?: {
      ohlcv_list?: Array<[number, number, number, number, number, number]>;
    };
  };
}

let cachedPool: string | null = null;

async function findTopPool(): Promise<string | null> {
  if (cachedPool) return cachedPool;
  try {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/base/tokens/${DEGEN.address}/pools?page=1`,
      { headers: { accept: "application/json" } },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as PoolsResp;
    const rows = j.data ?? [];
    const best = rows
      .map((p) => ({
        addr: p.attributes?.address ?? "",
        vol: parseFloat(p.attributes?.volume_usd?.h24 ?? "0"),
        liq: parseFloat(p.attributes?.reserve_in_usd ?? "0"),
      }))
      .filter((p) => p.addr)
      .sort((a, b) => b.liq - a.liq)[0];
    if (!best) return null;
    cachedPool = best.addr;
    return best.addr;
  } catch {
    return null;
  }
}

/**
 * Fetches hourly OHLCV for DEGEN's top Base pool.
 * `hours` clamped to 1000 by the API.
 */
export async function fetchDegenHourlyOhlc(hours = 168): Promise<OhlcBar[]> {
  const pool = await findTopPool();
  if (!pool) return [];
  try {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/base/pools/${pool}/ohlcv/hour?aggregate=1&limit=${Math.min(hours, 1000)}&currency=usd`,
      { headers: { accept: "application/json" } },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as OhlcResp;
    const list = j.data?.attributes?.ohlcv_list ?? [];
    const bars: OhlcBar[] = list.map((row) => ({
      ts: Math.floor(row[0] / 3600) * 3600,
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      volumeUsd: row[5],
    }));
    bars.sort((a, b) => a.ts - b.ts);
    return bars;
  } catch {
    return [];
  }
}
