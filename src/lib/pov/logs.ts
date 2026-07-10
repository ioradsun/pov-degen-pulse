import { rpc } from "./rpc";
import { POV_TRACKED } from "./constants";
import { hexToInt } from "./format";

/**
 * Fast log fetching, first principles:
 *
 * 1. `eth_getLogs` accepts an ARRAY of addresses — one call covers all
 *    tracked POV contracts instead of one call per contract.
 * 2. Adaptive chunk sizing — start with a large block range (Base allows
 *    big ranges on most public RPCs) and halve on failure instead of
 *    hardcoding tiny 50-block chunks. A 24h backfill is ~5-20 requests
 *    instead of ~3,400.
 * 3. Timestamps are ESTIMATED from Base's fixed 2s block time against a
 *    single anchor block, instead of one `eth_getBlockByNumber` per block.
 *    Hourly bucketing tolerates ±seconds of drift; the anchor is refreshed
 *    on every head poll so recent events stay accurate.
 */

export interface RpcLogRaw {
  address: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  topics: string[];
  data: string;
}

export const BASE_BLOCK_SECONDS = 2;

export interface BlockAnchor {
  block: number;
  timestamp: number; // unix seconds
}

export async function fetchAnchor(): Promise<BlockAnchor> {
  const b = await rpc<{ number: string; timestamp: string }>("eth_getBlockByNumber", [
    "latest",
    false,
  ]);
  return {
    block: hexToInt(b.number),
    timestamp: hexToInt(b.timestamp),
  };
}

export function estimateTimestamp(block: number, anchor: BlockAnchor): number {
  return anchor.timestamp - (anchor.block - block) * BASE_BLOCK_SECONDS;
}

export function blocksForHours(hours: number): number {
  return Math.ceil((hours * 3600) / BASE_BLOCK_SECONDS);
}

const INITIAL_CHUNK = 10_000;
const MIN_CHUNK = 250;

async function getLogsRange(from: number, to: number): Promise<RpcLogRaw[]> {
  return rpc<RpcLogRaw[]>("eth_getLogs", [
    {
      address: POV_TRACKED,
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
    },
  ]);
}

/**
 * Fetches logs for all tracked contracts across [from, to], adapting the
 * chunk size to whatever the active RPC tolerates. Calls `onProgress`
 * (0..1) so the UI can show a real loading state instead of hanging.
 */
export async function fetchLogsAdaptive(
  from: number,
  to: number,
  onProgress?: (pct: number) => void,
): Promise<RpcLogRaw[]> {
  const out: RpcLogRaw[] = [];
  const total = to - from + 1;
  let chunk = INITIAL_CHUNK;
  let cursor = from;

  while (cursor <= to) {
    const end = Math.min(cursor + chunk - 1, to);
    try {
      const logs = await getLogsRange(cursor, end);
      out.push(...logs);
      cursor = end + 1;
      onProgress?.(Math.min(1, (cursor - from) / total));
      // Gently grow the chunk back after successes.
      if (chunk < INITIAL_CHUNK) chunk = Math.min(INITIAL_CHUNK, chunk * 2);
    } catch {
      if (chunk <= MIN_CHUNK) {
        // Skip a stubborn range rather than stalling the whole app.
        cursor = end + 1;
        onProgress?.(Math.min(1, (cursor - from) / total));
      } else {
        chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 2));
      }
    }
  }
  return out;
}
