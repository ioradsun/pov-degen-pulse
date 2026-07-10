import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { formatEth, formatUsd, shortAddr, timeAgo, type Currency } from "@/lib/pov/format";
import { BASESCAN_TX } from "@/lib/pov/constants";
import type { DecodedEvent } from "@/lib/pov/types";
import type { BeliefRow } from "@/hooks/pov/useBeliefs";

interface LiveFeedProps {
  events: DecodedEvent[];
  beliefs: BeliefRow[];
  beliefTexts: Map<string, string>;
  ethUsd?: number;
  live: boolean;
  backfill: number;
  currency: Currency;
}

/** Feed row derived from a DecodedEvent — the only shape the UI renders. */
interface FeedRow {
  id: string; // chain + tx + logIndex
  kind: "NEW_BELIEF" | "YES_BUY" | "NO_BUY" | "YES_SELL" | "NO_SELL";
  beliefId?: string;
  beliefText: string;
  wallet: string;
  txHash: string;
  timestamp: number; // seconds
  usd?: number;
  wei?: bigint;
  large: boolean;
}

const LARGE_THRESHOLD_USD = 500;
const RENDER_CAP = 250;
const NEW_ROW_FLASH_MS = 1200;

type Lifecycle = "new" | "igniting" | "trending" | "dominant" | "cooling";

interface LifecycleView {
  key: Lifecycle;
  label: string;
  icon: string;
  className: string;
}

const LIFECYCLE: Record<Lifecycle, LifecycleView> = {
  new: { key: "new", label: "New", icon: "🌱", className: "text-[var(--info)]" },
  igniting: { key: "igniting", label: "Igniting", icon: "🔥", className: "text-[var(--down)]" },
  trending: { key: "trending", label: "Trending", icon: "⚡", className: "text-[var(--boost)]" },
  dominant: { key: "dominant", label: "Dominant", icon: "🏆", className: "text-[var(--pov)]" },
  cooling: { key: "cooling", label: "Cooling", icon: "📉", className: "text-[var(--ink-dim)]" },
};

const KIND_LABEL: Record<FeedRow["kind"], string> = {
  NEW_BELIEF: "NEW BELIEF",
  YES_BUY: "YES BUY",
  NO_BUY: "NO BUY",
  YES_SELL: "YES SELL",
  NO_SELL: "NO SELL",
};

const KIND_ACCENT: Record<FeedRow["kind"], string> = {
  NEW_BELIEF: "bg-[var(--pov)]",
  YES_BUY: "bg-[var(--up)]",
  NO_BUY: "bg-[var(--down)]",
  YES_SELL: "bg-transparent",
  NO_SELL: "bg-transparent",
};

const KIND_LABEL_COLOR: Record<FeedRow["kind"], string> = {
  NEW_BELIEF: "text-[var(--pov)]",
  YES_BUY: "text-[var(--up)]",
  NO_BUY: "text-[var(--down)]",
  YES_SELL: "text-[var(--up)]/70",
  NO_SELL: "text-[var(--down)]/70",
};

function toRow(
  e: DecodedEvent,
  beliefTexts: Map<string, string>,
  ethUsd?: number,
): FeedRow | null {
  const beliefText =
    (e.beliefId && beliefTexts.get(e.beliefId)) ??
    e.beliefText ??
    (e.beliefId ? `Belief #${e.beliefId}` : "");
  const wallet = e.from ?? "";
  const ts = e.timestamp ?? 0;
  const id = `8453:${e.txHash}:${e.logIndex}`;

  if (e.kind === "created") {
    return {
      id,
      kind: "NEW_BELIEF",
      beliefId: e.beliefId,
      beliefText,
      wallet,
      txHash: e.txHash,
      timestamp: ts,
      large: false,
    };
  }
  if (e.kind === "buy" || e.kind === "sell") {
    // Buy amount = gross ETH paid = tx.value; Sell = ETH received in event.
    const wei = e.kind === "buy" ? e.txValueWei : e.valueWei;
    const eth = wei ? Number(wei) / 1e18 : 0;
    const usd = ethUsd && eth ? eth * ethUsd : undefined;
    const side: "YES" | "NO" = e.yes === false ? "NO" : "YES";
    const kind: FeedRow["kind"] = `${side}_${e.kind === "buy" ? "BUY" : "SELL"}` as FeedRow["kind"];
    return {
      id,
      kind,
      beliefId: e.beliefId,
      beliefText,
      wallet,
      txHash: e.txHash,
      timestamp: ts,
      usd,
      wei: wei ?? undefined,
      large: (usd ?? 0) >= LARGE_THRESHOLD_USD,
    };
  }
  return null;
}

