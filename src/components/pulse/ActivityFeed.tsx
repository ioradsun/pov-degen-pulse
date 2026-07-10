import { useMemo } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { formatEth, formatUsd, shortAddr, timeAgo } from "@/lib/pov/format";
import { BASESCAN_TX } from "@/lib/pov/constants";
import type { DecodedEvent } from "@/lib/pov/types";

interface ActivityFeedProps {
  events: DecodedEvent[];
  /** beliefId -> resolved human text, from useBeliefTexts. */
  beliefTexts: Map<string, string>;
  /** Current ETH/USD for approximate dollar display. */
  ethUsd?: number;
}

const FEED_CAP = 40;

function amountLabel(e: DecodedEvent, ethUsd?: number): string | null {
  if (!e.valueWei) return null;
  const units = Number(e.valueWei) / 1e18;
  if (e.kind === "boost") {
    // Boost amounts are DEGEN, not ETH — confirmed in VERIFICATION.md.
    return `${units >= 1 ? units.toFixed(0) : units.toFixed(2)} DEGEN`;
  }
  const ethStr = `${formatEth(e.valueWei, 4)} Ξ`;
  if (ethUsd && ethUsd > 0) {
    const usd = units * ethUsd;
    return `${formatUsd(usd, usd >= 1 ? 0 : 2)} (${ethStr})`;
  }
  return ethStr;
}

function describe(e: DecodedEvent, beliefText: string | undefined, ethUsd?: number): string {
  const belief = beliefText ?? e.beliefText ?? (e.beliefId ? `Belief #${e.beliefId}` : "a belief");
  const side = e.yes === true ? "YES " : e.yes === false ? "NO " : "";
  const amt = amountLabel(e, ethUsd);
  switch (e.kind) {
    case "created":
      return `${shortAddr(e.from)} created "${belief}"`;
    case "buy":
      return `${shortAddr(e.from)} bought ${side}on "${belief}"${amt ? ` for ${amt}` : ""}`;
    case "sell": {
      const tokens = e.tokenAmountWei ? `${formatEth(e.tokenAmountWei, 2)} ` : "";
      return `${shortAddr(e.from)} sold ${tokens}${side}on "${belief}"${amt ? ` for ${amt}` : ""}`;
    }
    case "boost":
      return `${shortAddr(e.from)} boosted "${belief}"${amt ? ` with ${amt}` : ""}`;
    case "fee":
      return `${e.eventName}${amt ? ` — ${amt}` : ""}`;
    default:
      return `${e.eventName || "Unrecognized event"} · ${e.contractLabel}${
        e.beliefId ? ` · belief ${e.beliefId}` : ""
      }`;
  }
}

const KIND_STYLE: Record<string, string> = {
  created: "text-[var(--info)]",
  buy: "text-[var(--up)]",
  sell: "text-[var(--down)]",
  boost: "text-[var(--boost)]",
  fee: "text-[var(--ink-faint)]",
};

const KIND_ICON: Record<string, string> = {
  created: "◈",
  buy: "▲",
  sell: "▼",
  boost: "⚡",
  fee: "·",
};

export function ActivityFeed({ events, beliefTexts, ethUsd }: ActivityFeedProps) {
  const rows = useMemo(() => {
    const decoded = events.filter((e) =>
      ["created", "buy", "sell", "boost", "fee"].includes(e.kind),
    );
    // If nothing decodes (e.g. ABIs unavailable), fall back to raw on-chain
    // activity so the tape is never dead while the chain is busy.
    const source = decoded.length ? decoded : events.filter((e) => e.kind !== "approval");
    return source.slice(0, FEED_CAP);
  }, [events]);

  return (
    <Panel title="Live tape" meta={`${rows.length} recent`} bodyClassName="p-0">
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-[var(--ink-dim)]">
          Watching the chain… trades appear here in real time.
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y divide-[var(--line-dim)] overflow-y-auto">
          {rows.map((e) => {
            const isNew = e._newUntil != null && e._newUntil > Date.now();
            const beliefText = e.beliefId ? beliefTexts.get(e.beliefId) : undefined;
            const line = describe(e, beliefText, ethUsd);
            return (
              <li
                key={`${e.txHash}:${e.logIndex}`}
                className={clsx(
                  "flex items-start gap-2 px-4 py-2 text-[12px] transition-colors",
                  isNew && "bg-[var(--pov)]/10",
                )}
              >
                <span className={clsx("mt-px", KIND_STYLE[e.kind])} aria-hidden>
                  {KIND_ICON[e.kind]}
                </span>
                <a
                  href={BASESCAN_TX(e.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-[var(--ink)] hover:text-[var(--pov)]"
                  title={line}
                >
                  {line}
                </a>
                <span className="shrink-0 tabular-nums text-[10px] text-[var(--ink-faint)]">
                  {e.timestamp ? timeAgo(e.timestamp * 1000) : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
