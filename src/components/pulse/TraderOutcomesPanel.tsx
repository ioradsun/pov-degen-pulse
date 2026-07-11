import { useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatUsd, formatPct, formatEthAmount, type Currency } from "@/lib/pov/format";
import { RANGES, type Range } from "@/lib/pov/ranges";
import { useApiPnlWallets } from "@/hooks/pov/useApiPulse";


/**
 * Wallet-first outcome hierarchy:
 *   PRIMARY   wallet    — did this person make money on POV?
 *   SECONDARY position  — where did they win? (wallet + market + side)
 *   (per-sell numbers remain available via /api/public/pnl/outcomes as a
 *    diagnostic, but are no longer the headline — one scaled exit is one
 *    outcome, not five. Wins and returns are decided in ETH, not USD —
 *    historical USD conversion isn't consistently timestamped yet.
 *    Ranges are rolling windows ending now.)
 */

function fmtEth(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const digits = a >= 10 ? 1 : a >= 0.1 ? 3 : 4;
  return `${a.toFixed(digits)} Ξ`;
}

function signedEth(n: number): { text: string; cls: string } {
  if (!Number.isFinite(n)) return { text: "—", cls: "text-[var(--ink-dim)]" };
  const cls = n > 0 ? "text-[var(--up)]" : n < 0 ? "text-[var(--down)]" : "text-[var(--ink)]";
  return { text: (n < 0 ? "−" : "") + fmtEth(n), cls };
}

function signedUsd(n: number): { text: string; cls: string } {
  if (!Number.isFinite(n)) return { text: "—", cls: "text-[var(--ink-dim)]" };
  const cls = n > 0 ? "text-[var(--up)]" : n < 0 ? "text-[var(--down)]" : "text-[var(--ink)]";
  const text = (n < 0 ? "−" : "") + formatUsd(Math.abs(n), 0);
  return { text, cls };
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
      <div
        className={clsx("text-[22px] leading-none tabular-nums", valueCls ?? "text-[var(--ink)]")}
      >
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

export function TraderOutcomesPanel({ range, currency, ethUsd }: Props) {

  const { data, isLoading } = useApiPnlWallets(range);
  const [showAbout, setShowAbout] = useState(false);

  const sellers = Number(data?.sellers ?? 0);
  const winners = Number(data?.profitable_wallets ?? 0);
  const walletRate = data?.profitable_wallet_rate;
  const winnersNetEth = Number(data?.winners_net_eth ?? 0);
  const winnersNetUsd = Number(
    data?.winners_net_usd ??
      (ethUsd && Number.isFinite(winnersNetEth) ? winnersNetEth * ethUsd : NaN),
  );
  const netEth = Number(data?.net_realized_eth ?? NaN);
  const netUsd = Number(
    data?.net_realized_usd ??
      (ethUsd && Number.isFinite(netEth) ? netEth * ethUsd : NaN),
  );
  const useUsd = currency === "usd";
  const winnersValue = useUsd
    ? Number.isFinite(winnersNetUsd)
      ? formatUsd(winnersNetUsd, 0)
      : "—"
    : fmtEth(winnersNetEth);
  const netFmt = useUsd ? signedUsd(netUsd) : signedEth(netEth);
  const posRate = data?.profitable_position_rate;
  const positions = Number(data?.positions ?? 0);
  const profitablePositions = Number(data?.profitable_positions ?? 0);
  const medianWin = data?.median_winning_return;


  const rateCls =
    walletRate == null
      ? "text-[var(--ink-dim)]"
      : walletRate >= 0.5
        ? "text-[var(--up)]"
        : walletRate >= 0.3
          ? "text-[var(--ink)]"
          : "text-[var(--down)]";

  const action = null;


  return (
    <Panel
      title="Trader outcomes"
      meta={`per wallet · FIFO · in ${useUsd ? "USD" : "ETH"} · after the 10% buy fee`}
      action={action}
      bodyClassName="p-0"
    >
      {/* PRIMARY: the headline — traders who made money */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--line-dim)] px-4 py-4">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          {range === "all" ? "Traders who made money" : "Traders who made money in this period"}
        </span>
        {isLoading ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <>
            <span className={clsx("text-[32px] leading-none tabular-nums", rateCls)}>
              {walletRate == null ? "—" : `${Math.round(walletRate * 100)}%`}
            </span>
            <span className="text-[13px] tabular-nums text-[var(--ink-dim)]">
              {sellers === 0
                ? "no wallets have sold in this window"
                : `${winners.toLocaleString()} of ${sellers.toLocaleString()} wallets that sold`}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
        <Stat
          label="Profit earned by winning traders"
          value={winnersValue}
          valueCls="text-[var(--up)]"
          sub="net profit of net-profitable wallets"
          loading={isLoading}
        />
        <Stat
          label="Net realized P&L"
          value={netFmt.text}
          valueCls={netFmt.cls}
          sub="all wallets combined, all-in"
          loading={isLoading}
        />
        <Stat
          label="Positions with realized profit"
          value={posRate == null ? "—" : `${Math.round(posRate * 100)}%`}
          sub={
            positions === 0
              ? "wallet + market + side · partials may remain open"
              : `${profitablePositions.toLocaleString()} of ${positions.toLocaleString()} · partials may remain open`
          }
          loading={isLoading}
        />
        <Stat
          label="Median winning-wallet return"
          value={medianWin == null ? "—" : `+${formatPct(medianWin * 100, 1).replace("+", "")}`}
          valueCls="text-[var(--up)]"
          sub="typical return of a profitable wallet"
          loading={isLoading}
        />
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
            Wallet is the unit of success: every sell is FIFO-matched to that wallet's prior buys
            per market and side, then summed to one number per wallet — so scaling out of one
            position in five clips is one outcome, not five. Costs are gross of POV's 10% buy fee,
            meaning a flat-price round trip shows about −10% by design; that fee is what buys &amp;
            burns DEGEN and pays creators (see "Where the money goes"). Positions are wallet +
            market + side. Wallets that only bought and never sold aren't counted here — unexited
            conviction is neither a win nor a loss yet.
          </p>
        )}
      </div>
    </Panel>
  );
}
