import type { OhlcBar } from "./geckoterminal";
import type { RhythmBucket } from "@/hooks/pov/useApiPulse";

const HOUR = 3600;

export interface PulseBucket {
  hour: number; // unix seconds, hour-floored
  buyVolumeUsd: number; // POV buy volume this hour (indexer-reported, USD)
  buys: number;
  sells: number;
  created: number; // beliefs created this hour
  degenPriceUsd: number | null; // real hourly close from OHLC
  degenVolumeUsd: number | null;
}

function floorHour(ts: number): number {
  return Math.floor(ts / HOUR) * HOUR;
}

/**
 * Aligns the indexer's hourly POV activity buckets with DEGEN's real hourly
 * OHLC into one series — the direct "product activity vs token price"
 * comparison.
 */
export function buildPulse(rows: RhythmBucket[], ohlc: OhlcBar[]): PulseBucket[] {
  const buckets = new Map<number, PulseBucket>();
  for (const r of rows) {
    const hour = floorHour(Math.floor(new Date(r.hour).getTime() / 1000));
    buckets.set(hour, {
      hour,
      buyVolumeUsd: Number(r.buy_volume_usd),
      buys: r.buys,
      sells: r.sells,
      created: r.created,
      degenPriceUsd: null,
      degenVolumeUsd: null,
    });
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
  const ordered = [...buckets.values()].sort((a, z) => a.hour - z.hour);
  for (const b of ordered) {
    if (b.degenPriceUsd == null) b.degenPriceUsd = lastPrice;
    else lastPrice = b.degenPriceUsd;
  }

  return ordered;
}