function computeLifecycles(beliefs: BeliefRow[]): Map<string, Lifecycle> {
  const now = Math.floor(Date.now() / 1000);
  const map = new Map<string, Lifecycle>();
  // Rank by 24h volume for trending / dominant.
  const ranked = [...beliefs].sort((a, b) =>
    b.volumeWei > a.volumeWei ? 1 : b.volumeWei < a.volumeWei ? -1 : 0,
  );
  const top20 = new Set(ranked.slice(0, 20).map((b) => b.id));
  const top10 = new Set(ranked.slice(0, 10).map((b) => b.id));

  for (const b of beliefs) {
    const ageSec = b.createdAt ? now - b.createdAt : Number.POSITIVE_INFINITY;
    const trades = b.totalBuys + b.totalSells;
    const idleSec = b.lastEventAt ? now - b.lastEventAt : Number.POSITIVE_INFINITY;

    let state: Lifecycle;
    if (ageSec < 7200 && trades < 10) state = "new";
    else if (idleSec > 6 * 3600 && !top20.has(b.id)) state = "cooling";
    else if (ageSec > 7 * 24 * 3600 && top10.has(b.id)) state = "dominant";
    else if (top20.has(b.id)) state = "trending";
    else if (b.totalBuys >= 3 && ageSec < 3600) state = "igniting";
    else state = trades > 0 ? "trending" : "new";
    map.set(b.id, state);
  }
  return map;
}

function LifecycleBadge({ state }: { state: Lifecycle }) {
  const v = LIFECYCLE[state];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em]",
        v.className,
      )}
      title={`${v.label} — lifecycle state`}
    >
      <span aria-hidden>{v.icon}</span>
      {v.label}
    </span>
  );
}

