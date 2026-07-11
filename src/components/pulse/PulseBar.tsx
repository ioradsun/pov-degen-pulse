import { useState } from "react";
import { clsx } from "clsx";
import {
  formatCompact,
  formatDegenPrice,
  formatPct,
  formatUsd,
  type Currency,
} from "@/lib/pov/format";
import type { DegenSnapshot } from "@/lib/pov/types";
import type { WriterStatus } from "@/hooks/pov/useApiPulse";

interface PulseBarProps {
  writerStatus: WriterStatus | null;
  lastIndexedBlock: number | null;
  degen: DegenSnapshot | null;
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
  /** Current ETH/USD rate, for the standalone converter (distinct from the
   *  currency toggle above, which only affects DEGEN's own price display). */
  ethUsd?: number;
}

const STATUS_LABEL: Record<WriterStatus, string> = {
  ok: "live",
  starting: "indexer starting…",
  stalled: "indexer stalled",
  "no writer connected": "no writer connected",
};

function EthUsdConverter({ ethUsd }: { ethUsd?: number }) {
  const [raw, setRaw] = useState("1");
  const eth = Number(raw);
  const usd = ethUsd && Number.isFinite(eth) ? eth * ethUsd : null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
        inputMode="decimal"
        aria-label="ETH amount"
        className="w-14 border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-right tabular-nums text-[var(--ink)] focus:border-[var(--pov)] focus:outline-none"
      />
      <span className="text-[var(--ink-faint)]">Ξ =</span>
      <span className="tabular-nums text-[var(--ink)]">
        {usd != null ? formatUsd(usd, usd >= 1 ? 2 : 4) : "—"}
      </span>
    </div>
  );
}

export function PulseBar({
  writerStatus,
  lastIndexedBlock,
  degen,
  currency,
  onCurrencyChange,
  ethUsd,
}: PulseBarProps) {
  const live = writerStatus === "ok";

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "inline-block h-2 w-2 rounded-full",
              live ? "animate-pulse bg-[var(--up)]" : "bg-[var(--ink-faint)]",
            )}
            aria-hidden
          />
          <h1 className="text-sm tracking-[0.22em] text-[var(--ink)]">
            POV <span className="text-[var(--pov)]">×</span> DEGEN{" "}
            <span className="text-[var(--ink-dim)]">PULSE</span>
          </h1>
          <span className="hidden text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)] sm:inline">
            {writerStatus == null
              ? "connecting…"
              : live && lastIndexedBlock != null
                ? `live · block ${lastIndexedBlock.toLocaleString()}`
                : STATUS_LABEL[writerStatus]}
          </span>
        </div>

        <EthUsdConverter ethUsd={ethUsd} />

        {degen && (
          <div className="flex items-baseline gap-4 tabular-nums">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--degen)]">
              $DEGEN
            </span>
            <span className="text-sm text-[var(--ink)]">
              {formatDegenPrice(currency === "usd" ? degen.priceUsd : degen.priceEth, currency)}
            </span>
            <button
              type="button"
              onClick={() => onCurrencyChange(currency === "usd" ? "eth" : "usd")}
              className="flex items-center border border-[var(--line)] text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)] transition-colors hover:border-[var(--degen)] hover:text-[var(--degen)]"
              title="Switch price currency"
            >
              <span
                className={clsx(
                  "px-1.5 py-[1px]",
                  currency === "usd" && "bg-[var(--degen)] text-[var(--bg)]",
                )}
              >
                USD
              </span>
              <span
                className={clsx(
                  "px-1.5 py-[1px]",
                  currency === "eth" && "bg-[var(--degen)] text-[var(--bg)]",
                )}
              >
                ETH
              </span>
            </button>
            <span
              className={clsx(
                "text-xs",
                degen.change24h >= 0 ? "text-[var(--up)]" : "text-[var(--down)]",
              )}
            >
              {formatPct(degen.change24h)}
            </span>
            <span className="hidden text-xs text-[var(--ink-dim)] md:inline">
              vol {formatUsd(degen.volume24h, 0)} · mcap {formatUsd(degen.marketCap, 0)}
            </span>
            <span className="hidden text-xs text-[var(--ink-dim)] lg:inline">
              {formatCompact(degen.buys24h)} buys / {formatCompact(degen.sells24h)} sells
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
