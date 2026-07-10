import type { OhlcBar } from "./geckoterminal";
import type { DecodedEvent } from "./types";

const HOUR = 3600;

export interface PulseBucket {
  hour: number; // unix seconds, hour-floored
  volumeEth: number; // POV ETH transacted this hour
  buys: number;
  sells: number;
  created: number; // beliefs created this hour
  boosts: number;
  traders: number; // unique addresses
  degenPriceUsd: number | null; // real hourly close from OHLC
  degenVolumeUsd: number | null;
}

function floorHour(ts: number): number {
  return Math.floor(ts / HOUR) * HOUR;
}

/**
 * Aligns POV on-chain activity with DEGEN's real hourly OHLC into one
 * series — the direct "product activity vs token price" comparison.
 */
export function buildPulse(events: DecodedEvent[], ohlc: OhlcBar[], hours = 24): PulseBucket[] {
  const nowHour = floorHour(Math.floor(Date.now() / 1000));
  const start = nowHour - (hours - 1) * HOUR;

  const buckets = new Map<number, PulseBucket>();
  for (let h = start; h <= nowHour; h += HOUR) {
    buckets.set(h, {
      hour: h,
      volumeEth: 0,
      buys: 0,
      sells: 0,
      created: 0,
      boosts: 0,
      traders: 0,
      degenPriceUsd: null,
      degenVolumeUsd: null,
    });
  }

  const addrs = new Map<number, Set<string>>();
  for (const e of events) {
    if (!e.timestamp) continue;
    const b = buckets.get(floorHour(e.timestamp));
    if (!b) continue;
    if (e.kind === "buy") b.buys++;
    else if (e.kind === "sell") b.sells++;
    else if (e.kind === "created") b.created++;
    else if (e.kind === "boost") b.boosts++;
    if (e.valueWei && (e.kind === "buy" || e.kind === "sell")) {
      b.volumeEth += Number(e.valueWei) / 1e18;
    }
    if (e.from) {
      let s = addrs.get(b.hour);
      if (!s) addrs.set(b.hour, (s = new Set()));
      s.add(e.from);
    }
  }
  for (const [h, s] of addrs) {
    const b = buckets.get(h);
    if (b) b.traders = s.size;
  }

  let lastPrice: number | null = null;
  const sorted = [...ohlc].sort((a, b) => a.ts - b.ts);
  for (const bar of sorted) {
    const b = buckets.get(floorHour(bar.ts));
    if (b) {
      b.degenPriceUsd = bar.close;
      b.degenVolumeUsd = bar.volumeUsd;
    }
  }
  // Forward-fill price gaps so the line doesn't break.
  for (const b of [...buckets.values()].sort((a, z) => a.hour - z.hour)) {
    if (b.degenPriceUsd == null) b.degenPriceUsd = lastPrice;
    else lastPrice = b.degenPriceUsd;
  }

  return [...buckets.values()].sort((a, b) => a.hour - b.hour);
}
