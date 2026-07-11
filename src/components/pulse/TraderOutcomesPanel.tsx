import { useState } from "react";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { type Currency } from "@/lib/pov/format";
import { RANGE_META, type Range } from "@/lib/pov/ranges";
import { useApiTraderOutcomes, type OutcomesSnapshot } from "@/hooks/pov/useApiPulse";

/**
 * "Are users making money?" — one market, one position.
 *
 * The unit is a POSITION: one trader's stake in one market side. Every position
 * is in exactly one of three states, so the counts always reconcile:
 *   • In profit — closed (sold out) for more than was put in   (real money)
 *   • In loss   — closed for less than was put in               (real money)
 *   • On paper  — still open, not settled yet                   (unrealized)
 *
 * Headline = win rate of SETTLED positions: in-profit ÷ (in-profit + in-loss).
 */

const GREEN = "var(--up)";
const RED = "var(--down)";

/** ROI fraction (0.4) → signed percent string ("+40%"). */
function roiLabel(roi: number | null | undefined): string | null {
  if (roi == null || !Number.isFinite(roi)) return null;
  const pct = Math.round(roi * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function Stat({
  tone,
  label,
  count,
  desc,
  roi,
  loading,
}: {
  tone: "up" | "down" | "neutral";
  label: string;
  count: number;
  desc: string;
  roi?: number | null;
  loading?: boolean;
}) {
  const color = tone === "up" ? GREEN : tone === "down" ? RED : "var(--ink-dim)";
  const roiText = roiLabel(roi);
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="flex items-center gap-2 text-[12px] font-medium">
        <span className="inline-block h-[11px] w-[11px] rounded-full" style={{ background: color }} />
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] font-semibold leading-none tabular-nums" style={{ color }}>
          {loading ? <Skeleton className="h-7 w-12" /> : count.toLocaleString()}
        </span>
        {!loading && roiText && count > 0 && (
          <span className="text-[13px] font-medium tabular-nums" style={{ color }} title="capital-weighted average ROI">
            {roiText} avg
          </span>
        )}
      </div>
      <span className="text-[12px] leading-snug text-[var(--ink-dim)]">{desc}</span>
    </div>
  );
}

interface Props {
  range: Range;
  currency: Currency;
  ethUsd: number | undefined;
}

