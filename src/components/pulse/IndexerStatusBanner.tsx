import type { WriterStatus } from "@/hooks/pov/useApiPulse";

interface IndexerStatusBannerProps {
  writerStatus: WriterStatus | null;
  lastError: string | null | undefined;
}

/**
 * Surfaces the two failure modes that used to look like a dead dashboard:
 * the indexer never started, or it started and then stopped ticking.
 */
export function IndexerStatusBanner({ writerStatus, lastError }: IndexerStatusBannerProps) {
  if (writerStatus == null || writerStatus === "ok") return null;

  if (writerStatus === "no writer connected") {
    return (
      <div className="border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--ink-dim)]">
        No indexer has written any data yet. Numbers below will appear once the writer connects and
        backfills.
      </div>
    );
  }

  if (writerStatus === "stalled") {
    return (
      <div className="border border-[var(--boost)]/50 bg-[var(--boost)]/10 px-4 py-2.5 text-[11px] leading-relaxed text-[var(--boost)]">
        The indexer hasn't ticked in over a minute — numbers below may be stale
        {lastError && `: ${lastError}`}.
      </div>
    );
  }

  return (
    <div className="border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--ink-dim)]">
      Indexer is starting up — backfilling recent activity. Numbers below will fill in shortly.
    </div>
  );
}
