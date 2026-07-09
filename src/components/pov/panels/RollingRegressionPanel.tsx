import { Panel } from "../primitives/Panel";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { JoinedRow } from "@/lib/pov/correlations";
import { rollingRegression } from "@/lib/pov/correlations";

interface Props {
  rows: JoinedRow[];
  windowHours?: number;
}

const AXIS_STYLE = {
  fontSize: 10,
  fill: "var(--ink-faint)",
  letterSpacing: "0.14em",
};

export function RollingRegressionPanel({ rows, windowHours = 24 }: Props) {
  const series = useMemo(
    () => rollingRegression(rows, windowHours),
    [rows, windowHours],
  );
  const data = useMemo(
    () =>
      series.map((p) => ({
        hour: p.hour,
        label: new Date(p.hour * 1000).toLocaleString([], {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
        }),
        slope: p.slope * 1e4, // scale for readability (return per event × 10⁴)
        r2: p.r2,
      })),
    [series],
  );
  const last = series[series.length - 1];

  return (
    <Panel
      title={`Rolling OLS · ${windowHours}h window`}
      meta="return ~ povEvents"
      action={
        last ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
            β {(last.slope * 1e4).toFixed(2)}×10⁻⁴ · R² {last.r2.toFixed(2)}
          </span>
        ) : null
      }
      bodyClassName="p-0"
    >
      <div className="h-[240px] px-2 py-3">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Need ≥ {windowHours}h of joined data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 48, bottom: 8, left: 48 }}
            >
              <CartesianGrid stroke="var(--line-dim)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                interval="preserveStartEnd"
                minTickGap={60}
              />
              <YAxis
                yAxisId="slope"
                orientation="left"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                width={56}
                tickFormatter={(v) => `${(v as number).toFixed(1)}`}
              />
              <YAxis
                yAxisId="r2"
                orientation="right"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                domain={[0, 1]}
                width={40}
                tickFormatter={(v) => (v as number).toFixed(1)}
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
                formatter={(v: number, name: string) => {
                  if (name === "r2") return [(v as number).toFixed(3), "R²"];
                  return [`${(v as number).toFixed(2)}×10⁻⁴`, "β (slope)"];
                }}
              />
              <ReferenceLine yAxisId="slope" y={0} stroke="var(--line)" />
              <Line
                yAxisId="slope"
                type="monotone"
                dataKey="slope"
                stroke="var(--pov)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="r2"
                type="monotone"
                dataKey="r2"
                stroke="var(--ink-dim)"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
