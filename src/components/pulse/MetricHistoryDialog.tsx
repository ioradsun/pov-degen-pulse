import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import {
  useApiActivityBuckets,
  type HistoryGranularity,
  type RhythmBucket,
} from "@/hooks/pov/useApiPulse";
import { formatEthAmount, formatUsd } from "@/lib/pov/format";

export type MetricKey = "buy_volume" | "new_beliefs" | "active_traders" | "transactions";

export type Denom = "usd" | "eth";

interface Props {
  metric: MetricKey | null;
  denom: Denom;
  onClose: () => void;
}

const LABELS: Record<MetricKey, string> = {
  buy_volume: "Buy volume",
  new_beliefs: "New beliefs",
  active_traders: "Active wallets",
  transactions: "Transactions",
};


const GRANULARITIES: Array<{
  key: HistoryGranularity;
  label: string;
  buckets: number;
  windowLabel: string;
}> = [
  { key: "hour", label: "HR", buckets: 24, windowLabel: "last 24 hours" },
  { key: "day", label: "DAY", buckets: 14, windowLabel: "last 14 days" },
  { key: "week", label: "WEEK", buckets: 12, windowLabel: "last 12 weeks" },
  { key: "month", label: "MONTH", buckets: 12, windowLabel: "last 12 months" },
];

function extract(b: RhythmBucket, metric: MetricKey, denom: Denom): number {
  switch (metric) {
    case "buy_volume":
      return denom === "usd" ? b.buy_volume_usd : b.buy_volume_eth;
    case "new_beliefs":
      return b.created;
    case "active_traders":
      return b.active_traders;
    case "transactions":
      return b.buys;
  }
}

function fmtValue(v: number, metric: MetricKey, denom: Denom): string {
  if (metric === "new_beliefs" || metric === "active_traders" || metric === "transactions")
    return String(Math.round(v));
  return denom === "usd" ? formatUsd(v, 2) : formatEthAmount(v);
}

function bucketLabel(ts: string, g: HistoryGranularity): string {
  const d = new Date(ts);
  if (g === "hour") return d.toLocaleTimeString(undefined, { hour: "2-digit" });
  if (g === "month")
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MetricHistoryDialog({ metric, denom, onClose }: Props) {
  const open = metric !== null;
  const [granularity, setGranularity] = useState<HistoryGranularity>("hour");
  const gMeta = GRANULARITIES.find((g) => g.key === granularity)!;
  const activity = useApiActivityBuckets(granularity, gMeta.buckets);
  const isLoading = activity.isLoading;

  const rows = useMemo(() => {
    if (!metric) return [];
    const raw: Array<{ ts: string; v: number }> = (activity.data?.buckets ?? []).map((b) => ({
      ts: b.bucket,
      v: extract(b, metric, denom),
    }));
    const lastIdx = raw.length - 1;
    return raw.map(({ ts, v }, i) => {
      const rounded = Number(v.toFixed(4));
      const isCurrent = i === lastIdx;
      return {
        ts,
        label: bucketLabel(ts, granularity),
        value: isCurrent ? null : rounded,
        valuePartial: isCurrent || i === lastIdx - 1 ? rounded : null,
        isCurrent,
      };
    });
  }, [metric, activity.data, denom, granularity]);


  const total = useMemo(
    () => rows.reduce((s, r) => s + (r.value ?? r.valuePartial ?? 0), 0),
    [rows],
  );
  const peak = useMemo(() => {
    if (rows.length === 0) return 0;
    return rows.reduce((m, r) => {
      const v = r.value ?? r.valuePartial ?? 0;
      return Math.abs(v) > Math.abs(m) ? v : m;
    }, 0);
  }, [rows]);
  const trendLabel = useMemo(() => {
    if (rows.length < 2) return null;
    const vals = rows.map((r) => r.value ?? r.valuePartial ?? 0);
    const half = Math.floor(vals.length / 2);
    const first = vals.slice(0, half).reduce((s, v) => s + v, 0);
    const second = vals.slice(half).reduce((s, v) => s + v, 0);
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
            {metric ? LABELS[metric] : ""} — {gMeta.windowLabel}
          </DialogTitle>
          <DialogDescription className="text-[var(--ink-dim)]">
            Grouped by {granularity}. Newest on the right.
          </DialogDescription>
        </DialogHeader>

        <div
          role="tablist"
          aria-label="Granularity"
          className="flex items-center gap-1"
        >
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              role="tab"
              aria-selected={granularity === g.key}
              onClick={() => setGranularity(g.key)}
              className={clsx(
                "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] transition-colors",
                granularity === g.key
                  ? "border-[var(--pov)]/60 bg-[var(--pov)]/10 text-[var(--pov)]"
                  : "border-[var(--line)] text-[var(--ink-dim)] hover:text-[var(--ink)]",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 border-y border-[var(--line-dim)] py-3 text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
          <div>
            <div>Total</div>
            <div className="mt-1 text-[16px] tabular-nums text-[var(--ink)]">
              {metric ? fmtValue(total, metric, denom) : "—"}
            </div>
          </div>
          <div>
            <div>Peak {granularity}</div>
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
                  formatter={(v: number, _name, item) => {
                    if (v == null) return ["—", ""];
                    const label = metric ? fmtValue(v, metric, denom) : String(v);
                    const suffix =
                      item && (item.payload as { isCurrent?: boolean })?.isCurrent
                        ? ` · ${granularity} in progress`
                        : "";
                    return [label + suffix, ""];
                  }}
                  labelFormatter={(l) => String(l)}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--pov)"
                  strokeWidth={2}
                  fill="url(#metricFill)"
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="valuePartial"
                  stroke="var(--pov)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  strokeOpacity={0.85}
                  fill="url(#metricFill)"
                  fillOpacity={0.35}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
          <span
            aria-hidden
            className="inline-block h-[2px] w-4"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, var(--pov) 0 4px, transparent 4px 8px)",
            }}
          />
          Dashed = current {granularity} in progress
        </p>
      </DialogContent>
    </Dialog>
  );
}
