import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "../primitives/Panel";
import type { BeliefRow } from "@/hooks/pov/useBeliefs";

/**
 * Stacked area of Linear vs CP curve share of *new beliefs per bucket*,
 * bucketed by created hour. Works from the events already in the feed.
 */
export function CurveMixArea({
  beliefs,
  hours = 24,
}: {
  beliefs: BeliefRow[];
  hours?: number;
}) {
  const data = useMemo(() => {
    const HOUR = 3600;
    const nowHour = Math.floor(Date.now() / 1000 / HOUR) * HOUR;
    const start = nowHour - (hours - 1) * HOUR;
    const buckets = new Map<
      number,
      { hour: number; linear: number; cp: number; unknown: number }
    >();
    for (let h = start; h <= nowHour; h += HOUR) {
      buckets.set(h, { hour: h, linear: 0, cp: 0, unknown: 0 });
    }
    for (const b of beliefs) {
      const ts = b.createdAt;
      if (!ts) continue;
      const h = Math.floor(ts / HOUR) * HOUR;
      const bucket = buckets.get(h);
      if (!bucket) continue;
      bucket[b.curve]++;
    }
    return [...buckets.values()].map((b) => ({
      label: new Date(b.hour * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      linear: b.linear,
      cp: b.cp,
      unknown: b.unknown,
    }));
  }, [beliefs, hours]);

  const empty = data.every((d) => !d.linear && !d.cp && !d.unknown);

  return (
    <Panel
      title="Curve mix"
      meta="new beliefs / hour · linear vs constant-product"
      bodyClassName="p-0"
    >
      <div className="h-[220px]">
        {empty ? (
          <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            no new beliefs in window
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 24, bottom: 16, left: 40 }}
              stackOffset="expand"
            >
              <CartesianGrid stroke="var(--line-dim)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--line)"
                tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                minTickGap={40}
              />
              <YAxis
                stroke="var(--line)"
                tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 0,
                  fontSize: 12,
                  color: "var(--ink)",
                }}
              />
              <Area
                dataKey="linear"
                stackId="1"
                stroke="var(--pov)"
                fill="var(--pov)"
                fillOpacity={0.4}
                isAnimationActive={false}
              />
              <Area
                dataKey="cp"
                stackId="1"
                stroke="var(--boost)"
                fill="var(--boost)"
                fillOpacity={0.4}
                isAnimationActive={false}
              />
              <Area
                dataKey="unknown"
                stackId="1"
                stroke="var(--ink-faint)"
                fill="var(--ink-faint)"
                fillOpacity={0.3}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
