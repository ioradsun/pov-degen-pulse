import { useEffect, useMemo, useState } from "react";
import { resolveBeliefTextsFromMarket } from "@/lib/pov/beliefText";
import type { AbiFetchResult } from "@/lib/pov/abi-loader.functions";
import type { BeliefRow } from "@/hooks/pov/useBeliefs";

/**
 * One map of beliefId -> human text, merged from every source we have,
 * in priority order:
 *   1. Text emitted in event args (free — already decoded onto BeliefRow.text)
 *   2. Market contract getter markets(id)/getBelief(id) via Multicall3
 *
 * Deliberately does NOT fall back to the belief token's name() — confirmed
 * in VERIFICATION.md that it only ever returns a placeholder like
 * "Belief YES #246", not the real statement. Showing that as if it were
 * content is worse than showing "Belief #NNN" honestly.
 */
export function useBeliefTexts(
  beliefs: BeliefRow[],
  abiResults: AbiFetchResult[],
): Map<string, string> {
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());

  // Source 1: event-carried text (synchronous).
  const fromEvents = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of beliefs) if (b.text) m.set(b.id, b.text);
    return m;
  }, [beliefs]);

  const missingKey = beliefs
    .filter((b) => !fromEvents.has(b.id))
    .map((b) => b.id)
    .sort()
    .join(",");
  const abisReady = abiResults.some((r) => r.ok);

  useEffect(() => {
    if (!missingKey || !abisReady) return;
    let alive = true;
    const missing = missingKey.split(",").filter(Boolean);

    resolveBeliefTextsFromMarket(abiResults, missing).then((fromMarket) => {
      if (!alive || !fromMarket.size) return;
      setResolved((prev) => {
        const merged = new Map(prev);
        for (const [k, v] of fromMarket) merged.set(k, v);
        return merged;
      });
    });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, abisReady]);

  return useMemo(() => {
    const m = new Map(resolved);
    for (const [k, v] of fromEvents) m.set(k, v); // event text wins
    return m;
  }, [fromEvents, resolved]);
}
