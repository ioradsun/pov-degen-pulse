import type { DecodedEvent, DegenSnapshot, HourBucket } from "./types";

const HOUR = 3600;

function floorHour(tsSec: number): number {
  return Math.floor(tsSec / HOUR) * HOUR;
}

/**
 * Groups events and degen snapshots into aligned hourly buckets covering the
 * last `hours` hours (default 24). Events without a timestamp are ignored.
 */
export function buildHourlyBuckets(
  events: DecodedEvent[],
  degenSamples: DegenSnapshot[],
  hours = 24,
): HourBucket[] {
  const nowHour = floorHour(Math.floor(Date.now() / 1000));
  const start = nowHour - (hours - 1) * HOUR;

  const buckets = new Map<number, HourBucket>();
  for (let h = start; h <= nowHour; h += HOUR) {
    buckets.set(h, {
      hour: h,
      povEvents: 0,
      povBuys: 0,
      povSells: 0,
      povUniqueAddrs: 0,
      degenVolumeUsd: 0,
      degenPriceUsd: 0,
      degenBuys: 0,
      degenSells: 0,
    });
  }

  const addrByHour = new Map<number, Set<string>>();
  for (const e of events) {
    if (!e.timestamp) continue;
    const h = floorHour(e.timestamp);
    const b = buckets.get(h);
    if (!b) continue;
    b.povEvents++;
    if (e.kind === "buy") b.povBuys++;
    else if (e.kind === "sell") b.povSells++;
    if (e.from) {
      let s = addrByHour.get(h);
      if (!s) {
        s = new Set();
        addrByHour.set(h, s);
      }
      s.add(e.from);
    }
  }
  for (const [h, set] of addrByHour) {
    const b = buckets.get(h);
    if (b) b.povUniqueAddrs = set.size;
  }

  // Fold degen samples: distribute 24h volume evenly across the last 24 hours
  // (best-effort v0; replace with real hourly volume from OHLC in v1).
  if (degenSamples.length) {
    const latest = degenSamples[degenSamples.length - 1];
    const perHour = latest.volume24h / 24;
    for (const b of buckets.values()) {
      b.degenVolumeUsd = perHour;
      b.degenPriceUsd = latest.priceUsd;
      b.degenBuys = Math.round(latest.buys24h / 24);
      b.degenSells = Math.round(latest.sells24h / 24);
    }
  }

  return [...buckets.values()].sort((a, b) => a.hour - b.hour);
}
