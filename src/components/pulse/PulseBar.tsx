import { clsx } from "clsx";
import { formatCompact, formatPct, formatUsd } from "@/lib/pov/format";
import type { DegenSnapshot } from "@/lib/pov/types";

interface PulseBarProps {
  latestBlock: number | null;
  live: boolean;
  backfill: number;
  degen: DegenSnapshot | null;
}

export function PulseBar({ latestBlock, live, backfill, degen }: PulseBarProps) {
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
            {live
              ? `live · block ${latestBlock?.toLocaleString() ?? "…"}`
              : `loading 24h of Base… ${Math.round(backfill * 100)}%`}
          </span>
        </div>

        {degen && (
          <div className="flex items-baseline gap-4 tabular-nums">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--degen)]">
              $DEGEN
            </span>
            <span className="text-sm text-[var(--ink)]">${degen.priceUsd.toFixed(5)}</span>
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
      {!live && (
        <div className="h-0.5 w-full bg-[var(--line-dim)]">
          <div
            className="h-full bg-[var(--pov)] transition-[width] duration-300"
            style={{ width: `${Math.round(backfill * 100)}%` }}
          />
        </div>
      )}
    </header>
  );
}
