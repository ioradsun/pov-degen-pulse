import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPovTexts } from "@/lib/pov/povSite.functions";
import type { BeliefRow } from "@/hooks/pov/useBeliefs";

/**
 * beliefId -> human belief text, merged in priority order:
 *   1. Text emitted in event args (free — already decoded onto BeliefRow.text).
 *      Dead in practice today (MarketCreated only carries agent-id UUIDs,
 *      confirmed in VERIFICATION.md) but kept in case that ever changes.
 *   2. pov.co (server fn) — the only source that actually works right now.
 *      See povSite.functions.ts for why event args and token name() don't.
 *
 * Brand-new beliefs may not be on pov.co's homepage listing for a few
 * seconds, so unresolved ids are retried every 60s instead of given up on.
 */
export function useBeliefTexts(beliefs: BeliefRow[]): Map<string, string> {
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const inFlight = useRef(false);

  const fromEvents = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of beliefs) if (b.text) m.set(b.id, b.text);
    return m;
  }, [beliefs]);

  const wantedKey = beliefs
    .filter((b) => !b.text && /^\d+$/.test(b.id))
    .map((b) => b.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!wantedKey) return;
    let alive = true;
    let timer: number | undefined;

    async function resolve() {
      if (inFlight.current) return;
      const marketIds = wantedKey.split(",").filter((id) => !resolvedRef.current.has(id));
      if (!marketIds.length) return;

      inFlight.current = true;
      try {
        const texts = await fetchPovTexts({ data: { marketIds } });
        if (!alive) return;
        const entries = Object.entries(texts);
        if (entries.length) {
          setResolved((prev) => {
            const next = new Map(prev);
            for (const [id, t] of entries) next.set(id, t);
            return next;
          });
        }
        // Anything still unresolved (brand-new belief not yet listed on
        // pov.co, or one that's fallen off the homepage) — retry gently.
        if (entries.length < marketIds.length && alive) {
          timer = window.setTimeout(resolve, 60_000) as unknown as number;
        }
      } catch {
        if (alive) timer = window.setTimeout(resolve, 60_000) as unknown as number;
      } finally {
        inFlight.current = false;
      }
    }

    // Short delay so a burst of newly discovered beliefs batches into one call.
    timer = window.setTimeout(resolve, 800) as unknown as number;
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [wantedKey]);

  return useMemo(() => {
    const m = new Map(resolved);
    for (const [k, v] of fromEvents) m.set(k, v); // event text wins if it ever exists
    return m;
  }, [fromEvents, resolved]);
}
