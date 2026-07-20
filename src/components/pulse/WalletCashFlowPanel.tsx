import { useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatUsd, formatCompact, formatPct, shortAddr, timeAgo } from "@/lib/pov/format";
import { BASESCAN_TX, BASESCAN_ADDR } from "@/lib/pov/constants";
import { useApiWalletCashflow, type CashFlowTransfer } from "@/hooks/pov/useApiPulse";

type Denom = "usd" | "degen";

const GREEN = "var(--up)";
const RED = "var(--down)";
const signColor = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : "var(--ink-dim)");

function fmt(usd: number | null | undefined, denom: Denom, degenUsd: number | null): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (denom === "usd") return formatUsd(usd, Math.abs(usd) >= 1 ? 2 : 4);
  if (!degenUsd) return "—";
  return `${formatCompact(usd / degenUsd)} DEGEN`;
}

function Tile({
  label, value, color, sub,
}: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">{label}</span>
      <span
        className="text-[22px] font-semibold leading-none tabular-nums"
        style={{ color: color ?? "var(--ink)" }}
      >
        {value}
      </span>
      {sub && <span className="text-[11px] text-[var(--ink-dim)]">{sub}</span>}
    </div>
  );
}

function DenomToggle({ denom, onChange, disabled }: { denom: Denom; onChange: (d: Denom) => void; disabled?: boolean }) {
  return (
    <div
      className={clsx(
        "flex items-center border border-[var(--line)] text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]",
        disabled && "opacity-50",
      )}
      title="Switch between USD and DEGEN — DEGEN strips out DEGEN's own price swings"
    >
      <button
        type="button"
        onClick={() => onChange("usd")}
        className={clsx("px-2 py-[2px] transition-colors", denom === "usd" && "bg-[var(--pov)] text-[var(--bg)]")}
      >
        USD
      </button>
      <button
        type="button"
        onClick={() => onChange("degen")}
        disabled={disabled}
        className={clsx("px-2 py-[2px] transition-colors", denom === "degen" && "bg-[var(--pov)] text-[var(--bg)]")}
      >
        DEGEN
      </button>
    </div>
  );
}

const classBadge = (c: CashFlowTransfer["classification"]) => {
  if (c === "deposit") return { label: "Deposit", color: GREEN };
  if (c === "withdrawal") return { label: "Withdraw", color: RED };
  return { label: "Internal", color: "var(--ink-dim)" };
};

