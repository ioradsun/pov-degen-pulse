import { useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { type Currency } from "@/lib/pov/format";
import { RANGE_META, type Range } from "@/lib/pov/ranges";
import { useApiTraderOutcomes, type OutcomesSnapshot } from "@/hooks/pov/useApiPulse";

/**
 * "Are users making money?" — one wallet, one bucket.
 *
 * Primary: how many wallets are AHEAD vs BEHIND, scored by cash taken out +
 * what they still hold (paper) minus what they put in. Colour is always the
 * outcome: green = up, red = down. Solid = cashed out (real money), outline =
 * still holding (paper, marked at the last trade price). Concentration shows
 * whether a few wallets took most of the real profit.
 */

const GREEN = "var(--up)";
const RED = "var(--down)";

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

function Bucket({
  tone,
  paper,
  label,
  count,
  desc,
  loading,
}: {
  tone: "up" | "down";
  paper: boolean;
  label: string;
  count: number;
  desc: string;
  loading?: boolean;
}) {
  const color = tone === "up" ? GREEN : RED;
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="flex items-center gap-2 text-[12px] font-medium">
        <span
          className="inline-block h-[11px] w-[11px] rounded-full"
          style={paper ? { border: `2px solid ${color}` } : { background: color }}
        />
        {label}
      </span>
      <span className="text-[30px] font-semibold leading-none tabular-nums" style={{ color }}>
        {loading ? <Skeleton className="h-7 w-12" /> : count.toLocaleString()}
      </span>
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

  const total = n(now?.wallets_total);
  const ahead = n(now?.ahead);
  const behind = n(now?.behind);
  const banked = n(now?.banked);
  const paperUp = n(now?.paper_up);
  const underwater = n(now?.underwater);
  const lockedLoss = n(now?.locked_loss);
  const aheadPct = pct(ahead, total);

  const top3 = now?.top3_gain_share ?? null;
  const winners = n(now?.realized_winners);

  // How many more wallets are ahead than one window ago.
  const aheadDelta = now && prev ? ahead - n(prev.ahead) : null;

  const aheadCls =
    aheadPct == null
      ? "text-[var(--ink-dim)]"
      : aheadPct >= 50
        ? "text-[var(--up)]"
        : "text-[var(--down)]";

  return (
    <Panel title="Are users making money?" meta="every wallet · cash + what they still hold" bodyClassName="p-0">
      {/* HERO — ahead vs behind */}
      <div className="border-b border-[var(--line-dim)] px-4 py-4">
        {isLoading ? (
          <Skeleton className="h-8 w-56" />
        ) : total === 0 ? (
          <div className="text-[15px] text-[var(--ink-dim)]">No wallets have traded yet.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className={clsx("text-[32px] font-semibold leading-none tabular-nums", aheadCls)}>
                {aheadPct}%
              </span>
              <span className="text-[15px] text-[var(--ink)]">of wallets are ahead</span>
              {aheadDelta != null && aheadDelta !== 0 && (
                <span
                  className={clsx(
                    "text-[12px] tabular-nums",
                    aheadDelta > 0 ? "text-[var(--up)]" : "text-[var(--down)]",
                  )}
                >
                  {aheadDelta > 0 ? "+" : "−"}
                  {Math.abs(aheadDelta)} in {RANGE_META[range]}
                </span>
              )}
            </div>
            <div className="mt-1 text-[13px] text-[var(--ink-dim)]">
              {ahead.toLocaleString()} of {total.toLocaleString()} wallets have more than they put in
              — counting cash taken out plus shares they still hold.
            </div>

            {/* one bar, four segments: solid = real, soft = paper */}
            <div className="mt-3 flex h-[14px] gap-[2px] overflow-hidden rounded-full">
              <div style={{ flexGrow: banked, background: GREEN }} title={`Cashed out ahead: ${banked}`} />
              <div style={{ flexGrow: paperUp, background: GREEN, opacity: 0.4 }} title={`Winning on paper: ${paperUp}`} />
              <div style={{ flexGrow: underwater, background: RED, opacity: 0.4 }} title={`Underwater: ${underwater}`} />
              <div style={{ flexGrow: lockedLoss, background: RED }} title={`Sold at a loss: ${lockedLoss}`} />
            </div>
            <div className="mt-1 flex justify-between text-[12px] tabular-nums text-[var(--ink-dim)]">
              <span>▲ {ahead.toLocaleString()} ahead</span>
              <span>{behind.toLocaleString()} behind ▼</span>
            </div>
          </>
        )}
      </div>

      {/* FOUR BUCKETS */}
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)]">
        <Bucket
          tone="up"
          paper={false}
          label="Cashed out ahead"
          count={banked}
          desc="sold and kept a profit"
          loading={isLoading}
        />
        <Bucket
          tone="down"
          paper={false}
          label="Sold at a loss"
          count={lockedLoss}
          desc="got out for less than they put in"
          loading={isLoading}
        />
        <Bucket
          tone="up"
          paper
          label="Winning on paper"
          count={paperUp}
          desc="still holding · up at today's price"
          loading={isLoading}
        />
        <Bucket
          tone="down"
          paper
          label="Underwater"
          count={underwater}
          desc="still holding · down at today's price"
          loading={isLoading}
        />
      </div>

      {/* CONCENTRATION — real money only */}
      <div className="flex items-center gap-3 border-t border-[var(--line-dim)] bg-[var(--surface-2)] px-4 py-3">
        {isLoading ? (
          <Skeleton className="h-5 w-64" />
        ) : top3 == null || winners === 0 ? (
          <span className="text-[12px] text-[var(--ink-dim)]">
            No wallet has cashed out a profit yet.
          </span>
        ) : (
          <>
            <span className="text-[22px] font-semibold tabular-nums text-[var(--ink)]">
              {Math.round(top3 * 100)}%
            </span>
            <span className="text-[13px] text-[var(--ink-dim)]">
              of the real money made went to the top 3 of {winners.toLocaleString()} winning
              {winners === 1 ? " wallet" : " wallets"}.
            </span>
          </>
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
            Each wallet gets one score: cash it took out (sells, FIFO-matched to its buys) plus the
            value of shares it still holds, minus everything it put in. Ahead means that score is
            above zero. <strong>Solid</strong> bars/dots are wallets that have cashed out (real
            money); <strong>outline</strong> ones are still holding, valued at the most recent trade
            price for that belief and side — an estimate, not a live quote, so paper gains can vanish
            if everyone tries to sell. Everything is decided in ETH. Concentration counts only real,
            realized profit.
          </p>
        )}
      </div>
    </Panel>
  );
}
