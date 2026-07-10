import { decodeEventLog, toEventSelector, type AbiEvent } from "viem";
import { CONTRACT_LABELS, KNOWN_SIGS, POV_CONTRACTS } from "./constants";
import { hexToBigInt, hexToInt } from "./format";
import type { AbiFetchResult } from "./abi-loader.functions";
import type { DecodedEvent, EventKind, RawLog } from "./types";

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
    topic0: (l.topics[0] ?? "0x").toLowerCase(),
    data: l.data,
  };
}

function topicToAddr(t: string | undefined): string | undefined {
  if (!t || t.length < 42) return undefined;
  return `0x${t.slice(-40)}`.toLowerCase();
}

/**
 * Guess an EventKind from the decoded event name.
 * Matches on POV's likely event names + generic ERC20.
 */
function classifyEventName(name: string): EventKind {
  const n = name.toLowerCase();
  if (n.includes("created") || n.includes("launched")) return "created";
  if (
    n.includes("bought") ||
    n.includes("buy") ||
    n.includes("purchase") ||
    n === "mint" ||
    n.includes("minted")
  )
    return "buy";
  if (n.includes("sold") || n.includes("sell") || n.includes("redeem") || n.includes("burn"))
    return "sell";
  if (n.includes("boost")) return "boost";
  if (n === "transfer") return "transfer";
  if (n === "approval") return "approval";
  if (n.includes("upgrade") || n.includes("admin") || n.includes("owner") || n === "initialized")
    return "admin";
  return "unknown";
}

export interface EventAbiIndex {
  /** Map of contract address (lowercase) -> topic0 -> AbiEvent */
  byAddress: Map<string, Map<string, AbiEvent>>;
  /** Fallback events indexed by topic0 across all ABIs (ERC20 Transfer, etc.) */
  global: Map<string, AbiEvent>;
}

/**
 * Build an index of decodable events from fetched ABIs.
 *
 * The BeliefMarket proxy address emits logs whose ABI lives in the impl,
 * so we alias `proxy address -> impl ABI events` explicitly.
 */
export function buildAbiIndex(results: AbiFetchResult[]): EventAbiIndex {
  const byAddress = new Map<string, Map<string, AbiEvent>>();
  const global = new Map<string, AbiEvent>();

  const eventsByAddress = new Map<string, AbiEvent[]>();
  for (const r of results) {
    if (!r.abi) continue;
    const events = r.abi.filter(
      (item): item is AbiEvent => item && item.type === "event" && typeof item.name === "string",
    );
    eventsByAddress.set(r.address, events);
    for (const ev of events) {
      try {
        const sel = toEventSelector(ev).toLowerCase();
        if (!global.has(sel)) global.set(sel, ev);
      } catch {
        /* ignore malformed */
      }
    }
  }

  function indexFor(addr: string, events: AbiEvent[]) {
    let m = byAddress.get(addr);
    if (!m) {
      m = new Map();
      byAddress.set(addr, m);
    }
    for (const ev of events) {
      try {
        const sel = toEventSelector(ev).toLowerCase();
        if (!m.has(sel)) m.set(sel, ev);
      } catch {
        /* ignore */
      }
    }
  }

  for (const [addr, events] of eventsByAddress) {
    indexFor(addr, events);
  }

  // Proxy address <- impl ABI events
  const proxy = POV_CONTRACTS.beliefMarketProxy.toLowerCase();
  const impl = POV_CONTRACTS.beliefMarketImpl.toLowerCase();
  const implEvents = eventsByAddress.get(impl);
  if (implEvents?.length) indexFor(proxy, implEvents);

  // BeliefToken clones — they're per-belief ERC20s at unknown addresses.
  // The BeliefToken impl is the ABI they clone. We can't pre-index by
  // address, so decoding falls back to `global` for unknown addresses.

  return { byAddress, global };
}

