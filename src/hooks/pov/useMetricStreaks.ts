import { useMemo } from "react";
import { useApiActivityBuckets, type RhythmBucket } from "./useApiPulse";
import { computeStreak, type Streak } from "@/lib/pov/streaks";
import type { MetricKey } from "@/components/pulse/MetricHistoryDialog";

/** Enough daily history to catch long/record streaks (route caps at 120). */
const DAYS_BACK = 120;

/**
 * "Days rising" streaks for the four top metrics, computed from the daily
 * activity series. Streaks are day-based and independent of the timeframe
 * toggle — the flame reflects the daily trend, not the selected window.
 *
 * Direction for buy volume is taken in ETH (native), so it doesn't wobble with
 * the ETH/USD rate.
 */
export function useMetricStreaks(): {
  streaks: Record<MetricKey, Streak> | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useApiActivityBuckets("day", DAYS_BACK);

  const streaks = useMemo(() => {
    const buckets = data?.buckets;
    if (!buckets || buckets.length < 2) return null;
    const dates = buckets.map((b: RhythmBucket) => b.bucket);
    const streak = (pick: (b: RhythmBucket) => number) =>
      computeStreak(buckets.map(pick), dates);
    return {
      buy_volume: streak((b) => b.buy_volume_eth),
      active_traders: streak((b) => b.active_traders),
      transactions: streak((b) => b.buys),
      new_beliefs: streak((b) => b.created),
    } as Record<MetricKey, Streak>;
  }, [data]);

  return { streaks, isLoading };
}
