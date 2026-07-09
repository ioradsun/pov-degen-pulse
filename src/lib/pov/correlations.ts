import type { DecodedEvent } from "./types";
import type { OhlcBar } from "./geckoterminal";
import { laggedXcorr, linreg, logReturns, pearson } from "./stats";

const HOUR = 3600;

export interface JoinedRow {
  hour: number;
  povEvents: number;
  povBuys: number;
  povSells: number;
  povUniqueAddrs: number;
  degenClose: number;
  degenVolumeUsd: number;
  degenReturn: number; // log return vs previous hour
}

/** Bucket events into an aligned hourly series matching the OHLC bars. */
export function joinPovDegen(
  events: DecodedEvent[],
  bars: OhlcBar[],
): JoinedRow[] {
  if (!bars.length) return [];
  const byHour = new Map<
    number,
    { events: number; buys: number; sells: number; addrs: Set<string> }
  >();
  for (const b of bars) {
    byHour.set(b.ts, { events: 0, buys: 0, sells: 0, addrs: new Set() });
  }
  const first = bars[0].ts;
  const last = bars[bars.length - 1].ts + HOUR;
  for (const e of events) {
    if (!e.timestamp) continue;
    if (e.timestamp < first || e.timestamp >= last) continue;
    const h = Math.floor(e.timestamp / HOUR) * HOUR;
    const slot = byHour.get(h);
    if (!slot) continue;
    slot.events++;
    if (e.kind === "buy") slot.buys++;
    else if (e.kind === "sell") slot.sells++;
    if (e.from) slot.addrs.add(e.from);
  }

  const closes = bars.map((b) => b.close);
  const rets = [0, ...logReturns(closes)];
  return bars.map((b, i) => {
    const s = byHour.get(b.ts);
    return {
      hour: b.ts,
      povEvents: s?.events ?? 0,
      povBuys: s?.buys ?? 0,
      povSells: s?.sells ?? 0,
      povUniqueAddrs: s?.addrs.size ?? 0,
      degenClose: b.close,
      degenVolumeUsd: b.volumeUsd,
      degenReturn: rets[i] ?? 0,
    };
  });
}

export interface CorrelationSummary {
  n: number;
  hours: number;
  pearsonEventsVolume: number;
  pearsonEventsReturn: number;
  pearsonBuysReturn: number;
  bestLag: { lag: number; r: number } | null;
  window: { start: number; end: number } | null;
}

export function summarize(rows: JoinedRow[]): CorrelationSummary {
  if (!rows.length) {
    return {
      n: 0,
      hours: 0,
      pearsonEventsVolume: 0,
      pearsonEventsReturn: 0,
      pearsonBuysReturn: 0,
      bestLag: null,
      window: null,
    };
  }
  const povE = rows.map((r) => r.povEvents);
  const povB = rows.map((r) => r.povBuys);
  const vol = rows.map((r) => r.degenVolumeUsd);
  const ret = rows.map((r) => r.degenReturn);
  const xc = laggedXcorr(povE, ret, Math.min(12, Math.floor(rows.length / 3)));
  const best = xc.reduce<{ lag: number; r: number } | null>((acc, cur) => {
    if (!acc || Math.abs(cur.r) > Math.abs(acc.r)) {
      return { lag: cur.lag, r: cur.r };
    }
    return acc;
  }, null);
  return {
    n: rows.length,
    hours: rows.length,
    pearsonEventsVolume: pearson(povE, vol),
    pearsonEventsReturn: pearson(povE, ret),
    pearsonBuysReturn: pearson(povB, ret),
    bestLag: best,
    window: { start: rows[0].hour, end: rows[rows.length - 1].hour },
  };
}

/**
 * Rolling OLS of degenReturn ~ povEvents over `window` hours.
 * Emits one point per hour once enough history is available.
 */
export function rollingRegression(
  rows: JoinedRow[],
  windowHours = 24,
): Array<{ hour: number; slope: number; r2: number }> {
  const out: Array<{ hour: number; slope: number; r2: number }> = [];
  if (rows.length < windowHours) return out;
  const xs = rows.map((r) => r.povEvents);
  const ys = rows.map((r) => r.degenReturn);
  for (let i = windowHours - 1; i < rows.length; i++) {
    const wx = xs.slice(i - windowHours + 1, i + 1);
    const wy = ys.slice(i - windowHours + 1, i + 1);
    const { slope, r2 } = linreg(wx, wy);
    out.push({ hour: rows[i].hour, slope, r2 });
  }
  return out;
}

export function xcorrSeries(
  rows: JoinedRow[],
  maxLag = 12,
): Array<{ lag: number; r: number; n: number }> {
  const povE = rows.map((r) => r.povEvents);
  const ret = rows.map((r) => r.degenReturn);
  return laggedXcorr(povE, ret, Math.min(maxLag, Math.floor(rows.length / 3)));
}
