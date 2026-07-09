import { Panel } from "../primitives/Panel";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatUsd } from "@/lib/pov/format";
import type { HourBucket } from "@/lib/pov/types";

interface Props {
  buckets: HourBucket[];
}

const MARGIN = { top: 8, right: 24, bottom: 0, left: 48 };
const AXIS_STYLE = {
  fontSize: 10,
  fill: "var(--ink-faint)",
  letterSpacing: "0.14em",
};

export function TwinLaneChart({ buckets }: Props) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        hour: b.hour,
        label: new Date(b.hour * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        povEvents: b.povEvents,
        degenVolumeUsd: b.degenVolumeUsd,
      })),
    [buckets],
  );

  return (
    <Panel
      title="POV events / hr  ×  DEGEN volume / hr"
      meta="last 24h"
      action={<LegendDot />}
      bodyClassName="p-0"
    >
      <div className="grid grid-rows-2">
        <div className="h-[200px] border-b border-[var(--line-dim)]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ ...MARGIN, bottom: 4 }}>
              <defs>
                <linearGradient id="povFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--pov)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--pov)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line-dim)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                stroke="var(--line)"
                tick={AXIS_STYLE}
                tickFormatter={(v) => formatCompact(v as number)}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: "var(--pov)", strokeOpacity: 0.3 }}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 0,
                  fontSize: 12,
                  color: "var(--ink)",
                  padding: "8px 10px",
                }}
                labelStyle={{
                  color: "var(--ink-faint)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  marginBottom: 4,
                }}
                formatter={(v: number) => [formatCompact(v), "POV events"]}
              />
              <Area
                type="monotone"
                dataKey="povEvents"
                stroke="var(--pov)"
                strokeWidth={1.5}
                fill="url(#povFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ ...MARGIN, top: 4, bottom: 16 }}>
              <CartesianGrid stroke="var(--line-dim)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                stroke="var(--line)"
                tick={AXIS_STYLE}
                tickFormatter={(v) => formatUsd(v as number, 0)}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: "var(--up)", strokeOpacity: 0.3 }}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 0,
                  fontSize: 12,
                  color: "var(--ink)",
                  padding: "8px 10px",
                }}
                labelStyle={{
                  color: "var(--ink-faint)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  marginBottom: 4,
                }}
                formatter={(v: number) => [formatUsd(v), "DEGEN vol"]}
              />
              <Line
                type="monotone"
                dataKey="degenVolumeUsd"
                stroke="var(--up)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Panel>
  );
}

function LegendDot() {
  return (
    <span className="flex items-center gap-3">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[var(--pov)]" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
          POV
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[var(--up)]" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
          DEGEN
        </span>
      </span>
    </span>
  );
}
