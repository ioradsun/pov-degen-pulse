import { decodeEventLog, toEventSelector, type AbiEvent } from "viem";
import {
  CONTRACT_LABELS,
  KNOWN_SIGS,
  POV_CONTRACTS,
  POV_CORE_SIGS,
  POV_FEE_SIGS,
} from "./constants";
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

/** Splits a 0x-prefixed data blob into 32-byte (64 hex char) words. */
function dataWords(data: string): string[] {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const out: string[] = [];
  for (let i = 0; i + 64 <= hex.length; i += 64) out.push(hex.slice(i, i + 64));
  return out;
}

function wordToBigInt(w: string | undefined): bigint {
  return w ? BigInt(`0x${w}`) : 0n;
}

function wordToAddr(w: string | undefined): string | undefined {
  return w ? `0x${w.slice(-40)}`.toLowerCase() : undefined;
}

/**
 * Manual decoder for POV's three core trading events. No ABI exists for
 * these anywhere (impl/curve/token contracts are all unverified) — the
 * topic0 hashes and field offsets below were reverse engineered from raw
 * logs and cross-checked against real transactions: mint/burn amounts,
 * `name()` on the resulting tokens, wallet balance deltas, and msg.value.
 * Full evidence and tx hashes in VERIFICATION.md — every field here is
 * either hard-confirmed or explicitly left unset, never guessed.
 *
 * topics[1] = marketId (uint256), topics[2] = actor address, all three.
 *   created: data = [strOff x3, yesToken, noToken, curve, curveConstant,
 *                     0, 0, (3x UUID strings — off-chain content ids,
 *                     NOT belief text, and NOT real ETH — curveConstant
 *                     is a fixed parameter, confirmed via msg.value=0)]
 *   buy:     data = [strOff, side(0=NO/1=YES), tokenAmount18dec (CONFIRMED
 *                     token mint amount, not ETH), words3-8 UNRESOLVED
 *                     (not gross+fee — their sum exceeds msg.value in one
 *                     sample), (UUID)]. Gross ETH comes from tx.value,
 *                     attached as raw.txValueWei before this runs.
 *   sell:    data = [strOff, side(0=NO/1=YES), tokenAmount18dec (CONFIRMED
 *                     burn amount), ethProceedsWei (CONFIRMED via seller
 *                     balance delta), feeWei, (UUID)]
 */
function decodePovCore(raw: RawLog): DecodedEvent | null {
  const label = CONTRACT_LABELS[raw.address] ?? "Unknown";
  const marketId = raw.topics[1] ? hexToInt(raw.topics[1]).toString() : undefined;
  const actor = topicToAddr(raw.topics[2]);
  const words = dataWords(raw.data);

  if (raw.topic0 === POV_CORE_SIGS.created) {
    // word6 (~0.001 ETH) is a fixed curve constant, not ETH the creator
    // actually paid — confirmed this tx's msg.value is 0. Not real volume.
    return {
      ...raw,
      contractLabel: label,
      eventName: "MarketCreated",
      kind: "created",
      from: actor,
      beliefId: marketId,
      yesToken: wordToAddr(words[3]),
      noToken: wordToAddr(words[4]),
      curveAddress: wordToAddr(words[5]),
    };
  }

  if (raw.topic0 === POV_CORE_SIGS.buy) {
    // Gross ETH spent is NOT in this event — confirmed via wallet balance
    // delta, it only exists in the transaction's `value` field, fetched
    // separately via fetchTxValues() and attached as raw.txValueWei before
    // decode (see useActivity.ts). word2 is the belief-token amount minted
    // (18dec), confirmed exact against the mint Transfer — it is NOT ETH,
    // despite superficially looking like a plausible wei amount.
    // words3-8 have unresolved semantics (see VERIFICATION.md); we do not
    // guess a fee from them.
    return {
      ...raw,
      contractLabel: label,
      eventName: "TokensBought",
      kind: "buy",
      from: actor,
      beliefId: marketId,
      yes: wordToBigInt(words[1]) === 1n,
      tokenAmountWei: wordToBigInt(words[2]),
      valueWei: raw.txValueWei,
    };
  }

  if (raw.topic0 === POV_CORE_SIGS.sell) {
    return {
      ...raw,
      contractLabel: label,
      eventName: "TokensSold",
      kind: "sell",
      from: actor,
      beliefId: marketId,
      yes: wordToBigInt(words[1]) === 1n,
      tokenAmountWei: wordToBigInt(words[2]),
      valueWei: wordToBigInt(words[3]),
      feeWei: wordToBigInt(words[4]),
    };
  }

  if (raw.topic0 === POV_FEE_SIGS.referralCreated) {
    return {
      ...raw,
      contractLabel: label,
      eventName: "ReferralCreated",
      kind: "fee",
      from: topicToAddr(raw.topics[1]),
      to: topicToAddr(raw.topics[2]),
    };
  }

  if (raw.topic0 === POV_FEE_SIGS.feesClaimed || raw.topic0 === POV_FEE_SIGS.referralFeesClaimed) {
    return {
      ...raw,
      contractLabel: label,
      eventName:
        raw.topic0 === POV_FEE_SIGS.feesClaimed ? "FeesClaimed" : "ReferralFeesClaimed",
      kind: "fee",
      from: topicToAddr(raw.topics[1]),
      valueWei: wordToBigInt(words[0]),
    };
  }

  if (raw.topic0 === POV_FEE_SIGS.referralFeePaid) {
    return {
      ...raw,
      contractLabel: label,
      eventName: "ReferralFeePaid",
      kind: "fee",
      from: topicToAddr(raw.topics[1]),
      to: topicToAddr(raw.topics[2]),
      beliefId: raw.topics[3] ? hexToInt(raw.topics[3]).toString() : undefined,
      valueWei: wordToBigInt(words[0]),
    };
  }

  return null;
}

/**
 * Guess an EventKind from the decoded event name.
 * Matches on POV's likely event names + generic ERC20.
 */
function classifyEventName(name: string): EventKind {
  const n = name.toLowerCase();
  // Check "boost" first — e.g. BoostPurchased contains "purchase" and would
  // otherwise misclassify as "buy", pulling its DEGEN-denominated amount
  // into ETH trade volume.
  if (n.includes("boost")) return "boost";
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

  // POV's core trading events have no ABI anywhere (see decodePovCore) —
  // check these hardcoded, verified signatures before anything else.
  const core = decodePovCore(raw);
  if (core) return core;

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
