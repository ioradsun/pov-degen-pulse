/**
 * Daily "days rising" streaks for the top metrics.
 *
 * A streak counts consecutive most-recent COMPLETED days where each day's value
 * beat the day before. One down (or flat) day resets it to zero. We drop the
 * final bucket — today is still in progress, so counting it would make the
 * streak flicker as the day fills in.
 *
 * Everything here is pure so it can be unit-tested without the network.
 */

export interface Streak {
  /** consecutive most-recent completed days that rose vs. the prior day */
  current: number;
  /** longest such run seen in the loaded history */
  record: number;
  /** whether `current` ties or beats the previous best (a new record) */
  isRecord: boolean;
  /** recent completed days, oldest→newest, for the strip (up = rose that day) */
  days: { up: boolean; date: string }[];
  /** first rising day of the current run (ISO), or null if no active streak */
  startDate: string | null;
  /** most recent rising day of the current run (ISO), or null */
  endDate: string | null;
  /** the down/flat day that reset the streak (ISO), or null if history is all-up */
  brokeAfter: string | null;
  /**
   * Today's still-open bucket — NOT counted in `current` until the day closes.
   * `beatsYesterday` is true once today's running total has already passed
   * yesterday's final (for these monotonic daily counts, once it's ahead it
   * stays ahead, so the streak will extend when the day closes).
   */
  inProgress: { beatsYesterday: boolean; date: string } | null;
}

const EMPTY: Omit<Streak, "inProgress"> = {
  current: 0,
  record: 0,
  isRecord: false,
  days: [],
  startDate: null,
  endDate: null,
  brokeAfter: null,
};

/**
 * @param values daily values oldest→newest, INCLUDING today's partial bucket last
 * @param dates  matching bucket timestamps (ISO), same length and order
 */
export function computeStreak(
  values: number[],
  dates: string[],
  opts: { excludeLast?: boolean; stripLen?: number } = {},
): Streak {
  const excludeLast = opts.excludeLast ?? true;
  const stripLen = opts.stripLen ?? 10;

  // today's in-progress bucket (the excluded last point) vs. the last completed day
  const inProgress =
    excludeLast && values.length >= 2
      ? {
          beatsYesterday: values[values.length - 1] > values[values.length - 2],
          date: dates[dates.length - 1],
        }
      : null;

  const end = excludeLast ? values.length - 1 : values.length;
  const vals = values.slice(0, Math.max(end, 0));
  const ds = dates.slice(0, Math.max(end, 0));
  if (vals.length < 2) return { ...EMPTY, inProgress };

  // one transition per completed day (from day 2 onward): did it beat the day before?
  const ups: { up: boolean; date: string }[] = [];
  for (let i = 1; i < vals.length; i++) {
    ups.push({ up: vals[i] > vals[i - 1], date: ds[i] });
  }

  // current: trailing consecutive up-days
  let current = 0;
  for (let i = ups.length - 1; i >= 0 && ups[i].up; i--) current++;

  // record: longest consecutive up-run anywhere in the loaded history
  let record = 0;
  let run = 0;
  for (const u of ups) {
    run = u.up ? run + 1 : 0;
    if (run > record) record = run;
  }

  const runStartIdx = ups.length - current;
  const breakIdx = runStartIdx - 1; // the day that reset the streak, if any
  const days = ups.slice(-stripLen);

  return {
    current,
    record,
    isRecord: current > 0 && current >= record,
    days,
    startDate: current > 0 ? ups[runStartIdx].date : null,
    endDate: current > 0 ? ups[ups.length - 1].date : null,
    brokeAfter: breakIdx >= 0 ? ups[breakIdx].date : null,
    inProgress,
  };
}

/** "Jul 7" from an ISO timestamp. */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
