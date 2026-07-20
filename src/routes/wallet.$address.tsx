import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatEthAmount, formatPct, formatUsd } from "@/lib/pov/format";
import { useApiWallet, useApiWalletTimeline } from "@/hooks/pov/useApiPulse";
import { useDegenPrice } from "@/hooks/pov/useDegenPrice";
import { EthUsdConverter } from "@/components/pov/EthUsdConverter";
import { WalletTimelineChart } from "@/components/pulse/WalletTimelineChart";
import { WalletCashFlowPanel } from "@/components/pulse/WalletCashFlowPanel";
import { WALLET_RE, type PositionState, type WalletPosition } from "@/lib/pov/wallet";


export const Route = createFileRoute("/wallet/$address")({
  component: WalletPage,
});

const GREEN = "var(--up)";
const RED = "var(--down)";

type Denom = "eth" | "usd";

const STATE_META: Record<PositionState, { label: string; tone: "up" | "down"; paper: boolean }> = {
  won: { label: "In profit", tone: "up", paper: false },
  lost: { label: "In loss", tone: "down", paper: false },
  open_up: { label: "On paper · up", tone: "up", paper: true },
  open_down: { label: "On paper · down", tone: "down", paper: true },
};

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const roiText = (roi: number | null) =>
  roi == null || !Number.isFinite(roi) ? "—" : formatPct(roi * 100, 0);
const signColor = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : "var(--ink-dim)");

/** Format an ETH amount as either ETH or USD depending on the toggle. */
function fmtAmount(eth: number, denom: Denom, ethUsd?: number): string {
  if (denom === "usd") {
    if (!ethUsd) return "—";
    const usd = eth * ethUsd;
    return formatUsd(usd, Math.abs(usd) >= 1 ? 2 : 4);
  }
  return formatEthAmount(eth);
}

type SortCol =
  | "market"
  | "side"
  | "in_eth"
  | "out_eth"
  | "realized_eth"
  | "hold_value_eth"
  | "unrealized_eth"
  | "roi"
  | "state";
type SortDir = "asc" | "desc";
interface SortState { col: SortCol; dir: SortDir }

const STATE_ORDER: Record<PositionState, number> = { won: 0, open_up: 1, open_down: 2, lost: 3 };

function sortPositions(rows: WalletPosition[], sort: SortState): WalletPosition[] {
  const mul = sort.dir === "asc" ? 1 : -1;
  const getKey = (p: WalletPosition): number | string => {
    switch (sort.col) {
      case "market": return (p.title ?? `Belief ${p.belief_id}`).toLowerCase();
      case "side": return p.side;
      case "state": return STATE_ORDER[p.state];
      case "roi": return p.roi == null || !Number.isFinite(p.roi) ? -Infinity : p.roi;
      default: return p[sort.col];
    }
  };
  return [...rows].sort((a, b) => {
    const av = getKey(a); const bv = getKey(b);
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });
}

function SortHeader({
  label, col, align, sort, onSort,
}: {
  label: string;
  col: SortCol;
  align: "left" | "right";
  sort: SortState;
  onSort: (s: SortState) => void;
}) {
  const active = sort.col === col;
  const arrow = !active ? "↕" : sort.dir === "asc" ? "↑" : "↓";
  return (
    <th className={clsx("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort({ col, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
        className={clsx(
          "inline-flex items-center gap-1 uppercase tracking-[0.14em] transition-colors hover:text-[var(--ink)]",
          active ? "text-[var(--ink)]" : "text-[var(--ink-faint)]",
        )}
      >
        <span>{label}</span>
        <span className="text-[9px] opacity-70">{arrow}</span>
      </button>
    </th>
  );
}


function DenomToggle({ denom, onChange, disabled }: { denom: Denom; onChange: (d: Denom) => void; disabled?: boolean }) {
  return (
    <div
      className={clsx(
        "flex items-center border border-[var(--line)] text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]",
        disabled && "opacity-50",
      )}
      title={disabled ? "waiting for ETH/USD rate…" : "Switch amounts between ETH and USD"}
    >
      <button
        type="button"
        onClick={() => onChange("eth")}
        className={clsx("px-2 py-[2px] transition-colors", denom === "eth" && "bg-[var(--pov)] text-[var(--bg)]")}
      >
        ETH
      </button>
      <button
        type="button"
        onClick={() => onChange("usd")}
        disabled={disabled}
        className={clsx("px-2 py-[2px] transition-colors", denom === "usd" && "bg-[var(--pov)] text-[var(--bg)]")}
      >
        USD
      </button>
    </div>
  );
}

function Tile({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">{label}</span>
      <span className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: color ?? "var(--ink)" }}>
        {value}
      </span>
      {sub && <span className="text-[11px] text-[var(--ink-dim)]">{sub}</span>}
    </div>
  );
}

