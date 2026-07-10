import { useMemo } from "react";
import { POV_CONTRACTS } from "@/lib/pov/constants";
import type { DecodedEvent } from "@/lib/pov/types";

export type Curve = "linear" | "cp" | "unknown";

export interface BeliefRow {
  /** Market group id (marketId as string). */
  id: string;
  /** Yes-token contract address, when known (from MarketCreated). */
  yesToken?: string;
  /** No-token contract address, when known (from MarketCreated). */
  noToken?: string;
  curve: Curve;
  createdBlock: number;
  createdAt?: number;
  totalBuys: number;
  totalSells: number;
  volumeWei: bigint;
  boostCount: number;
  /** Belief text captured from event args, when emitted on-chain. */
  text?: string;
  lastBoostAt?: number;
  participants: number;
  lastEventAt?: number;
}

type Internal = BeliefRow & { _addrs: Set<string> };

/**
 * Derives per-belief rows from decoded events.
 * Groups by `beliefId` (marketId when present).
 */
export function useBeliefs(events: DecodedEvent[]): BeliefRow[] {
  return useMemo(() => {
    const rows = new Map<string, Internal>();
    const linear = POV_CONTRACTS.linearCurve.toLowerCase();
    const cp = POV_CONTRACTS.cpCurve.toLowerCase();

    function ensure(id: string, block: number, ts?: number): Internal {
      const existing = rows.get(id);
      if (existing) return existing;
      const created: Internal = {
        id,
        curve: "unknown",
        createdBlock: block,
        createdAt: ts,
        totalBuys: 0,
        totalSells: 0,
        volumeWei: 0n,
        boostCount: 0,
        participants: 0,
        _addrs: new Set<string>(),
      };
      rows.set(id, created);
      return created;
    }

    for (const e of events) {
      const id = e.beliefId;
      if (!id) continue;
      const r = ensure(id, e.block, e.timestamp);
      if (e.kind === "created") {
        r.createdBlock = e.block;
        r.createdAt = e.timestamp;
        if (e.yesToken) r.yesToken = e.yesToken;
        if (e.noToken) r.noToken = e.noToken;
      }
      if (!r.text && e.beliefText) r.text = e.beliefText;
      if (e.kind === "buy") r.totalBuys++;
      if (e.kind === "sell") r.totalSells++;
      if (e.kind === "boost") {
        r.boostCount++;
        r.lastBoostAt = e.timestamp;
      }
      if (e.valueWei && (e.kind === "buy" || e.kind === "sell")) r.volumeWei += e.valueWei;
      if (e.from) r._addrs.add(e.from);
      if (e.to) r._addrs.add(e.to);
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