export function TraderOutcomesPanel({ range }: Props) {
  const { data, isLoading } = useApiTraderOutcomes(range);
  const [showAbout, setShowAbout] = useState(false);

  const now: OutcomesSnapshot | null = data?.now ?? null;
  const prev: OutcomesSnapshot | null = data?.prev ?? null;
  const n = (v: number | null | undefined) => Number(v ?? 0);

  const won = n(now?.won_positions);
  const lost = n(now?.lost_positions);
  const open = n(now?.open_positions);
  const openUp = n(now?.open_up);
  const openDown = n(now?.open_down);
  const wonRoi = now?.won_roi ?? null;
  const lostRoi = now?.lost_roi ?? null;
  const openUpRoi = now?.open_up_roi ?? null;
  const openDownRoi = now?.open_down_roi ?? null;

  const settled = won + lost;
  const total = settled + open;
  const winPct = settled > 0 ? Math.round((won / settled) * 100) : null;

  // change in win rate over the selected window
  const prevSettled = prev ? n(prev.won_positions) + n(prev.lost_positions) : 0;
  const prevWinPct = prevSettled > 0 ? (n(prev?.won_positions) / prevSettled) * 100 : null;
  const winPctDelta =
    winPct != null && prevWinPct != null ? Math.round(winPct - prevWinPct) : null;

  return (
    <Panel
      title="Are users making money?"
      meta="every position · one trader, one market"
      bodyClassName="p-0"
    >
      {/* HERO — win rate of settled positions */}
      <div className="border-b border-[var(--line-dim)] px-4 py-4">
        {isLoading ? (
          <Skeleton className="h-8 w-56" />
        ) : total === 0 ? (
          <div className="text-[15px] text-[var(--ink-dim)]">No positions opened yet.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div className="flex items-baseline gap-x-2">
                  <span
                    className="text-[34px] font-semibold leading-none tabular-nums"
                    style={{ color: winPct != null && winPct >= 50 ? GREEN : "var(--ink)" }}
                  >
                    {winPct != null ? `${winPct}%` : "—"}
                  </span>
                  <span className="text-[15px] text-[var(--ink)]">of closed positions made money</span>
                </div>
                <div className="mt-1 text-[13px] text-[var(--ink-dim)]">
                  {settled > 0
                    ? `${won.toLocaleString()} won · ${lost.toLocaleString()} lost · ${settled.toLocaleString()} settled`
                    : "no position has been closed yet"}
                </div>
              </div>
              <div className="text-[13px] leading-tight text-[var(--ink-dim)]">
                <span className="text-[20px] font-semibold tabular-nums text-[var(--ink)]">
                  {open.toLocaleString()}
                </span>{" "}
                still open
                <div className="text-[11px] text-[var(--ink-faint)]">
                  {openUp.toLocaleString()} up · {openDown.toLocaleString()} down at last price
                </div>
              </div>
            </div>

            {/* settled bar: won (green) vs lost (red) */}
            <div className="mt-3 flex h-[14px] gap-[2px] overflow-hidden rounded-full">
              <div style={{ flexGrow: won, background: GREEN }} title={`In profit: ${won}`} />
              <div style={{ flexGrow: lost, background: RED }} title={`In loss: ${lost}`} />
              {settled === 0 && <div style={{ flexGrow: 1, background: "var(--line-dim)" }} />}
            </div>
            <div className="mt-1 flex justify-between text-[12px] tabular-nums text-[var(--ink-dim)]">
              <span>
                ▲ {won.toLocaleString()} in profit
                {winPctDelta != null && winPctDelta !== 0 && (
                  <span className={winPctDelta > 0 ? "text-[var(--up)]" : "text-[var(--down)]"}>
                    {" "}
                    ({winPctDelta > 0 ? "+" : "−"}
                    {Math.abs(winPctDelta)} pts in {RANGE_META[range]})
                  </span>
                )}
              </span>
              <span>{lost.toLocaleString()} in loss ▼</span>
            </div>
          </>
        )}
      </div>

      {/* 2×2 — settled vs. paper × profit vs. loss, each with capital-weighted ROI */}
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)]">
        <Stat
          tone="up"
          label="In profit"
          count={won}
          roi={wonRoi}
          desc="closed · sold for more than paid"
          loading={isLoading}
        />
        <Stat
          tone="down"
          label="In loss"
          count={lost}
          roi={lostRoi}
          desc="closed · sold for less than paid"
          loading={isLoading}
        />
        <Stat
          tone="up"
          label="On paper · profit"
          count={openUp}
          roi={openUpRoi}
          desc="still open · up at last price"
          loading={isLoading}
        />
        <Stat
          tone="down"
          label="On paper · loss"
          count={openDown}
          roi={openDownRoi}
          desc="still open · down at last price"
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
            A <strong>position</strong> is one trader's stake in one market side. A position is
            counted <strong>settled</strong> once it's fully sold (sells FIFO-matched to its buys);
            it's <strong>in profit</strong> if the cash out exceeded the cash in, otherwise{" "}
            <strong>in loss</strong>. Positions still holding tokens are <strong>on paper</strong> —
            not settled, and split up/down only as an estimate at the most recent trade price for
            that market and side, which can move if everyone tries to sell. The headline win rate is
            in-profit ÷ settled. <strong>Avg</strong> on each tile is the capital-weighted ROI —
            total profit (or loss) over total cash in for those positions, so a tiny position can't
            skew it. Everything is decided in ETH.
          </p>
        )}
      </div>
    </Panel>
  );
}
