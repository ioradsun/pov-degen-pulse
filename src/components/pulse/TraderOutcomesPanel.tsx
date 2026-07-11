import { useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatUsd, type Currency } from "@/lib/pov/format";
import { RANGE_META, type Range } from "@/lib/pov/ranges";
import { useApiTraderOutcomes, type OutcomesSnapshot } from "@/hooks/pov/useApiPulse";

/**
 * Trader outcomes, cumulative and wallet-first.
 *
 * A wallet is one running ledger. We answer "is this person making money?" in
 * two honest halves:
 *   SOLD    — shares the wallet has already sold (realized, FIFO-matched).
 *   HOLDING — shares it still holds, valued at the last trade price (paper).
 * The headline is the cumulative state as of now; the small delta under each
 * number is the change over the selected timeframe (now vs one window ago).
 * Wins are decided in ETH (exact); USD is shown for readability.
 */

function fmtEth(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const digits = a >= 10 ? 1 : a >= 0.1 ? 3 : 4;
  return `${a.toFixed(digits)} Ξ`;
}

function signed(n: number, useUsd: boolean): { text: string; cls: string } {
  if (!Number.isFinite(n)) return { text: "—", cls: "text-[var(--ink-dim)]" };
  const cls = n > 0 ? "text-[var(--up)]" : n < 0 ? "text-[var(--down)]" : "text-[var(--ink)]";
  const body = useUsd ? formatUsd(Math.abs(n), 0) : fmtEth(Math.abs(n));
  return { text: (n < 0 ? "−" : n > 0 ? "+" : "") + body, cls };
}

function plain(n: number, useUsd: boolean): string {
  if (!Number.isFinite(n)) return "—";
  return useUsd ? formatUsd(Math.abs(n), 0) : fmtEth(Math.abs(n));
}

function rate(winners: number, total: number): number | null {
  return total > 0 ? winners / total : null;
}

function rateCls(r: number | null): string {
  if (r == null) return "text-[var(--ink-dim)]";
  return r >= 0.5 ? "text-[var(--up)]" : r >= 0.3 ? "text-[var(--ink)]" : "text-[var(--down)]";
}

function Stat({
  label,
  value,
  valueCls,
  sub,
  loading,
}: {
  label: string;
  value: string;
  valueCls?: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">{label}</div>
      <div className={clsx("text-[22px] leading-none tabular-nums", valueCls ?? "text-[var(--ink)]")}>
        {loading ? <Skeleton className="h-6 w-24" /> : value}
      </div>
      {sub != null && (
        <div className="text-[11px] leading-snug tabular-nums text-[var(--ink-dim)]">{sub}</div>
      )}
    </div>
  );
}

interface Props {
  range: Range;
  currency: Currency;
  ethUsd: number | undefined;
}

