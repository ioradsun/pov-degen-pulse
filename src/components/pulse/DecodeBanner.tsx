import type { AbiState } from "@/hooks/pov/useAbis";
import type { DecodedEvent } from "@/lib/pov/types";

interface DecodeBannerProps {
  events: DecodedEvent[];
  abis: AbiState;
  live: boolean;
}

/**
 * Explains the two failure modes that used to look like a dead app:
 *   1. No events at all in 24h (quiet chain vs RPC trouble)
 *   2. Events arriving but undecodable (ABIs unavailable)
 */
export function DecodeBanner({ events, abis, live }: DecodeBannerProps) {
  if (!live) return null;

  const classified = events.filter((e) =>
    ["created", "buy", "sell", "boost", "transfer"].includes(e.kind),
  ).length;
  const abiErrors = abis.results.filter((r) => !r.ok);

  if (events.length > 0 && classified === 0) {
    return (
      <div className="border border-[var(--boost)]/50 bg-[var(--boost)]/10 px-4 py-2.5 text-[11px] leading-relaxed text-[var(--boost)]">
        {events.length} on-chain events arrived but none could be decoded — contract ABIs are
        unavailable
        {abiErrors.length > 0 &&
          ` (${abiErrors
            .map((r) => r.error)
            .filter(Boolean)
            .slice(0, 2)
            .join("; ")})`}
        . The tape below shows raw activity. Decoding retries automatically; setting
        ETHERSCAN_API_KEY on the server adds a backup ABI source.
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--ink-dim)]">
        No POV contract events found in the last 24h. Either the market is quiet right now, or the
        browser can't reach a Base RPC — new events will appear the moment they land.
      </div>
    );
  }

  return null;
}
