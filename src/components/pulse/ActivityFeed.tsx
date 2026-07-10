import { useMemo } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { formatEth, shortAddr, timeAgo } from "@/lib/pov/format";
import { BASESCAN_TX } from "@/lib/pov/constants";
import type { DecodedEvent } from "@/lib/pov/types";

interface ActivityFeedProps {
  events: DecodedEvent[];
  names: Map<string, string>;
}

const FEED_CAP = 40;

function describe(e: DecodedEvent, name?: string): string {
  const belief = name ?? (e.beliefId ? `Belief #${e.beliefId}` : "a belief");
  const eth = e.valueWei ? `${formatEth(e.valueWei, 4)} Ξ` : "";
  switch (e.kind) {
    case "created":
      return `New belief created — "${belief}"`;
    case "buy":
      return `${shortAddr(e.from)} invested ${eth} in "${belief}"`;
    case "sell":
      return `${shortAddr(e.from)} exited ${eth} from "${belief}"`;
    case "boost":
      return `${shortAddr(e.from)} boosted "${belief}" with DEGEN`;
    default:
      return `${e.eventName} on ${e.contractLabel}`;
  }
}

const KIND_STYLE: Record<string, string> = {
  created: "text-[var(--info)]",
  buy: "text-[var(--up)]",
  sell: "text-[var(--down)]",
  boost: "text-[var(--boost)]",
};

const KIND_ICON: Record<string, string> = {
  created: "◈",
  buy: "▲",
  sell: "▼",
  boost: "⚡",
};

export function ActivityFeed({ events, names }: ActivityFeedProps) {
  const rows = useMemo(
    () =>
      events.filter((e) => ["created", "buy", "sell", "boost"].includes(e.kind)).slice(0, FEED_CAP),
    [events],
  );

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
            const name = e.beliefId ? names.get(e.beliefId) : undefined;
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
                  title={describe(e, name)}
                >
                  {describe(e, name)}
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
