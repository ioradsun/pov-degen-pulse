import { useMemo } from "react";
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "@/components/pov/primitives/Panel";
import type { PulseBucket } from "@/lib/pov/pulse";
import { formatDegenPrice, formatUsd, usdToEthPrice, type Currency } from "@/lib/pov/format";

interface RhythmChartProps {
  buckets: PulseBucket[];
  currency: Currency;
  ethUsd?: number;
  granularity: "hour" | "day";
  rangeLabel: string;
}

interface Row {
  label: string;
  buyVolumeUsd: number;
  trades: number;
  created: number;
  degen: number | null;
}

function bucketLabel(ts: number, granularity: "hour" | "day"): string {
  const d = new Date(ts * 1000);
  return granularity === "hour"
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RhythmChart({
  buckets,
  currency,
  ethUsd,
  granularity,
  rangeLabel,
}: RhythmChartProps) {
  const rows = useMemo<Row[]>(
    () =>
      buckets.map((b) => ({
        label: bucketLabel(b.ts, granularity),
        buyVolumeUsd: Number(b.buyVolumeUsd.toFixed(2)),
        trades: b.buys + b.sells,
        created: b.created,
        degen: currency === "eth" ? usdToEthPrice(b.degenPriceUsd, ethUsd) : b.degenPriceUsd,
      })),
    [buckets, currency, ethUsd, granularity],
  );

  const hasDegen = rows.some((r) => r.degen != null);
  const tickInterval = Math.max(0, Math.ceil(rows.length / 8) - 1);

  return (
    <Panel
      title="The pulse"
      meta={`${granularity === "hour" ? "hourly" : "daily"} · ${rangeLabel}`}
      action={
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-[var(--pov)]" /> POV buy volume (USD)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[var(--degen)]" /> DEGEN price (
            {currency === "usd" ? "USD" : "ETH"})
          </span>
        </span>
      }
      bodyClassName="p-2 pt-4"
    >
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--ink-faint)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              interval={tickInterval}
            />
            <YAxis
              yAxisId="pov"
              tick={{ fill: "var(--ink-faint)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => formatUsd(v, 0)}
            />
            <YAxis
              yAxisId="degen"
              orientation="right"
              domain={["auto", "auto"]}
              tick={{ fill: "var(--degen)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={currency === "eth" ? 84 : 72}
              tickFormatter={(v: number) =>
                currency === "eth" ? v.toFixed(8) : formatDegenPrice(v, currency)
              }
              hide={!hasDegen}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)", opacity: 0.5 }}
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                fontSize: 11,
                fontFamily: "inherit",
              }}
              labelStyle={{ color: "var(--ink-dim)" }}
              formatter={(value: number, name: string) => {
                if (name === "buyVolumeUsd") return [formatUsd(value, 0), "POV buy volume"];
                if (name === "degen") return [formatDegenPrice(value, currency), "DEGEN"];
                if (name === "created") return [value, "beliefs created"];
                return [value, name];
              }}
            />
            <Bar
              yAxisId="pov"
              dataKey="buyVolumeUsd"
              fill="var(--pov)"
              opacity={0.85}
              maxBarSize={20}
            />
            <Bar yAxisId="pov" dataKey="created" fill="var(--info)" opacity={0.7} maxBarSize={20} />
            {hasDegen && (
              <Line
                yAxisId="degen"
                dataKey="degen"
                stroke="var(--degen)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="px-2 pb-1 pt-2 text-[11px] leading-relaxed text-[var(--ink-dim)]">
        Purple bars are USD buy volume moving through POV beliefs each {granularity}; blue slivers
        are new beliefs. The gold line is DEGEN's price — POV trading fees buy and burn DEGEN, so
        sustained purple should eventually pull gold up.
      </p>
    </Panel>
  );
}