export function WalletCashFlowPanel({ address }: { address: string }) {
  const { data, isLoading, error } = useApiWalletCashflow(address);
  const [denom, setDenom] = useState<Denom>("usd");
  const [filter, setFilter] = useState<"all" | "external">("external");

  const s = data?.summary;
  const degenUsd = s?.degen_usd ?? null;
  const effectiveDenom: Denom = denom === "degen" && !degenUsd ? "usd" : denom;
  const label = effectiveDenom === "usd" ? "USD" : "DEGEN";

  if (error) {
    return (
      <Panel title="Cash flow" meta="error" bodyClassName="p-4">
        <p className="text-[14px] text-[var(--down)]">
          Couldn't load cash flow. Blockscout may be rate-limiting — try again in a moment.
        </p>
      </Panel>
    );
  }

  if (isLoading || !s || !data) {
    return (
      <Panel
        title="Cash flow"
        meta="what actually went in vs. what it's worth now"
        bodyClassName="p-4"
        action={<DenomToggle denom={denom} onChange={setDenom} disabled />}
      >
        <Skeleton className="h-8 w-64" />
      </Panel>
    );
  }

  const transfers = filter === "external"
    ? data.transfers.filter((t) => t.classification !== "internal")
    : data.transfers;

  return (
    <Panel
      title="Cash flow"
      meta={`external transfers only · priced in ${label} · updated ${timeAgo(new Date(data.computedAt).getTime())} ago`}
      bodyClassName="p-0"
      action={<DenomToggle denom={denom} onChange={setDenom} disabled={!degenUsd} />}
    >
      {/* Headline */}
      <div className="border-b border-[var(--line-dim)] px-4 py-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-[34px] font-semibold leading-none tabular-nums"
                style={{ color: signColor(s.net_pnl_usd) }}
              >
                {fmt(s.net_pnl_usd, effectiveDenom, degenUsd)}
              </span>
              <span className="text-[15px] text-[var(--ink)]">net cash-flow P&amp;L</span>
            </div>
            <div className="mt-1 text-[13px] text-[var(--ink-dim)]">
              (cash + positions) − net deposits · fees {fmt(s.fees_usd, effectiveDenom, degenUsd)}
            </div>
          </div>
          <div className="text-[13px] leading-tight text-[var(--ink-dim)]">
            <span
              className="text-[22px] font-semibold tabular-nums"
              style={{ color: s.roi == null ? "var(--ink)" : signColor(s.roi) }}
            >
              {s.roi == null ? "—" : formatPct(s.roi * 100, 1)}
            </span>{" "}
            ROI
            <div className="text-[11px] text-[var(--ink-faint)]">net P&amp;L ÷ net deposits</div>
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
        <Tile
          label="Net deposits"
          value={fmt(s.net_deposits_usd, effectiveDenom, degenUsd)}
          sub={`in ${fmt(s.deposits_usd, effectiveDenom, degenUsd)} · out ${fmt(s.withdrawals_usd, effectiveDenom, degenUsd)}`}
        />
        <Tile
          label="Cash available"
          value={fmt(s.cash_available_usd, effectiveDenom, degenUsd)}
          sub="wallet balances"
        />
        <Tile
          label="Positions value"
          value={fmt(s.positions_value_usd, effectiveDenom, degenUsd)}
          sub="POV markets, marked"
        />
        <Tile
          label="Total value"
          value={fmt(s.total_value_usd, effectiveDenom, degenUsd)}
          sub="cash + positions − fees"
        />
      </div>

      {/* Balances */}
      {data.balances.length > 0 && (
        <div className="border-t border-[var(--line-dim)] px-4 py-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Current wallet balances
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
            {data.balances.slice(0, 8).map((b) => (
              <div key={b.asset} className="flex items-baseline gap-2 tabular-nums">
                <span className="text-[var(--ink-dim)]">{b.symbol}</span>
                <span>{formatCompact(b.amount)}</span>
                <span className="text-[11px] text-[var(--ink-faint)]">
                  {b.valueUsd != null ? fmt(b.valueUsd, effectiveDenom, degenUsd) : "unpriced"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfers table */}
      <div className="border-t border-[var(--line-dim)]">
        <div className="flex items-center justify-between px-4 py-2 text-[11px] text-[var(--ink-dim)]">
          <span>{transfers.length} transfers</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilter("external")}
              className={clsx(
                "px-2 py-[2px] uppercase tracking-[0.14em]",
                filter === "external" ? "text-[var(--ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-dim)]",
              )}
            >
              external only
            </button>
            <span className="text-[var(--ink-faint)]">·</span>
            <button
              onClick={() => setFilter("all")}
              className={clsx(
                "px-2 py-[2px] uppercase tracking-[0.14em]",
                filter === "all" ? "text-[var(--ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-dim)]",
              )}
            >
              show internal
            </button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-[var(--bg)]">
              <tr className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Asset</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-left">Counterparty</th>
              </tr>
            </thead>
            <tbody>
              {transfers.slice(0, 200).map((t) => {
                const b = classBadge(t.classification);
                return (
                  <tr key={`${t.hash}-${t.asset}-${t.ts}-${t.direction}`} className="border-t border-[var(--line-dim)]">
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--ink-dim)]">
                      <a href={BASESCAN_TX(t.hash)} target="_blank" rel="noreferrer" className="hover:text-[var(--ink)]">
                        {timeAgo(t.ts * 1000)} ago
                      </a>
                    </td>
                    <td className="px-3 py-2" style={{ color: b.color }}>
                      {t.direction === "in" ? "↓ " : "↑ "}{b.label}
                    </td>
                    <td className="px-3 py-2 text-[var(--ink-dim)]">{t.symbol}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCompact(t.amount)}</td>
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      style={{ color: t.valueUsd == null ? "var(--ink-faint)" : "var(--ink)" }}
                    >
                      {t.valueUsd == null ? "—" : fmt(t.valueUsd, effectiveDenom, degenUsd)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[var(--ink-faint)]">
                      <a href={BASESCAN_ADDR(t.counterparty)} target="_blank" rel="noreferrer" className="hover:text-[var(--ink-dim)]">
                        {shortAddr(t.counterparty, 4)}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {transfers.length === 0 && (
            <div className="px-4 py-6 text-[13px] text-[var(--ink-dim)]">
              No {filter === "external" ? "external " : ""}transfers found.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