export function TraderOutcomesPanel({ range, currency }: Props) {
  const { data, isLoading } = useApiTraderOutcomes(range);
  const [showAbout, setShowAbout] = useState(false);
  const useUsd = currency === "usd";

  const now: OutcomesSnapshot | null = data?.now ?? null;
  const prev: OutcomesSnapshot | null = data?.prev ?? null;
  const rangeLabel = RANGE_META[range];

  const num = (v: number | null | undefined) => Number(v ?? 0);

  // Delta over the window: cumulative now minus cumulative one window ago.
  function delta(pick: (s: OutcomesSnapshot) => number): string | null {
    if (!now || !prev) return null;
    const d = pick(now) - pick(prev);
    if (!Number.isFinite(d) || d === 0) return null;
    return `${signed(d, useUsd).text} in ${rangeLabel}`;
  }

  const sellers = num(now?.sellers);
  const realizedWinners = num(now?.realized_winners);
  const soldRate = rate(realizedWinners, sellers);
  const realizedNet = useUsd ? num(now?.realized_net_usd) : num(now?.realized_net_eth);

  const holders = num(now?.holders);
  const holderWinners = num(now?.holder_winners);
  const holdRate = rate(holderWinners, holders);
  const unrealized = useUsd ? num(now?.unrealized_usd) : num(now?.unrealized_eth);

  const moneyIn = useUsd ? num(now?.money_in_usd) : num(now?.money_in_eth);
  const moneyOut = useUsd ? num(now?.money_out_usd) : num(now?.money_out_eth);
  const holdingValue = useUsd ? num(now?.holding_value_usd) : num(now?.holding_value_eth);
  const netAll = useUsd ? num(now?.net_usd) : num(now?.net_eth);

  const realizedFmt = signed(realizedNet, useUsd);
  const unrealizedFmt = signed(unrealized, useUsd);
  const netFmt = signed(netAll, useUsd);

  const netDelta = delta((s) => (useUsd ? s.net_usd : s.net_eth));

  return (
    <Panel
      title="Are users making money?"
      meta={`cumulative · per wallet · FIFO · wins in ${useUsd ? "USD" : "ETH"}`}
      bodyClassName="p-0"
    >
      {/* SOLD — realized */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--line-dim)] px-4 py-4">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          Sold their shares
        </span>
        {isLoading ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <>
            <span className={clsx("text-[32px] leading-none tabular-nums", rateCls(soldRate))}>
              {soldRate == null ? "—" : `${Math.round(soldRate * 100)}%`}
            </span>
            <span className="text-[13px] tabular-nums text-[var(--ink-dim)]">
              {sellers === 0
                ? "no wallet has sold yet"
                : `made money — ${realizedWinners.toLocaleString()} of ${sellers.toLocaleString()} wallets that sold`}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-2">
        <Stat
          label="Money sellers actually took home"
          value={realizedFmt.text}
          valueCls={realizedFmt.cls}
          sub={
            delta((s) => (useUsd ? s.realized_net_usd : s.realized_net_eth)) ??
            "cash out minus cash in, all sellers"
          }
          loading={isLoading}
        />
        <Stat
          label="Wallets that sold at a profit"
          value={
            sellers === 0 ? "—" : `${realizedWinners.toLocaleString()} of ${sellers.toLocaleString()}`
          }
          sub="a wallet counts once, no matter how many sells"
          loading={isLoading}
        />
      </div>

      {/* HOLDING — unrealized / paper */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-y border-[var(--line-dim)] px-4 py-4">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          Still holding
        </span>
        {isLoading ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <>
            <span className={clsx("text-[32px] leading-none tabular-nums", rateCls(holdRate))}>
              {holdRate == null ? "—" : `${Math.round(holdRate * 100)}%`}
            </span>
            <span className="text-[13px] tabular-nums text-[var(--ink-dim)]">
              {holders === 0
                ? "nobody is holding shares"
                : `up on paper — ${holderWinners.toLocaleString()} of ${holders.toLocaleString()} wallets still holding`}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-2">
        <Stat
          label="Paper profit for holders"
          value={unrealizedFmt.text}
          valueCls={unrealizedFmt.cls}
          sub="value at today's price minus what they paid"
          loading={isLoading}
        />
        <Stat
          label="Wallets holding at a gain"
          value={holders === 0 ? "—" : `${holderWinners.toLocaleString()} of ${holders.toLocaleString()}`}
          sub="estimated — paper, not cashed out"
          loading={isLoading}
        />
      </div>

      {/* ALL-IN net */}
      <div className="border-t border-[var(--line-dim)] px-4 py-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          Everyone, all-in
        </div>
        {isLoading ? (
          <Skeleton className="mt-2 h-5 w-full max-w-md" />
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-dim)]">
            Put in <span className="tabular-nums text-[var(--ink)]">{plain(moneyIn, useUsd)}</span>
            {" · "}took out{" "}
            <span className="tabular-nums text-[var(--ink)]">{plain(moneyOut, useUsd)}</span>
            {" · "}holding{" "}
            <span className="tabular-nums text-[var(--ink)]">{plain(holdingValue, useUsd)}</span>
            {" → net "}
            <span className={clsx("tabular-nums", netFmt.cls)}>{netFmt.text}</span>
            {netDelta && <span className="text-[var(--ink-faint)]"> ({netDelta})</span>}
          </p>
        )}
      </div>

      <div className="border-t border-[var(--line-dim)] px-4 py-2">
        <button
          onClick={() => setShowAbout((s) => !s)}
          className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)] hover:text-[var(--ink)]"
        >
          {showAbout ? "hide method" : "how this is computed"}
        </button>
        {showAbout && (
          <p className="pb-2 pt-2 text-[11px] leading-relaxed text-[var(--ink-dim)]">
            A wallet is one running ledger. <strong>Sold</strong> is realized cash: every sell is
            FIFO-matched to that wallet's earlier buys — what it took out minus what it put in. Buys
            are counted gross (including POV's buy fee) and sells net of fee, so the numbers are true
            cash flow. <strong>Holding</strong> is paper: shares still held, valued at the most
            recent trade price for that belief and side — an estimate, not a live quote. Wins are
            decided in ETH; the dollar figures use the ETH price and are approximate. The big number
            is the cumulative total to date; the smaller "in {rangeLabel}" figure is how much it
            moved over the selected timeframe.
          </p>
        )}
      </div>
    </Panel>
  );
}
