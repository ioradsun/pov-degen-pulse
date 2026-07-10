import { useEffect, useState } from "react";
import { resolveBeliefNames } from "@/lib/pov/beliefNames";
import type { BeliefRow } from "@/hooks/pov/useBeliefs";

/**
 * Resolves belief text for every discovered yes-token in one multicall.
 * Returns beliefId -> human-readable belief name.
 */
export function useBeliefNames(beliefs: BeliefRow[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const tokensKey = beliefs
    .filter((b) => b.yesToken)
    .map((b) => b.yesToken)
    .sort()
    .join(",");

  useEffect(() => {
    if (!tokensKey) return;
    let alive = true;
    const withTokens = beliefs.filter((b) => b.yesToken);
    resolveBeliefNames(withTokens.map((b) => b.yesToken as string)).then((byToken) => {
      if (!alive || !byToken.size) return;
      setNames(() => {
        const next = new Map<string, string>();
        for (const b of withTokens) {
          const n = byToken.get((b.yesToken as string).toLowerCase());
          if (n) next.set(b.id, n);
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensKey]);

  return names;
}
