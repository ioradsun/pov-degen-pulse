import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatEthAmount, formatUsd } from "@/lib/pov/format";
import type { WalletTimelinePoint } from "@/lib/pov/wallet";

type Denom = "eth" | "usd";

const fmt = (eth: number, denom: Denom, ethUsd?: number) => {
  if (denom === "usd" && ethUsd) {
    const usd = eth * ethUsd;
    return formatUsd(usd, Math.abs(usd) >= 1 ? 2 : 4);
  }
  return formatEthAmount(eth);
};

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

interface Row {
  date: string;
  net: number;
  realized: number;
  unrealized: number;
}

/**
 * Value over time for a wallet: net P&L (solid) and realized-only (faint), so
 * banked vs. paper is visible. Holdings are marked at each day's last trade
 * price — an estimate, so the realized line is the trustworthy one.
 */
export function WalletTimelineChart({
  points,
  denom,
  ethUsd,
  loading,
}: {
  points: WalletTimelinePoint[] | undefined;
  denom: Denom;
  ethUsd?: number;
  loading?: boolean;
}) {
  const scale = denom === "usd" && ethUsd ? ethUsd : 1;
  const data: Row[] = useMemo(
    () =>
      (points ?? []).map((p) => ({
        date: p.snapshot_date,
        net: p.net_eth * scale,
        realized: p.realized_eth * scale,
        unrealized: p.unrealized_eth * scale,
      })),
    [points, scale],
  );

  return (
    <Panel title="Performance over time" meta="net P&L · daily" bodyClassName="p-0">
      {loading ? (
        <div className="p-4">
          <Skeleton className="h-[200px] w-full" />
        </div>
      ) : data.length < 2 ? (
        <div className="p-4 text-[13px] text-[var(--ink-dim)]">
          {data.length === 0
            ? "No history yet."
            : "The timeline fills in daily — check back tomorrow for the trend."}
        </div>
      ) : (
        <div className="px-2 py-3">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--pov)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--pov)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--line-dim)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                minTickGap={28}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={44}
                tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                tickFormatter={(v: number) =>
                  denom === "usd" ? `$${Math.round(v)}` : `${(+v).toFixed(2)}`
                }
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as Row;
                  return (
                    <div className="rounded-sm border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] shadow-md">
                      <div className="mb-1 font-medium text-[var(--ink)]">{shortDate(r.date)}</div>
                      <div className="tabular-nums text-[var(--ink)]">
                        {fmt(r.net / scale, denom, ethUsd)} net
                      </div>
                      <div className="tabular-nums text-[var(--ink-dim)]">
                        {fmt(r.realized / scale, denom, ethUsd)} realized ·{" "}
                        {fmt(r.unrealized / scale, denom, ethUsd)} paper
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="net"
                stroke="var(--pov)"
                strokeWidth={2}
                fill="url(#netFill)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="realized"
                stroke="var(--ink-dim)"
                strokeWidth={1}
                strokeDasharray="3 3"
                fill="none"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="px-2 pt-1 text-[11px] text-[var(--ink-faint)]">
            Solid = net (incl. paper) · dashed = realized only. Holdings marked at last trade price —
            estimated.
          </div>
        </div>
      )}
    </Panel>
  );
}
