import { useEffect, useState } from "react";
import { POV_CONTRACTS } from "@/lib/pov/constants";
import { rpc } from "@/lib/pov/rpc";

const POLL_MS = 30_000;
const ADDRS = Object.values(POV_CONTRACTS);

export function useBalances(): Record<string, bigint> {
  const [balances, setBalances] = useState<Record<string, bigint>>({});

  useEffect(() => {
    let alive = true;
    let hidden = false;

    async function tick() {
      if (hidden) return;
      const results = await Promise.all(
        ADDRS.map(async (a) => {
          try {
            const hex = await rpc<string>("eth_getBalance", [a, "latest"]);
            return [a.toLowerCase(), BigInt(hex)] as const;
          } catch {
            return [a.toLowerCase(), null] as const;
          }
        }),
      );
      if (!alive) return;
      setBalances((prev) => {
        const next = { ...prev };
        for (const [k, v] of results) {
          if (v != null) next[k] = v;
        }
        return next;
      });
    }

    const onVis = () => {
      hidden = document.visibilityState === "hidden";
      if (!hidden) tick();
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return balances;
}
