import { useMemo } from "react";
import { POV_CONTRACTS } from "@/lib/pov/constants";
import type { DecodedEvent } from "@/lib/pov/types";

export type Curve = "linear" | "cp" | "unknown";

export interface BeliefRow {
  /** Market group id (marketId as string). */
  id: string;
  /** Yes-token contract address, when known (from MarketCreated). */
  yesToken?: string;
  curve: Curve;
  createdBlock: number;
  createdAt?: number;
  totalBuys: number;
  totalSells: number;
  volumeWei: bigint;
  boostCount: number;
  lastBoostAt?: number;
  participants: number;
  lastEventAt?: number;
}

/**
 * Derives per-belief rows from decoded events.
 * Groups by `beliefId` when present, otherwise by tx hash for created events.
 * Curve is best-effort inferred from which curve contract emitted matching activity.
 */
export function useBeliefs(events: DecodedEvent[]): BeliefRow[] {
  return useMemo(() => {
    const rows = new Map<string, BeliefRow & { _addrs: Set<string> }>();
    const linear = POV_CONTRACTS.linearCurve.toLowerCase();
    const cp = POV_CONTRACTS.cpCurve.toLowerCase();

    function ensure(id: string, block: number, ts?: number) {
      let r = rows.get(id);
      if (!r) {
        r = {
          tokenAddress: id,
          curve: "unknown",
          createdBlock: block,
          createdAt: ts,
          totalBuys: 0,
          totalSells: 0,
          volumeWei: 0n,
          boostCount: 0,
          participants: 0,
          _addrs: new Set(),
        };
        rows.set(id, r);
      }
      return r;
    }

    for (const e of events) {
      const id = e.beliefId;
      if (!id) continue;
      const r = ensure(id, e.block, e.timestamp);
      if (e.kind === "created") {
        r.createdBlock = e.block;
        r.createdAt = e.timestamp;
      }
      if (e.kind === "buy") r.totalBuys++;
      if (e.kind === "sell") r.totalSells++;
      if (e.kind === "boost") {
        r.boostCount++;
        r.lastBoostAt = e.timestamp;
      }
      if (e.valueWei) r.volumeWei += e.valueWei;
      if (e.from) r._addrs.add(e.from);
      if (e.to) r._addrs.add(e.to);
      // Curve inference: MarketCreated carries `curve` as an event arg.
      const curveArg = e.curveAddress;
      if (r.curve === "unknown") {
        if (curveArg === linear || e.address === linear) r.curve = "linear";
        else if (curveArg === cp || e.address === cp) r.curve = "cp";
      }
      if (!r.lastEventAt || (e.timestamp && e.timestamp > r.lastEventAt)) {
        r.lastEventAt = e.timestamp;
      }
    }

    return [...rows.values()]
      .map((r) => ({ ...r, participants: r._addrs.size }))
      .sort((a, b) => (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0));
  }, [events]);
}