export function decodeLog(raw: RawLog, index?: EventAbiIndex): DecodedEvent {
  const label = CONTRACT_LABELS[raw.address] ?? "Unknown";

  // Try ABI-based decode first
  if (index) {
    const forAddr = index.byAddress.get(raw.address);
    const ev = forAddr?.get(raw.topic0) ?? index.global.get(raw.topic0);
    if (ev) {
      try {
        const decoded = decodeEventLog({
          abi: [ev],
          data: raw.data as `0x${string}`,
          topics: raw.topics as [`0x${string}`, ...`0x${string}`[]],
          strict: false,
        });
        const args = (decoded.args ?? {}) as Record<string, unknown>;
        const kind = classifyEventName(decoded.eventName);

        const from =
          typeof args.from === "string"
            ? args.from.toLowerCase()
            : typeof args.buyer === "string"
              ? args.buyer.toLowerCase()
              : typeof args.seller === "string"
                ? args.seller.toLowerCase()
                : typeof args.user === "string"
                  ? args.user.toLowerCase()
                  : typeof args.creator === "string"
                    ? args.creator.toLowerCase()
                    : typeof args.account === "string"
                      ? args.account.toLowerCase()
                      : undefined;

        const to =
          typeof args.to === "string"
            ? args.to.toLowerCase()
            : typeof args.recipient === "string"
              ? args.recipient.toLowerCase()
              : undefined;

        // Prefer ethSpent/proceeds for POV events; fall back to generic names.
        let valueWei: bigint | undefined;
        for (const k of [
          "ethSpent",
          "proceeds",
          "value",
          "cost",
          "ethAmount",
          "wei",
          "amount",
          "tokens",
        ]) {
          const v = args[k];
          if (typeof v === "bigint") {
            valueWei = v;
            break;
          }
          if (typeof v === "string" && /^\d+$/.test(v)) {
            try {
              valueWei = BigInt(v);
              break;
            } catch {
              /* noop */
            }
          }
        }

        // Group key: POV markets use marketId (uint256). Fall back to per-belief
        // token address or a generic belief field for other contracts.
        const marketIdRaw = args.marketId ?? args.boostId ?? args.id;
        const beliefId =
          typeof marketIdRaw === "bigint"
            ? marketIdRaw.toString()
            : typeof marketIdRaw === "string" && marketIdRaw
              ? marketIdRaw
              : typeof args.token === "string"
                ? args.token.toLowerCase()
                : typeof args.beliefToken === "string"
                  ? args.beliefToken.toLowerCase()
                  : typeof args.belief === "string"
                    ? args.belief.toLowerCase()
                    : undefined;

        const yesToken =
          typeof args.yesToken === "string" ? args.yesToken.toLowerCase() : undefined;
        const curveAddress = typeof args.curve === "string" ? args.curve.toLowerCase() : undefined;
        const yes = typeof args.yes === "boolean" ? args.yes : undefined;
        const questionId = typeof args.questionId === "string" ? args.questionId : undefined;

        // Capture belief text if the event carries it as a string arg
        // (named field first, then any plausibly-human string).
        let beliefText: string | undefined;
        for (const k of [
          "question",
          "statement",
          "belief",
          "text",
          "description",
          "title",
          "name",
        ]) {
          const v = args[k];
          if (typeof v === "string" && v.length > 3 && !v.startsWith("0x")) {
            beliefText = v;
            break;
          }
        }
        if (!beliefText) {
          for (const v of Object.values(args)) {
            if (
              typeof v === "string" &&
              v.length >= 8 &&
              !v.startsWith("0x") &&
              /[a-zA-Z] /.test(v)
            ) {
              beliefText = v;
              break;
            }
          }
        }

        return {
          ...raw,
          contractLabel: label,
          eventName: decoded.eventName,
          kind,
          from,
          to,
          valueWei,
          beliefId,
          yesToken,
          curveAddress,
          yes,
          questionId,
          beliefText,
        };
      } catch {
        /* fall through to heuristic */
      }
    }
  }

  // Fallback heuristic decode
  const sig = KNOWN_SIGS[raw.topic0];
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
