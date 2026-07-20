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

function ProfitBar({
  moneyIn, worthNow, denom, degenUsd,
}: { moneyIn: number; worthNow: number; denom: Denom; degenUsd: number | null }) {
  const winning = worthNow >= moneyIn;
  const max = Math.max(moneyIn, worthNow, 1);
  const basePct = (Math.min(moneyIn, worthNow) / max) * 100;
  const deltaPct = ((Math.max(moneyIn, worthNow) - Math.min(moneyIn, worthNow)) / max) * 100;
  const deltaColor = winning ? GREEN : RED;
  return (
    <div className="mt-4">
      <div className="flex h-3 w-full overflow-hidden border border-[var(--line)]">
        <div
          style={{ width: `${basePct}%`, background: "var(--ink-dim)" }}
          title={`money in: ${fmt(moneyIn, denom, degenUsd)}`}
        />
        <div
          style={{ width: `${deltaPct}%`, background: deltaColor }}
          title={`${winning ? "profit" : "loss"}: ${fmt(Math.abs(worthNow - moneyIn), denom, degenUsd)}`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
        <span>money in {fmt(moneyIn, denom, degenUsd)}</span>
        <span style={{ color: deltaColor }}>
          {winning ? "+" : "−"}{fmt(Math.abs(worthNow - moneyIn), denom, degenUsd)} {winning ? "profit" : "loss"}
        </span>
        <span>worth now {fmt(worthNow, denom, degenUsd)}</span>
      </div>
    </div>
  );
}

export function WalletCashFlowPanel({ address }: { address: string }) {
  const { data, isLoading, error } = useApiWalletCashflow(address);
  const [denom, setDenom] = useState<Denom>("usd");
  const [filter, setFilter] = useState<"all" | "external">("external");
  const [showMath, setShowMath] = useState(false);

  const s = data?.summary;
  const degenUsd = s?.degen_usd ?? null;
  const effectiveDenom: Denom = denom === "degen" && !degenUsd ? "usd" : denom;
  const label = effectiveDenom === "usd" ? "USD" : "DEGEN";

  if (error) {
    return (
      <Panel title="Performance" meta="error" bodyClassName="p-4">
        <p className="text-[14px] text-[var(--down)]">
          Couldn't load performance. Blockscout may be rate-limiting — try again in a moment.
        </p>
      </Panel>
    );
  }

  if (isLoading || !s || !data) {
    return (
      <Panel
        title="Performance"
        meta="what you put in vs. what it's worth"
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

  const moneyIn = s.net_deposits_usd ?? 0;
  const worthNow = s.total_value_usd ?? 0;
  const profit = worthNow - moneyIn;
  const winning = profit >= 0;
  const returnPct = s.roi == null ? null : s.roi * 100;

  // Plain-English "why"
  const positions = s.positions_value_usd ?? 0;
  const cash = s.cash_available_usd ?? 0;
  const openShare = worthNow > 0 ? positions / worthNow : 0;
  let whySentence = "";
  if (openShare > 0.6) {
    whySentence = `Most of your value (${fmt(positions, effectiveDenom, degenUsd)}) is still in open POV positions — this number can move as prices change.`;
  } else if (positions > 0) {
    whySentence = `You still hold ${fmt(positions, effectiveDenom, degenUsd)} in open positions, plus ${fmt(cash, effectiveDenom, degenUsd)} in cash.`;
  } else {
    whySentence = `All of your value is now in cash — no open POV positions.`;
  }

  return (
    <Panel
      title="Performance"
      meta={`updated ${timeAgo(new Date(data.computedAt).getTime())} ago · priced in ${label}`}
      bodyClassName="p-0"
      action={<DenomToggle denom={denom} onChange={setDenom} disabled={!degenUsd} />}
    >
      {/* Hero */}
      <div className="border-b border-[var(--line-dim)] px-4 py-5">
        <div className="text-[14px] leading-relaxed text-[var(--ink)]">
          You put in{" "}
          <span className="font-semibold tabular-nums">{fmt(moneyIn, effectiveDenom, degenUsd)}</span>.
          It's worth{" "}
          <span className="font-semibold tabular-nums">{fmt(worthNow, effectiveDenom, degenUsd)}</span>{" "}
          today.
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="text-[40px] font-semibold leading-none tabular-nums"
            style={{ color: signColor(profit) }}
          >
            {winning ? "+" : "−"}{fmt(Math.abs(profit), effectiveDenom, degenUsd)}
          </span>
          {returnPct != null && (
            <span
              className="text-[20px] font-semibold tabular-nums"
              style={{ color: signColor(profit) }}
            >
              ({winning ? "+" : ""}{formatPct(returnPct, 1)})
            </span>
          )}
          <span className="text-[13px] text-[var(--ink-dim)]">
            {winning ? "profit" : "loss"} so far
          </span>
        </div>

        <ProfitBar moneyIn={moneyIn} worthNow={worthNow} denom={effectiveDenom} degenUsd={degenUsd} />

        <div className="mt-3 text-[13px] leading-snug text-[var(--ink-dim)]">
          {whySentence}
        </div>

        <button
          type="button"
          onClick={() => setShowMath((v) => !v)}
          className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
        >
          {showMath ? "− Hide the math" : "+ Show the math"}
        </button>
      </div>

      {showMath && (
        <>
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
        </>
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
