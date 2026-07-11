import type { OhlcBar } from "./geckoterminal";
import type { RhythmBucket } from "@/hooks/pov/useApiPulse";

const HOUR = 3600;
const DAY = 86_400;

export interface PulseBucket {
  ts: number; // unix seconds, floored to the active granularity
  buyVolumeUsd: number; // POV buy volume this bucket (indexer-reported, USD)
  buys: number;
  sells: number;
  created: number; // beliefs created this bucket
  degenPriceUsd: number | null; // real close from OHLC
  degenVolumeUsd: number | null;
}

function floor(ts: number, granularity: "hour" | "day"): number {
  const size = granularity === "hour" ? HOUR : DAY;
  return Math.floor(ts / size) * size;
}

/**
 * Aligns the indexer's bucketed POV activity with DEGEN's real OHLC into
 * one series — the direct "product activity vs token price" comparison.
 * Granularity (hourly vs daily bars) follows the selected timeframe.
 */
export function buildPulse(
  rows: RhythmBucket[],
  ohlc: OhlcBar[],
  granularity: "hour" | "day",
): PulseBucket[] {
  // Source rows aren't guaranteed to already match the target granularity
  // (e.g. an hourly feed backing a "daily" chart) — accumulate into each
  // bucket rather than overwrite, so multiple rows landing on the same
  // bucket sum instead of only the last one surviving.
  const buckets = new Map<number, PulseBucket>();
  for (const r of rows) {
    const ts = floor(Math.floor(new Date(r.bucket).getTime() / 1000), granularity);
    const existing = buckets.get(ts);
    if (existing) {
      existing.buyVolumeUsd += Number(r.buy_volume_usd);
      existing.buys += r.buys;
      existing.sells += r.sells;
      existing.created += r.created;
    } else {
      buckets.set(ts, {
        ts,
        buyVolumeUsd: Number(r.buy_volume_usd),
        buys: r.buys,
        sells: r.sells,
        created: r.created,
        degenPriceUsd: null,
        degenVolumeUsd: null,
      });
    }
  }

  let lastPrice: number | null = null;
  const sorted = [...ohlc].sort((a, b) => a.ts - b.ts);
  for (const bar of sorted) {
    const b = buckets.get(floor(bar.ts, granularity));
    if (b) {
      b.degenPriceUsd = bar.close;
      b.degenVolumeUsd = bar.volumeUsd;
    }
  }
  // Forward-fill price gaps so the line doesn't break.
  const ordered = [...buckets.values()].sort((a, z) => a.ts - z.ts);
  for (const b of ordered) {
    if (b.degenPriceUsd == null) b.degenPriceUsd = lastPrice;
    else lastPrice = b.degenPriceUsd;
  }

  return ordered;
}
