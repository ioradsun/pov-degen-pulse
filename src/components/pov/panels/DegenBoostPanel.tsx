import { useMemo } from "react";
import { Panel } from "../primitives/Panel";
import type { DecodedEvent } from "@/lib/pov/types";
import { formatCompact } from "@/lib/pov/format";

const WINDOW_S = 2 * 3600; // ± 2h around boost

/**
 * For each boost event, count POV activity (buy+sell) on the boosted belief
 * in [t-window, t] vs [t, t+window]. Report mean delta and boost half-life
 * (time from boost to activity dropping below half of the post-boost peak).
 */
export function DegenBoostPanel({ events }: { events: DecodedEvent[] }) {
  const { boosts, avgPre, avgPost, halfLifeMin, deltaPct } = useMemo(() => {
    const boostEvents = events.filter((e) => e.kind === "boost" && e.timestamp);
    if (boostEvents.length === 0) {
      return {
        boosts: 0,
        avgPre: 0,
        avgPost: 0,
        halfLifeMin: null as number | null,
        deltaPct: 0,
      };
    }

    let pre = 0;
    let post = 0;
    const halfLifeSamples: number[] = [];

    for (const b of boostEvents) {
      const t = b.timestamp!;
      const belief = b.beliefId;
      const acts = events.filter(
        (e) =>
          (e.kind === "buy" || e.kind === "sell") &&
          e.timestamp &&
          (!belief || e.beliefId === belief),
      );
      pre += acts.filter((e) => e.timestamp! >= t - WINDOW_S && e.timestamp! < t)
        .length;
      const postActs = acts.filter(
        (e) => e.timestamp! >= t && e.timestamp! <= t + WINDOW_S,
      );
      post += postActs.length;

      // Half-life: bucket post-boost activity in 10-min bins; find when it
      // first drops below half of the peak bin.
      const BIN = 600;
      const bins = new Map<number, number>();
      for (const a of postActs) {
        const k = Math.floor((a.timestamp! - t) / BIN);
        bins.set(k, (bins.get(k) ?? 0) + 1);
      }
      const sorted = [...bins.entries()].sort((a, b) => a[0] - b[0]);
      const peak = Math.max(0, ...sorted.map(([, v]) => v));
      if (peak > 0) {
        const half = peak / 2;
        for (const [k, v] of sorted) {
          if (v < half) {
            halfLifeSamples.push(k * (BIN / 60));
            break;
          }
        }
      }
    }

    const avgPre = pre / boostEvents.length;
    const avgPost = post / boostEvents.length;
    const halfLifeMin =
      halfLifeSamples.length > 0
        ? halfLifeSamples.reduce((a, b) => a + b, 0) / halfLifeSamples.length
        : null;
    const deltaPct = avgPre > 0 ? ((avgPost - avgPre) / avgPre) * 100 : 0;
    return {
      boosts: boostEvents.length,
      avgPre,
      avgPost,
      halfLifeMin,
      deltaPct,
    };
  }, [events]);

  return (
    <Panel title="DegenBoost impact" meta={`${boosts} boosts observed`}>
      {boosts === 0 ? (
        <div className="py-4 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          no boost events in window
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <Stat label="Avg activity · pre 2h" value={formatCompact(avgPre)} />
          <Stat label="Avg activity · post 2h" value={formatCompact(avgPost)} />
          <Stat
            label="Δ activity"
            value={`${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(0)}%`}
            trend={deltaPct}
          />
          <Stat
            label="Boost half-life"
            value={halfLifeMin != null ? `${halfLifeMin.toFixed(0)} min` : "—"}
          />
        </div>
      )}
    </Panel>
  );
}

function Stat({
  label,
  value,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  trend?: number;
}) {
  const color =
    trend == null
      ? "text-[var(--ink)]"
      : trend > 0
        ? "text-[var(--up)]"
        : trend < 0
          ? "text-[var(--down)]"
          : "text-[var(--ink)]";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {label}
      </span>
      <span className={`text-[24px] leading-none tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  );
}
