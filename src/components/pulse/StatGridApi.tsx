import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Metric } from "@/components/pov/primitives/Metric";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatEthAmount, formatPct, formatUsd } from "@/lib/pov/format";
import { RANGES, RANGE_META, RANGE_TITLE, type Range } from "@/lib/pov/ranges";
import { useApiHeadline, useApiRetention, useApiPnlHeadline } from "@/hooks/pov/useApiPulse";
import { MetricHistoryDialog, type MetricKey } from "./MetricHistoryDialog";

type Denom = "usd" | "eth";

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
}

export function StatGridApi({ range, onRangeChange }: StatGridApiProps) {
  const [denom, setDenom] = useState<Denom>("usd");
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);

  const { data, isLoading } = useApiHeadline(range);
  const { data: retention, isLoading: isLoadingRetention } = useApiRetention();
  const { data: pnl, isLoading: isLoadingPnl } = useApiPnlHeadline(range);

  const fmt = (n: number) => (denom === "usd" ? formatUsd(n, 0) : formatEthAmount(n));
  const unit = denom === "usd" ? "USD" : "ETH";

  const vol = Number(
    (denom === "usd" ? data?.buy_volume_usd : data?.buy_volume_eth) ?? 0,
  );
  const volPrev = denom === "usd" ? data?.buy_volume_usd_prev : data?.buy_volume_eth_prev;
  const creatorRev = Number(
    (denom === "usd" ? data?.creator_revenue_usd : data?.creator_revenue_eth) ?? 0,
  );
  const creatorRevPrev =
    denom === "usd" ? data?.creator_revenue_usd_prev : data?.creator_revenue_eth_prev;
  const degenAlloc = Number(
    (denom === "usd" ? data?.degen_allocation_usd : data?.degen_allocation_eth) ?? 0,
  );
  const degenAllocPrev =
    denom === "usd" ? data?.degen_allocation_usd_prev : data?.degen_allocation_eth_prev;

  const traders = Number(data?.active_traders ?? 0);
  const created = Number(data?.new_beliefs ?? 0);
  const transactions = Number(data?.transactions ?? 0);
  const txPerWallet = traders > 0 ? transactions / traders : null;
  const repeatRate = retention?.repeat_rate;
  const repeatWallets = retention?.repeat_wallets ?? 0;
  const newWallets = retention?.new_wallets ?? 0;
  const rangeLabel = RANGE_META[range];

  const volDelta = pctDelta(vol, volPrev);
  const tradersDelta = pctDelta(traders, data?.active_traders_prev);
  const createdDelta = pctDelta(created, data?.new_beliefs_prev);
  const transactionsDelta = pctDelta(transactions, data?.transactions_prev);
  const creatorRevDelta = pctDelta(creatorRev, creatorRevPrev);
  const degenAllocDelta = pctDelta(degenAlloc, degenAllocPrev);

  const realized = Number((denom === "usd" ? pnl?.realized_usd : pnl?.realized_eth) ?? 0);
  const realizedPrev = denom === "usd" ? pnl?.realized_usd_prev : pnl?.realized_eth_prev;
  const realizedDelta = pctDelta(realized, realizedPrev);
  const realizedExits = Number(pnl?.exits ?? 0);
  const realizedCls =
    realized > 0 ? "text-[var(--up)]" : realized < 0 ? "text-[var(--down)]" : "text-[var(--ink)]";

  const action = (
    <div className="flex items-center gap-2">
      <div role="tablist" aria-label="Denomination" className="flex items-center gap-1">
        {(["usd", "eth"] as const).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={denom === d}
            onClick={() => setDenom(d)}
            className={clsx(
              "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] transition-colors",
              denom === d
                ? "border-[var(--boost)]/60 bg-[var(--boost)]/10 text-[var(--boost)]"
                : "border-[var(--line)] text-[var(--ink-dim)] hover:text-[var(--ink)]",
            )}
          >
            {d}
          </button>
        ))}
      </div>
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
    </div>
  );

  return (
    <Panel
      title={RANGE_TITLE[range]}
      meta={isLoading ? "loading…" : undefined}
      action={action}
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4 lg:grid-cols-8">
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


        <MetricButton onClick={() => setOpenMetric("creator_revenue")}>
          <Metric
            label="Creator revenue"
            value={isLoading ? <Skeleton className="h-6 w-20" /> : fmt(creatorRev)}
            delta={<Delta pct={creatorRevDelta} rangeLabel={rangeLabel} />}
            sub="3.33% of buy volume · view 24h ↗"
          />
        </MetricButton>

        <MetricButton onClick={() => setOpenMetric("degen_allocation")}>
          <Metric
            label="DEGEN allocation"
            value={
              isLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <span className="text-[var(--boost)]">{fmt(degenAlloc)}</span>
              )
            }
            delta={<Delta pct={degenAllocDelta} rangeLabel={rangeLabel} />}
            sub="5% of buy volume · view 24h ↗"
          />
        </MetricButton>

        <Metric
          label="Repeat traders"
          value={
            isLoadingRetention ? (
              <Skeleton className="h-6 w-14" />
            ) : (
              <span className="text-[var(--pov)]">
                {repeatRate == null ? "—" : `${Math.round(repeatRate * 100)}%`}
              </span>
            )
          }
          sub={
            isLoadingRetention
              ? "loading wallet history…"
              : newWallets > 0
                ? `${repeatWallets} of ${newWallets} returned within 7 days`
                : "No wallets older than 24h yet"
          }
        />
      </div>
      <MetricHistoryDialog
        metric={openMetric}
        denom={denom}
        onClose={() => setOpenMetric(null)}
      />
    </Panel>
  );

}
