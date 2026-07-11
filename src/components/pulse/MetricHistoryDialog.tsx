import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { useApiRhythm, type RhythmBucket } from "@/hooks/pov/useApiPulse";
import { formatEthAmount, formatUsd } from "@/lib/pov/format";

export type MetricKey =
  | "buy_volume"
  | "new_beliefs"
  | "active_traders"
  | "creator_revenue"
  | "degen_allocation";

export type Denom = "usd" | "eth";

interface Props {
  metric: MetricKey | null;
  denom: Denom;
  onClose: () => void;
}

const LABELS: Record<MetricKey, string> = {
  buy_volume: "Buy volume",
  new_beliefs: "New beliefs",
  active_traders: "Active traders",
  creator_revenue: "Creator revenue",
  degen_allocation: "DEGEN allocation",
};

function extract(b: RhythmBucket, metric: MetricKey, denom: Denom): number {
  switch (metric) {
    case "buy_volume":
      return denom === "usd" ? b.buy_volume_usd : b.buy_volume_eth;
    case "new_beliefs":
      return b.created;
    case "active_traders":
      return b.active_traders;
    case "creator_revenue": {
      const v = denom === "usd" ? b.buy_volume_usd : b.buy_volume_eth;
      return v * 0.1 * 0.3333;
    }
    case "degen_allocation": {
      const v = denom === "usd" ? b.buy_volume_usd : b.buy_volume_eth;
      return v * 0.1 * 0.5;
    }
  }
}

function fmtValue(v: number, metric: MetricKey, denom: Denom): string {
  if (metric === "new_beliefs" || metric === "active_traders") return String(Math.round(v));
  return denom === "usd" ? formatUsd(v, 2) : formatEthAmount(v);
}

export function MetricHistoryDialog({ metric, denom, onClose }: Props) {
  const open = metric !== null;
  const { data, isLoading } = useApiRhythm("24h");

  const rows = useMemo(() => {
    if (!metric || !data) return [];
    return data.buckets.map((b) => ({
      ts: b.bucket,
      label: new Date(b.bucket).toLocaleTimeString(undefined, {
        hour: "2-digit",
      }),
      value: Number(extract(b, metric, denom).toFixed(4)),
    }));
  }, [data, metric, denom]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.value, 0), [rows]);
  const peak = useMemo(() => rows.reduce((m, r) => Math.max(m, r.value), 0), [rows]);
  const trendLabel = useMemo(() => {
    if (rows.length < 2) return null;
    const half = Math.floor(rows.length / 2);
    const first = rows.slice(0, half).reduce((s, r) => s + r.value, 0);
    const second = rows.slice(half).reduce((s, r) => s + r.value, 0);
    if (first === 0) return second > 0 ? "rising" : "flat";
    const pct = ((second - first) / first) * 100;
    if (Math.abs(pct) < 5) return "flat";
    return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs first half`;
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--ink)]">
            {metric ? LABELS[metric] : ""} — last 24 hours
          </DialogTitle>
          <DialogDescription className="text-[var(--ink-dim)]">
            Hourly buckets. Newest on the right.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 border-y border-[var(--line-dim)] py-3 text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
          <div>
            <div>Total</div>
            <div className="mt-1 text-[16px] tabular-nums text-[var(--ink)]">
              {metric ? fmtValue(total, metric, denom) : "—"}
            </div>
          </div>
          <div>
            <div>Peak hour</div>
            <div className="mt-1 text-[16px] tabular-nums text-[var(--ink)]">
              {metric ? fmtValue(peak, metric, denom) : "—"}
            </div>
          </div>
          <div>
            <div>Trend</div>
            <div className="mt-1 text-[16px] tabular-nums text-[var(--pov)]">
              {trendLabel ?? "—"}
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--pov)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--pov)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--ink-faint)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--line-dim)" }}
                  tickLine={false}
                  interval={Math.max(0, Math.ceil(rows.length / 8) - 1)}
                />
                <YAxis
                  tick={{ fill: "var(--ink-faint)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    color: "var(--ink)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => (metric ? fmtValue(v, metric, denom) : v)}
                  labelFormatter={(l) => `Hour ${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--pov)"
                  strokeWidth={2}
                  fill="url(#metricFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
