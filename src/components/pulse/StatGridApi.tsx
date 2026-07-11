import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Metric } from "@/components/pov/primitives/Metric";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatEthAmount, formatPct, formatUsd, type Currency } from "@/lib/pov/format";
import { RANGES, RANGE_META, RANGE_TITLE, type Range } from "@/lib/pov/ranges";
import { useApiHeadline } from "@/hooks/pov/useApiPulse";
import { MetricHistoryDialog, type MetricKey } from "./MetricHistoryDialog";

function MetricButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left transition-colors hover:bg-[var(--line-dim)]/40 focus:outline-none focus-visible:bg-[var(--line-dim)]/60"
      aria-label="Show 24h history"
    >
      {children}
    </button>
  );
}

function pctDelta(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function Delta({ pct, rangeLabel }: { pct: number | null; rangeLabel: string }) {
  if (pct == null) return null;
  const cls =
    pct > 0 ? "text-[var(--up)]" : pct < 0 ? "text-[var(--down)]" : "text-[var(--ink-dim)]";
  return (
    <span className={clsx("tabular-nums", cls)} title={`vs previous ${rangeLabel}`}>
      {formatPct(pct, 0)}
    </span>
  );
}

interface StatGridApiProps {
  range: Range;
  onRangeChange: (range: Range) => void;
  currency: Currency;
}

/** Section 1 — "what's happening": pure activity, one range, one currency. */
export function StatGridApi({ range, onRangeChange, currency }: StatGridApiProps) {
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);


  const { data, isLoading } = useApiHeadline(range);

  const fmt = (n: number) => (currency === "usd" ? formatUsd(n, 0) : formatEthAmount(n));
  const unit = currency === "usd" ? "USD" : "ETH";

  const vol = Number((currency === "usd" ? data?.buy_volume_usd : data?.buy_volume_eth) ?? 0);
  const volPrev = currency === "usd" ? data?.buy_volume_usd_prev : data?.buy_volume_eth_prev;

  const traders = Number(data?.active_traders ?? 0);
  const created = Number(data?.new_beliefs ?? 0);
  const transactions = Number(data?.transactions ?? 0);
  const txPerWallet = traders > 0 ? transactions / traders : null;
  const rangeLabel = RANGE_META[range];

  const volDelta = pctDelta(vol, volPrev);
  const tradersDelta = pctDelta(traders, data?.active_traders_prev);
  const createdDelta = pctDelta(created, data?.new_beliefs_prev);
  const transactionsDelta = pctDelta(transactions, data?.transactions_prev);

  const action = (
    <div role="tablist" aria-label="Timeframe" className="flex items-center gap-1">
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={range === r.key}
          onClick={() => onRangeChange(r.key)}
          className={clsx(
            "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] transition-colors",
            range === r.key
              ? "border-[var(--pov)]/60 bg-[var(--pov)]/10 text-[var(--pov)]"
              : "border-[var(--line)] text-[var(--ink-dim)] hover:text-[var(--ink)]",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );


  return (
    <Panel
      title={RANGE_TITLE[range]}
      meta={isLoading ? "loading…" : "what's happening"}
      action={action}
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
        <MetricButton onClick={() => setOpenMetric("buy_volume")}>
          <Metric
            label="Buy volume"
            value={
              isLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <span className="text-[var(--pov)]">{fmt(vol)}</span>
              )
            }
            delta={<Delta pct={volDelta} rangeLabel={rangeLabel} />}
            sub={`all buys · ${unit} · view 24h ↗`}
          />
        </MetricButton>

        <MetricButton onClick={() => setOpenMetric("active_traders")}>
          <Metric
            label="Active wallets"
            value={
              isLoading ? (
                <Skeleton className="h-6 w-14" />
              ) : (
                <span className="text-[var(--up)]">{traders}</span>
              )
            }
            delta={<Delta pct={tradersDelta} rangeLabel={rangeLabel} />}
            sub="unique participants · view 24h ↗"
          />
        </MetricButton>

        <MetricButton onClick={() => setOpenMetric("transactions")}>
          <Metric
            label="Transactions"
            value={
              isLoading ? (
                <Skeleton className="h-6 w-14" />
              ) : (
                <span className="tabular-nums">{transactions.toLocaleString()}</span>
              )
            }
            delta={<Delta pct={transactionsDelta} rangeLabel={rangeLabel} />}
            sub={
              isLoading
                ? "…"
                : txPerWallet == null
                  ? "buys · view 24h ↗"
                  : `${txPerWallet.toFixed(1)} per wallet · view 24h ↗`
            }
          />
        </MetricButton>

        <MetricButton onClick={() => setOpenMetric("new_beliefs")}>
          <Metric
            label="New beliefs"
            value={isLoading ? <Skeleton className="h-6 w-12" /> : created}
            delta={<Delta pct={createdDelta} rangeLabel={rangeLabel} />}
            sub="markets created · view 24h ↗"
          />
        </MetricButton>
      </div>
      <MetricHistoryDialog metric={openMetric} denom={currency} onClose={() => setOpenMetric(null)} />
    </Panel>
  );
}
