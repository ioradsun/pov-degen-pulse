import { useEffect, useMemo, useRef, useState } from "react";
import { decodeLog, normalizeLog, type EventAbiIndex } from "@/lib/pov/events";
import {
  blocksForHours,
  estimateTimestamp,
  fetchAnchor,
  fetchLogsAdaptive,
  fetchTxValues,
  type BlockAnchor,
} from "@/lib/pov/logs";
import { rpc } from "@/lib/pov/rpc";
import { hexToInt } from "@/lib/pov/format";
import { POV_CORE_SIGS } from "@/lib/pov/constants";
import type { DecodedEvent, RawLog } from "@/lib/pov/types";

const HEAD_POLL_MS = 5_000;
const WINDOW_HOURS = 24;
const NEW_FLASH_MS = 2_000;

export interface ActivityState {
  events: DecodedEvent[];
  latestBlock: number | null;
  /** 0..1 while backfilling, 1 when live */
  backfill: number;
  live: boolean;
}

/**
 * One poller for everything. Backfills the last 24h in a handful of
 * adaptive getLogs calls, then follows the chain head every 5s with a
 * single multi-address call. Timestamps come from Base's 2s block time.
 */
export function useActivity(index?: EventAbiIndex): ActivityState {
  const [rawLogs, setRawLogs] = useState<RawLog[]>([]);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);
  const [backfill, setBackfill] = useState(0);
  const [live, setLive] = useState(false);
  const anchorRef = useRef<BlockAnchor | null>(null);
  const cursorRef = useRef<number | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    async function ingest(logs: RawLog[], flash: boolean) {
      const anchor = anchorRef.current;
      const fresh: RawLog[] = [];
      for (const l of logs) {
        const key = `${l.txHash}:${l.logIndex}`;
        if (seenRef.current.has(key)) continue;
        seenRef.current.add(key);
        fresh.push({
          ...l,
          timestamp: anchor ? estimateTimestamp(l.block, anchor) : undefined,
          _newUntil: flash ? Date.now() + NEW_FLASH_MS : undefined,
        });
      }
      if (!fresh.length) return;

      // Gross ETH for a buy lives only in tx.value, not the event itself
      // (see VERIFICATION.md) — fetch it in one batched call per ingest.
      const buyTxHashes = fresh
        .filter((l) => l.topic0 === POV_CORE_SIGS.buy)
        .map((l) => l.txHash);
      if (buyTxHashes.length) {
        try {
          const values = await fetchTxValues(buyTxHashes);
          for (const l of fresh) {
            const v = values.get(l.txHash);
            if (v != null) l.txValueWei = v;
          }
        } catch {
          /* leave unresolved — buy events just show no ETH figure */
        }
      }
      if (!alive) return;

      const cutoff = Math.floor(Date.now() / 1000) - WINDOW_HOURS * 3600;
      setRawLogs((prev) =>
        [...prev, ...fresh]
          .filter((l) => (l.timestamp ?? cutoff) >= cutoff)
          .sort((a, b) => b.block - a.block || b.logIndex - a.logIndex),
      );
    }

    async function start() {
      try {
        const anchor = await fetchAnchor();
        if (!alive) return;
        anchorRef.current = anchor;
        setLatestBlock(anchor.block);

        const from = Math.max(0, anchor.block - blocksForHours(WINDOW_HOURS));
        const logs = await fetchLogsAdaptive(from, anchor.block, (pct) => {
          if (alive) setBackfill(pct);
        });
        if (!alive) return;
        await ingest(logs.map(normalizeLog), false);
        cursorRef.current = anchor.block;
        setBackfill(1);
        setLive(true);
        timer = window.setInterval(poll, HEAD_POLL_MS);
      } catch {
        // Retry the whole bootstrap after a beat.
        if (alive) timer = window.setTimeout(start, 8_000) as unknown as number;
      }
    }

    async function poll() {
      if (document.visibilityState === "hidden") return;
      try {
        const headHex = await rpc<string>("eth_blockNumber", []);
        const head = hexToInt(headHex);
        if (!alive || cursorRef.current == null) return;
        setLatestBlock(head);
        // Refresh the timestamp anchor cheaply.
        anchorRef.current = {
          block: head,
          timestamp: Math.floor(Date.now() / 1000),
        };
        if (head <= cursorRef.current) return;
        const logs = await fetchLogsAdaptive(cursorRef.current + 1, head);
        if (!alive) return;
        cursorRef.current = head;
        await ingest(logs.map(normalizeLog), true);
      } catch {
        /* failover handled inside rpc() */
      }
    }

    start();
    return () => {
      alive = false;
      if (timer) {
        clearInterval(timer);
        clearTimeout(timer);
      }
    };
  }, []);

  const events = useMemo(() => rawLogs.map((l) => decodeLog(l, index)), [rawLogs, index]);

  return { events, latestBlock, backfill, live };
}
