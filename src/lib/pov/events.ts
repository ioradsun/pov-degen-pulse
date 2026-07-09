import { CONTRACT_LABELS, KNOWN_SIGS } from "./constants";
import { hexToBigInt, hexToInt } from "./format";
import type { DecodedEvent, RawLog } from "./types";

interface RpcLog {
  address: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  topics: string[];
  data: string;
}

export function normalizeLog(l: RpcLog): RawLog {
  return {
    address: l.address.toLowerCase(),
    block: hexToInt(l.blockNumber),
    logIndex: hexToInt(l.logIndex),
    txHash: l.transactionHash,
    topics: l.topics,
    topic0: l.topics[0] ?? "0x",
    data: l.data,
  };
}

function topicToAddr(t: string | undefined): string | undefined {
  if (!t || t.length < 42) return undefined;
  return `0x${t.slice(-40)}`.toLowerCase();
}

export function decodeLog(raw: RawLog): DecodedEvent {
  const sig = KNOWN_SIGS[raw.topic0];
  const label = CONTRACT_LABELS[raw.address] ?? "Unknown";
  const eventName = sig?.name ?? `${raw.topic0.slice(0, 10)}…`;
  const kind = sig?.kind ?? "unknown";

  let from: string | undefined;
  let to: string | undefined;
  let valueWei: bigint | undefined;

  if (kind === "transfer" || kind === "approval") {
    from = topicToAddr(raw.topics[1]);
    to = topicToAddr(raw.topics[2]);
    if (raw.data && raw.data !== "0x") {
      try {
        valueWei = hexToBigInt(raw.data.slice(0, 66));
      } catch {
        /* noop */
      }
    }
  }

  return {
    ...raw,
    contractLabel: label,
    eventName,
    kind,
    from,
    to,
    valueWei,
  };
}
