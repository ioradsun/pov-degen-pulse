import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { formatUsd, shortAddr, timeAgo } from "@/lib/pov/format";
import { BASESCAN_TX } from "@/lib/pov/constants";
import { useApiFeed, useApiHealth, useApiMarketCaps, type FeedEvent } from "@/hooks/pov/useApiPulse";

const LARGE_THRESHOLD_USD = 500;
const POLL_INTERVAL_MS = 15_000;

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

function Row({ e, marketCap }: { e: FeedEvent; marketCap: number | null }) {
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
        <a
          href={`https://pov.co/markets/${e.belief_id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-[14px] leading-snug text-[var(--ink)] hover:text-[var(--pov)] hover:underline"
          title={e.belief_text ?? undefined}
        >
          {e.belief_text ?? `Belief #${e.belief_id}`}
        </a>

        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--ink-faint)]">
          <span>
            {e.event_type === "new_belief" ? "Created by " : ""}
            {shortAddr(e.wallet_address)}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{ts ? `${timeAgo(ts)} ago` : "just now"}</span>
          {marketCap != null && marketCap > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums" title="Current market cap">
                MC {formatUsd(marketCap, 0)}
              </span>
            </>
          )}

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
  const { data, isLoading, isFetching, error, dataUpdatedAt } = useApiFeed({
    largeOnly,
    limit: 150,
  });
  const { data: health } = useApiHealth();
  const { data: mcData } = useApiMarketCaps();
  const caps = mcData?.caps ?? {};
  const events = useMemo(() => data?.events ?? [], [data]);


  // Re-render every second so "Xs ago" ticks smoothly.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

  const pollingActive = !error;
  const now = Date.now();
  void tick; // keep dep for re-render
  const refreshSec = dataUpdatedAt ? Math.max(0, Math.floor((now - dataUpdatedAt) / 1000)) : null;
  const nextRefreshSec =
    dataUpdatedAt && pollingActive
      ? Math.max(0, Math.ceil((dataUpdatedAt + POLL_INTERVAL_MS - now) / 1000))
      : null;
  const indexSec = health?.indexer?.seconds_since_last_index ?? null;
  const indexerOk = indexSec != null && indexSec <= 30;

  return (
    <Panel title="Live activity" meta={meta} action={action} bodyClassName="p-0">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--line-dim)] bg-[var(--surface-2)]/40 px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]"
        aria-label="Feed status"
      >
        <span className="flex items-center gap-1.5" title="Polling status">
          <span
            className={clsx(
              "inline-block h-1.5 w-1.5 rounded-full",
              pollingActive
                ? isFetching
                  ? "animate-pulse bg-[var(--up)]"
                  : "bg-[var(--up)]"
                : "bg-[var(--down)]",
            )}
          />
          <span className="text-[var(--ink)]">
            {pollingActive ? (isFetching ? "Fetching" : "Polling") : "Paused"}
          </span>
          {pollingActive && (
            <span className="normal-case tracking-normal text-[var(--ink-faint)]">
              · every {POLL_INTERVAL_MS / 1000}s
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5" title="Last successful feed refresh">
          <span className="text-[var(--ink-faint)]">Refresh</span>
          <span className="tabular-nums normal-case tracking-normal text-[var(--ink)]">
            {refreshSec == null ? "—" : `${refreshSec}s ago`}
          </span>
          {nextRefreshSec != null && (
            <span className="normal-case tracking-normal text-[var(--ink-faint)]">
              · next {nextRefreshSec}s
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5" title="Onchain indexer last tick">
          <span
            className={clsx(
              "inline-block h-1.5 w-1.5 rounded-full",
              indexSec == null
                ? "bg-[var(--ink-faint)]"
                : indexerOk
                  ? "bg-[var(--up)]"
                  : indexSec <= 60
                    ? "bg-[var(--boost)]"
                    : "bg-[var(--down)]",
            )}
          />
          <span className="text-[var(--ink-faint)]">Indexed</span>
          <span className="tabular-nums normal-case tracking-normal text-[var(--ink)]">
            {indexSec == null ? "—" : `${indexSec}s ago`}
          </span>
          {health?.indexer?.last_indexed_block != null && (
            <span className="normal-case tracking-normal text-[var(--ink-faint)]">
              · blk {health.indexer.last_indexed_block.toLocaleString()}
            </span>
          )}
        </span>
      </div>
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
              <Row key={e.event_id} e={e} marketCap={caps[String(e.belief_id)] ?? null} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
