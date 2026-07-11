import { clsx } from "clsx";
import { RANGES, RANGE_META, type Range } from "@/lib/pov/ranges";

interface TimeframeControlProps {
  range: Range;
  onRangeChange: (range: Range) => void;
}

/**
 * The dashboard's single source of truth for time. Every range-scoped panel
 * below reads this one value — there are deliberately no per-panel timeframe
 * tabs. The live feed is the one exception: it always streams in real time.
 */
export function TimeframeControl({ range, onRangeChange }: TimeframeControlProps) {
  return (
    <div className="sticky top-0 z-20 -mx-3 border-b border-[var(--line)] bg-[var(--bg)]/95 px-3 py-2 backdrop-blur md:-mx-4 md:px-4">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
            Timeframe
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            every metric below · {RANGE_META[range]}
          </span>
        </div>
        <div
          role="tablist"
          aria-label="Dashboard timeframe"
          className="flex items-center gap-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => onRangeChange(r.key)}
              className={clsx(
                "rounded-sm border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] transition-colors",
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
    </div>
  );
}