function StateBadge({ state }: { state: PositionState }) {
  const m = STATE_META[state];
  const color = m.tone === "up" ? GREEN : RED;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px]" style={{ color }}>
      <span
        className="inline-block h-[9px] w-[9px] rounded-full"
        style={m.paper ? { border: `2px solid ${color}` } : { background: color }}
      />
      {m.label}
    </span>
  );
}

function PositionRow({ p, denom, ethUsd }: { p: WalletPosition; denom: Denom; ethUsd?: number }) {
  const num = (n: number, color?: boolean) => (
    <td
      className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
      style={color ? { color: signColor(n) } : undefined}
    >
      {fmtAmount(n, denom, ethUsd)}
    </td>
  );
  return (
    <tr className="border-t border-[var(--line-dim)]">
      <td className="max-w-[320px] whitespace-normal break-words px-3 py-2 leading-snug" title={p.title ?? `Belief ${p.belief_id}`}>
        {p.title ?? `Belief #${p.belief_id}`}
      </td>
      <td className="px-3 py-2 uppercase text-[var(--ink-dim)]">{p.side}</td>
      {num(p.in_eth)}
      {num(p.out_eth)}
      {num(p.realized_eth, true)}
      {num(p.hold_value_eth)}
      {num(p.unrealized_eth, true)}
      <td
        className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums"
        style={{ color: p.roi == null ? "var(--ink-dim)" : signColor(p.roi) }}
      >
        {roiText(p.roi)}
      </td>
      <td className="px-3 py-2">
        <StateBadge state={p.state} />
      </td>
    </tr>
  );
}

