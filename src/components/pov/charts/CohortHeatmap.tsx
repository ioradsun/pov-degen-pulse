import { useMemo } from "react";
import { Panel } from "../primitives/Panel";
import type { DecodedEvent } from "@/lib/pov/types";

const WEEK = 7 * 24 * 3600;

/**
 * Cohort retention: rows = first-touch week, columns = weeks-since-first-touch.
 * Each cell = # of first-touch addrs active that week.
 * Requires enough historical events for meaningful density.
 */
export function CohortHeatmap({
  events,
  weeks = 8,
}: {
  events: DecodedEvent[];
  weeks?: number;
}) {
  const { matrix, weekLabels, maxCell, cohortSizes } = useMemo(() => {
    const nowWeek = Math.floor(Date.now() / 1000 / WEEK) * WEEK;
    const start = nowWeek - (weeks - 1) * WEEK;

    const firstSeen = new Map<string, number>();
    const activity = new Map<string, Set<number>>(); // addr -> set of weeks active

    for (const e of events) {
      const addr = e.from;
      if (!addr || !e.timestamp) continue;
      const w = Math.floor(e.timestamp / WEEK) * WEEK;
      const prev = firstSeen.get(addr);
      if (prev == null || w < prev) firstSeen.set(addr, w);
      let s = activity.get(addr);
      if (!s) {
        s = new Set();
        activity.set(addr, s);
      }
      s.add(w);
    }

    // Rows: cohort weeks (start..nowWeek)
    const cohortWeeks: number[] = [];
    for (let w = start; w <= nowWeek; w += WEEK) cohortWeeks.push(w);

    const matrix: number[][] = cohortWeeks.map((cw) => {
      const row: number[] = [];
      const cohortAddrs = [...firstSeen.entries()]
        .filter(([, fw]) => fw === cw)
        .map(([a]) => a);
      for (let i = 0; cw + i * WEEK <= nowWeek; i++) {
        const w = cw + i * WEEK;
        let n = 0;
        for (const a of cohortAddrs) if (activity.get(a)?.has(w)) n++;
        row.push(n);
      }
      return row;
    });

    const cohortSizes = matrix.map((r) => r[0] ?? 0);
    const maxCell = Math.max(1, ...matrix.flat());
    const weekLabels = cohortWeeks.map((w) => {
      const d = new Date(w * 1000);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    return { matrix, weekLabels, maxCell, cohortSizes };
  }, [events, weeks]);

  const hasData = matrix.some((r) => r.some((c) => c > 0));

  return (
    <Panel
      title="Cohort retention"
      meta={`by first-touch week · last ${weeks}w`}
      bodyClassName="p-4"
    >
      {!hasData ? (
        <div className="py-6 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          need more historical events to compute cohorts
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                  Cohort
                </th>
                <th className="px-2 py-1 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                  Size
                </th>
                {Array.from({ length: weeks }).map((_, i) => (
                  <th
                    key={i}
                    className="px-2 py-1 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]"
                  >
                    +{i}w
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, ri) => (
                <tr key={ri}>
                  <td className="px-2 py-1 text-[var(--ink-dim)] tabular-nums">
                    {weekLabels[ri]}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-[var(--ink)]">
                    {cohortSizes[ri]}
                  </td>
                  {Array.from({ length: weeks }).map((_, ci) => {
                    const val = row[ci];
                    if (val == null) {
                      return (
                        <td
                          key={ci}
                          className="h-6 w-8 border border-[var(--bg)] bg-transparent"
                        />
                      );
                    }
                    const alpha = val / maxCell;
                    return (
                      <td
                        key={ci}
                        title={`${val} active`}
                        className="h-6 w-8 border border-[var(--bg)] text-center align-middle text-[10px] tabular-nums"
                        style={{
                          backgroundColor: `color-mix(in oklab, var(--pov) ${Math.round(alpha * 100)}%, var(--surface-2))`,
                          color:
                            alpha > 0.5
                              ? "var(--bg)"
                              : "var(--ink)",
                        }}
                      >
                        {val || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
