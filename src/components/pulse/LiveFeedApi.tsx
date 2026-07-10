import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { formatUsd, shortAddr, timeAgo } from "@/lib/pov/format";
import { BASESCAN_TX } from "@/lib/pov/constants";
import { useApiFeed, type FeedEvent } from "@/hooks/pov/useApiPulse";

const LARGE_THRESHOLD_USD = 500;

const KIND_LABEL: Record<FeedEvent["event_type"], string> = {
  new_belief: "NEW BELIEF",
  yes_buy: "YES BUY",
  no_buy: "NO BUY",
  yes_sell: "YES SELL",
  no_sell: "NO SELL",
};

const KIND_ACCENT: Record<FeedEvent["event_type"], string> = {
  new_belief: "bg-[var(--pov)]",
  yes_buy: "bg-[var(--up)]",
  no_buy: "bg-[var(--down)]",
  yes_sell: "bg-transparent",
  no_sell: "bg-transparent",
};

const KIND_COLOR: Record<FeedEvent["event_type"], string> = {
  new_belief: "text-[var(--pov)]",
  yes_buy: "text-[var(--up)]",
  no_buy: "text-[var(--down)]",
  yes_sell: "text-[var(--up)]/70",
  no_sell: "text-[var(--down)]/70",
};

function Row({ e }: { e: FeedEvent }) {
  const isSell = e.event_type === "yes_sell" || e.event_type === "no_sell";
  const large = (e.amount_usd ?? 0) >= LARGE_THRESHOLD_USD;
  const label = large && !isSell ? `LARGE ${KIND_LABEL[e.event_type]}` : KIND_LABEL[e.event_type];
  const amount =
    e.amount_usd != null ? formatUsd(e.amount_usd, e.amount_usd >= 100 ? 0 : 2) : null;
  const ts = new Date(e.event_timestamp).getTime();

  return (
    <li
      className={clsx(
        "group relative flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]",
        isSell && "opacity-70",
      )}
    >
      <span
        aria-hidden
        className={clsx("w-[3px] shrink-0 self-stretch rounded-full", KIND_ACCENT[e.event_type])}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
          <span className={clsx("font-semibold", KIND_COLOR[e.event_type])}>{label}</span>
          {amount && (
            <>
              <span className="text-[var(--ink-faint)]">·</span>
              <span className="tabular-nums text-[var(--ink)]">{amount}</span>
            </>
          )}
          {large && (
            <span
              className="ml-1 rounded-sm border border-[var(--boost)]/50 px-1 py-px text-[9px] text-[var(--boost)]"
              title="Trade of $500 or more"
            >
              LARGE
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-[14px] leading-snug text-[var(--ink)]" title={e.belief_text ?? undefined}>
          {e.belief_text ?? `Belief #${e.belief_id}`}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--ink-faint)]">
          <span>
            {e.event_type === "new_belief" ? "Created by " : ""}
            {shortAddr(e.wallet_address)}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{ts ? `${timeAgo(ts)} ago` : "just now"}</span>
          <a
            href={BASESCAN_TX(e.tx_hash)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[var(--ink-faint)] hover:text-[var(--pov)]"
            aria-label="Open transaction on BaseScan"
          >
            ↗
          </a>
        </div>
      </div>
    </li>
  );
}

export function LiveFeedApi() {
  const [largeOnly, setLargeOnly] = useState(false);
  const { data, isLoading, error } = useApiFeed({ largeOnly, limit: 150 });
  const events = useMemo(() => data?.events ?? [], [data]);

  const meta = isLoading
    ? "loading…"
    : `${events.length} shown${largeOnly ? " · large only" : ""}`;

  const action = (
    <label className="flex cursor-pointer select-none items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-dim)]">
      <span title="Trades of $500 or more">Large only</span>
      <button
        type="button"
        role="switch"
        aria-checked={largeOnly}
        onClick={() => setLargeOnly((v) => !v)}
        className={clsx(
          "relative h-4 w-7 rounded-full border border-[var(--line)] transition-colors",
          largeOnly ? "bg-[var(--pov)]/60" : "bg-[var(--surface-2)]",
        )}
      >
        <span
          className={clsx(
            "absolute top-[1px] h-[12px] w-[12px] rounded-full bg-[var(--ink)] transition-transform",
            largeOnly ? "translate-x-[13px]" : "translate-x-[1px]",
          )}
        />
      </button>
    </label>
  );

  return (
    <Panel title="Live activity" meta={meta} action={action} bodyClassName="p-0">
      <div className="max-h-[640px] min-h-[500px] overflow-y-auto" aria-live="polite">
        {error ? (
          <div className="p-8 text-center text-xs text-[var(--down)]">
            Feed unavailable: {(error as Error).message}
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--ink-dim)]">
            {isLoading
              ? "Loading live activity…"
              : largeOnly
                ? "No large trades in the current window."
                : "No activity yet. New beliefs and trades will appear here in real time."}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line-dim)]">
            {events.map((e) => (
              <Row key={e.event_id} e={e} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