function WalletPage() {
  const { address } = Route.useParams();
  const valid = WALLET_RE.test(address);
  const { data, isLoading, error } = useApiWallet(valid ? address : undefined);
  const timeline = useApiWalletTimeline(valid ? address : undefined);
  const { snapshot: degen } = useDegenPrice();
  const ethUsd = degen && degen.priceEth > 0 ? degen.priceUsd / degen.priceEth : undefined;
  const [denom, setDenom] = useState<Denom>("eth");
  const [sort, setSort] = useState<SortState>({ col: "in_eth", dir: "desc" });

  const effectiveDenom: Denom = denom === "usd" && !ethUsd ? "eth" : denom;

  const s = data?.summary;
  const denomLabel = effectiveDenom === "usd" ? "USD" : "ETH";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/" className="text-[12px] text-[var(--ink-dim)] hover:text-[var(--ink)]">
              ← back to pulse
            </Link>
            <h1 className="mt-1 font-mono text-[18px] font-semibold tabular-nums">
              {valid ? shortAddr(address) : "Wallet"}
            </h1>
            {valid && <div className="break-all font-mono text-[11px] text-[var(--ink-faint)]">{address}</div>}
          </div>
          <div className="flex items-center gap-3">
            <DenomToggle denom={denom} onChange={setDenom} disabled={!ethUsd} />
            <EthUsdConverter ethUsd={ethUsd} />
          </div>
        </div>


        {!valid ? (
          <Panel title="Wallet lookup" meta="invalid address" bodyClassName="p-4">
            <p className="text-[14px] text-[var(--ink-dim)]">
              That doesn't look like a wallet address. Expected a 42-character 0x… address.
            </p>
          </Panel>
        ) : error ? (
          <Panel title="Wallet" meta="error" bodyClassName="p-4">
            <p className="text-[14px] text-[var(--down)]">Couldn't load this wallet. Try again.</p>
          </Panel>
        ) : (
          <>
            {/* ROLLUP */}
            <Panel title="Lifetime P&L" meta={`all positions · priced in ${denomLabel}`} bodyClassName="p-0">
              {isLoading || !s ? (
                <div className="p-4">
                  <Skeleton className="h-8 w-64" />
                </div>
              ) : s.positions === 0 ? (
                <div className="p-4 text-[15px] text-[var(--ink-dim)]">
                  No positions found for this wallet.
                </div>
              ) : (
                <>
                  <div className="border-b border-[var(--line-dim)] px-4 py-4">
                    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span
                            className="text-[34px] font-semibold leading-none tabular-nums"
                            style={{ color: signColor(s.net_eth) }}
                          >
                            {fmtAmount(s.net_eth, effectiveDenom, ethUsd)}
                          </span>
                          <span className="text-[15px] text-[var(--ink)]">net P&L</span>
                        </div>
                        <div className="mt-1 text-[13px] text-[var(--ink-dim)]">
                          {s.realized_eth >= 0 ? "+" : ""}
                          {fmtAmount(s.realized_eth, effectiveDenom, ethUsd)} realized ·{" "}
                          {s.unrealized_eth >= 0 ? "+" : ""}
                          {fmtAmount(s.unrealized_eth, effectiveDenom, ethUsd)} on paper
                        </div>
                      </div>
                      <div className="text-[13px] leading-tight text-[var(--ink-dim)]">
                        <span
                          className="text-[22px] font-semibold tabular-nums"
                          style={{ color: s.overall_roi == null ? "var(--ink)" : signColor(s.overall_roi) }}
                        >
                          {roiText(s.overall_roi)}
                        </span>{" "}
                        overall ROI
                        <div className="text-[11px] text-[var(--ink-faint)]">net ÷ deposited</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
                    <Tile label="Deposited" value={fmtAmount(s.deposited_eth, effectiveDenom, ethUsd)} sub="total bought" />
                    <Tile label="Withdrawn" value={fmtAmount(s.withdrawn_eth, effectiveDenom, ethUsd)} sub="total sold" />
                    <Tile
                      label="Still holding"
                      value={fmtAmount(s.holding_value_eth, effectiveDenom, ethUsd)}
                      sub="at last price"
                    />
                    <Tile
                      label="Positions"
                      value={s.positions.toLocaleString()}
                      sub={`${s.won}W · ${s.lost}L · ${s.open_up + s.open_down} open`}
                    />
                  </div>
                </>
              )}
            </Panel>

            {/* CASH FLOW */}
            {valid && <WalletCashFlowPanel address={address.toLowerCase()} />}

            {/* TIMELINE */}
            {s && s.positions > 0 && (
              <WalletTimelineChart
                points={timeline.data?.points}
                denom={effectiveDenom}
                ethUsd={ethUsd}
                loading={timeline.isLoading}
              />
            )}

            {/* POSITIONS */}
            {s && s.positions > 0 && (
              <Panel title="Positions" meta={`${s.positions} · one row per market side · ${denomLabel}`} bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                        <SortHeader label="Market" col="market" align="left" sort={sort} onSort={setSort} />
                        <SortHeader label="Side" col="side" align="left" sort={sort} onSort={setSort} />
                        <SortHeader label="In" col="in_eth" align="right" sort={sort} onSort={setSort} />
                        <SortHeader label="Out" col="out_eth" align="right" sort={sort} onSort={setSort} />
                        <SortHeader label="Realized" col="realized_eth" align="right" sort={sort} onSort={setSort} />
                        <SortHeader label="Held" col="hold_value_eth" align="right" sort={sort} onSort={setSort} />
                        <SortHeader label="On paper" col="unrealized_eth" align="right" sort={sort} onSort={setSort} />
                        <SortHeader label="ROI" col="roi" align="right" sort={sort} onSort={setSort} />
                        <SortHeader label="State" col="state" align="left" sort={sort} onSort={setSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {sortPositions(data!.positions, sort).map((p) => (
                        <PositionRow key={`${p.belief_id}-${p.side}`} p={p} denom={effectiveDenom} ethUsd={ethUsd} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

          </>
        )}
      </main>
    </div>
  );
}