function Row({
  row,
  lifecycle,
  isNew,
  currency,
}: {
  row: FeedRow;
  lifecycle?: Lifecycle;
  isNew: boolean;
  currency: Currency;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSell = row.kind === "YES_SELL" || row.kind === "NO_SELL";
  const amount =
    currency === "eth"
      ? row.wei != null
        ? `${formatEth(row.wei, 4)} Ξ`
        : null
      : row.usd != null
        ? formatUsd(row.usd, row.usd >= 100 ? 0 : 2)
        : null;
  const label = row.large && !isSell ? `LARGE ${KIND_LABEL[row.kind]}` : KIND_LABEL[row.kind];

  return (
    <li
      className={clsx(
        "group relative flex gap-3 px-4 py-3 transition-colors",
        "focus-within:bg-[var(--surface-2)] hover:bg-[var(--surface-2)]",
        isNew && "motion-safe:animate-in motion-safe:fade-in bg-[var(--pov)]/5",
        isSell && "opacity-70",
      )}
    >
      <span
        aria-hidden
        className={clsx("w-[3px] shrink-0 self-stretch rounded-full", KIND_ACCENT[row.kind])}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
          <span className={clsx("font-semibold", KIND_LABEL_COLOR[row.kind])}>{label}</span>
          {amount && (
            <>
              <span className="text-[var(--ink-faint)]">·</span>
              <span className="tabular-nums text-[var(--ink)]">{amount}</span>
            </>
          )}
          {row.large && (
            <span
              className="ml-1 rounded-sm border border-[var(--boost)]/50 px-1 py-px text-[9px] text-[var(--boost)]"
              title="Trade of $500 or more"
            >
              LARGE
            </span>
          )}
          {lifecycle && (
            <span className="ml-auto">
              <LifecycleBadge state={lifecycle} />
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={clsx(
            "mt-1 block w-full text-left text-[14px] leading-snug text-[var(--ink)] outline-none",
            "hover:text-[var(--pov)] focus-visible:text-[var(--pov)]",
            !expanded && "line-clamp-2 md:line-clamp-2",
          )}
          aria-expanded={expanded}
          title={row.beliefText}
        >
          {row.beliefText || "—"}
        </button>

        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--ink-faint)]">
          <span>
            {row.kind === "NEW_BELIEF" ? "Created by " : ""}
            {row.wallet ? shortAddr(row.wallet) : "unknown"}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {row.timestamp ? `${timeAgo(row.timestamp * 1000)} ago` : "just now"}
          </span>
          <a
            href={BASESCAN_TX(row.txHash)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[var(--ink-faint)] hover:text-[var(--pov)]"
            aria-label="Open transaction on BaseScan"
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        </div>
      </div>
    </li>
  );
}

function SlowDaySummary({ rows }: { rows: FeedRow[] }) {
  const now = Math.floor(Date.now() / 1000);
  const day = rows.filter((r) => now - r.timestamp <= 24 * 3600);
  const beliefs = day.filter((r) => r.kind === "NEW_BELIEF").length;
  const wallets = new Set(day.map((r) => r.wallet).filter(Boolean)).size;
  const buyUsd = day
    .filter((r) => r.kind === "YES_BUY" || r.kind === "NO_BUY")
    .reduce((s, r) => s + (r.usd ?? 0), 0);
  return (
    <div className="border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
        Last 24 hours
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px] text-[var(--ink)]">
        <span>
          <span className="tabular-nums text-[13px]">{beliefs}</span>{" "}
          <span className="text-[var(--ink-dim)]">new beliefs</span>
        </span>
        <span>
          <span className="tabular-nums text-[13px]">{wallets}</span>{" "}
          <span className="text-[var(--ink-dim)]">active wallets</span>
        </span>
        <span>
          <span className="tabular-nums text-[13px]">{formatUsd(buyUsd, 0)}</span>{" "}
          <span className="text-[var(--ink-dim)]">in buy volume</span>
        </span>
      </div>
    </div>
  );
}

export function LiveFeed({
  events,
  beliefs,
  beliefTexts,
  ethUsd,
  live,
  backfill,
  currency,
}: LiveFeedProps) {
  const [largeOnly, setLargeOnly] = useState(false);
  const [queued, setQueued] = useState(0);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const atTopRef = useRef(true);
  const prevTopIdRef = useRef<string | null>(null);

  const lifecycles = useMemo(() => computeLifecycles(beliefs), [beliefs]);

  const allRows = useMemo(() => {
    const out: FeedRow[] = [];
    for (const e of events) {
      const r = toRow(e, beliefTexts, ethUsd);
      if (r) out.push(r);
    }
    return out
      .sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : -1))
      .slice(0, RENDER_CAP);
  }, [events, beliefTexts, ethUsd]);

  const filteredRows = useMemo(
    () => (largeOnly ? allRows.filter((r) => r.large) : allRows),
    [allRows, largeOnly],
  );

  // Track scroll position — freeze inserts when the user has scrolled away.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      atTopRef.current = el.scrollTop <= 8;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Compute "N new events" queue when the top row changes while scrolled away.
  useEffect(() => {
    const topId = filteredRows[0]?.id ?? null;
    const prev = prevTopIdRef.current;
    if (prev == null) {
      prevTopIdRef.current = topId;
      return;
    }
    if (topId === prev) return;
    if (atTopRef.current) {
      prevTopIdRef.current = topId;
      setQueued(0);
      return;
    }
    // Count how many new rows sit above the previously-seen top.
    const idx = filteredRows.findIndex((r) => r.id === prev);
    setQueued(idx > 0 ? idx : filteredRows.length);
  }, [filteredRows]);

  // Track which ids are newly rendered so we can flash them once.
  useEffect(() => {
    const currentIds = filteredRows.map((r) => r.id);
    setVisibleIds((prev) => {
      const next = new Set<string>();
      for (const id of currentIds) if (!prev.has(id)) next.add(id);
      return next.size ? new Set([...prev, ...currentIds]) : prev;
    });
    const timer = window.setTimeout(() => {
      setVisibleIds(new Set(currentIds));
    }, NEW_ROW_FLASH_MS);
    return () => clearTimeout(timer);
  }, [filteredRows]);

  const showQueue = queued > 0 && !atTopRef.current;
  const insertQueued = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    prevTopIdRef.current = filteredRows[0]?.id ?? null;
    setQueued(0);
  };

  const slowDay = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const last15 = allRows.filter((r) => now - r.timestamp <= 15 * 60).length;
    return live && last15 < 5;
  }, [allRows, live]);

  const meta = live
    ? `${filteredRows.length} shown${largeOnly ? " · large only" : ""}`
    : `loading ${Math.round(backfill * 100)}%`;

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
      <div className="relative">
        {slowDay && <SlowDaySummary rows={allRows} />}

        {showQueue && (
          <button
            type="button"
            onClick={insertQueued}
            className="sticky top-2 z-10 mx-auto flex items-center gap-2 rounded-full border border-[var(--pov)]/60 bg-[var(--surface)] px-3 py-1 text-[11px] text-[var(--pov)] shadow-lg hover:bg-[var(--pov)]/10"
          >
            {queued} new event{queued === 1 ? "" : "s"} ↑
          </button>
        )}

        <div
          ref={scrollRef}
          className="max-h-[640px] min-h-[500px] overflow-y-auto"
          aria-live="polite"
          aria-label="POV live activity feed"
        >
          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--ink-dim)]">
              {largeOnly
                ? "No large trades in the current window. Turn Large-only off to see everything."
                : "Live activity is temporarily unavailable. Showing the most recently indexed events."}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line-dim)]">
              {filteredRows.map((r) => (
                <Row
                  key={r.id}
                  row={r}
                  lifecycle={r.beliefId ? lifecycles.get(r.beliefId) : undefined}
                  isNew={visibleIds.has(r.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
