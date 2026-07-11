import { Flame } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { shortDate, type Streak } from "@/lib/pov/streaks";

const GREEN = "var(--up)";

/**
 * "Days rising" indicator for a metric card: a flame chip with the current run
 * length, a strip of recent up/down days (trailing run brightened), and a
 * plain-language tooltip that spells out the streak — and, when it's cold, why
 * it reset. A run counts once it reaches 2 days.
 */
export function StreakRow({
  streak,
  loading,
  metricLabel,
}: {
  streak?: Streak;
  loading?: boolean;
  metricLabel: string;
}) {
  if (loading) return <Skeleton className="mt-2 h-[14px] w-24" />;
  if (!streak || streak.days.length === 0) return null;

  const active = streak.current >= 2;

  const tip = active ? (
    <>
      <span style={{ color: GREEN }}>Rising {streak.current} days straight</span> —{" "}
      {shortDate(streak.startDate)} → {shortDate(streak.endDate)}. Each day beat the last.
      <br />
      {streak.isRecord ? "A new record." : `Record is ${streak.record} days.`} Breaks if a day
      comes in lower.
    </>
  ) : streak.brokeAfter ? (
    <>
      Streak reset — {shortDate(streak.brokeAfter)} came in below the day before.
      {streak.record > 0 && <> Best run: {streak.record} days.</>}
    </>
  ) : (
    <>No rising streak yet.</>
  );

  return (
    <TooltipProvider delayDuration={80}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="mt-2 flex cursor-default items-center gap-2"
            aria-label={
              active
                ? `${metricLabel} rising ${streak.current} days in a row`
                : `${metricLabel} — no active streak`
            }
          >
            <span
              className="flex items-center gap-1 text-[11px] font-medium tabular-nums"
              style={{ color: active ? GREEN : "var(--ink-faint)" }}
            >
              <Flame className="h-3 w-3" style={{ opacity: active ? 1 : 0.5 }} aria-hidden />
              {active ? `${streak.current}d` : "—"}
            </span>
            <span className="flex h-[14px] flex-1 items-end gap-[2px]">
              {streak.days.map((d, i) => {
                const inRun = active && i >= streak.days.length - streak.current;
                const height = d.up ? (inRun ? 14 : 9) : 5;
                return (
                  <span
                    key={`${d.date}-${i}`}
                    style={{
                      display: "block",
                      flex: 1,
                      height,
                      borderRadius: 1,
                      background: d.up ? (inRun ? GREEN : "var(--ink-faint)") : "transparent",
                      border: d.up ? "none" : "0.5px solid var(--line-dim)",
                    }}
                  />
                );
              })}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[230px] text-[11.5px] leading-relaxed">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
