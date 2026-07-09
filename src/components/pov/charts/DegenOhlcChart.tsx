import { Panel } from "../primitives/Panel";
import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  Bar,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatUsd } from "@/lib/pov/format";
import type { OhlcBar } from "@/lib/pov/geckoterminal";

interface Props {
  bars: OhlcBar[];
  loading?: boolean;
}

const AXIS_STYLE = {
  fontSize: 10,
  fill: "var(--ink-faint)",
  letterSpacing: "0.14em",
};

export function DegenOhlcChart({ bars, loading }: Props) {
  const data = useMemo(
    () =>
      bars.map((b) => ({
        hour: b.ts,
        label: new Date(b.ts * 1000).toLocaleString([], {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
        }),
        close: b.close,
        volumeUsd: b.volumeUsd,
      })),
    [bars],
  );

  return (
    <Panel
      title="DEGEN price & volume · hourly"
      meta={bars.length ? `${bars.length}h · GeckoTerminal` : "—"}
      bodyClassName="p-0"
    >
      <div className="h-[280px] px-2 py-3">
        {loading && !bars.length ? (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Loading OHLC…
          </div>
        ) : !bars.length ? (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            No OHLC available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 16, left: 48 }}>
              <defs>
                <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ink-dim)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--ink-dim)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line-dim)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                interval="preserveStartEnd"
                minTickGap={60}
              />
              <YAxis
                yAxisId="price"
                orientation="left"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                tickFormatter={(v) => formatUsd(v as number, 4)}
                width={64}
                domain={["auto", "auto"]}
              />
              <YAxis
                yAxisId="vol"
                orientation="right"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                tickFormatter={(v) => formatCompact(v as number)}
                width={44}
              />
              <Tooltip
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
                formatter={(value: number, name: string) => {
                  if (name === "close") return [formatUsd(value, 5), "DEGEN"];
                  return [formatUsd(value, 0), "Volume"];
                }}
              />
              <Area
                yAxisId="vol"
                type="monotone"
                dataKey="volumeUsd"
                stroke="none"
                fill="url(#volFill)"
                isAnimationActive={false}
              />
              <Bar
                yAxisId="vol"
                dataKey="volumeUsd"
                fill="var(--ink-dim)"
                fillOpacity={0.25}
                isAnimationActive={false}
              />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="close"
                stroke="var(--up)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
