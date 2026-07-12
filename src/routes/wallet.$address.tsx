import { createFileRoute, Link } from "@tanstack/react-router";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatEthAmount, formatPct } from "@/lib/pov/format";
import { useApiWallet } from "@/hooks/pov/useApiPulse";
import { WALLET_RE, type PositionState, type WalletPosition } from "@/lib/pov/wallet";

export const Route = createFileRoute("/wallet/$address")({
  component: WalletPage,
});

const GREEN = "var(--up)";
const RED = "var(--down)";

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

function PositionRow({ p }: { p: WalletPosition }) {
  const num = (n: number, color?: boolean) => (
    <td
      className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
      style={color ? { color: signColor(n) } : undefined}
    >
      {formatEthAmount(n)}
    </td>
  );
  return (
    <tr className="border-t border-[var(--line-dim)]">
      <td className="max-w-[220px] truncate px-3 py-2" title={p.title ?? `Belief ${p.belief_id}`}>
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

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link to="/" className="text-[12px] text-[var(--ink-dim)] hover:text-[var(--ink)]">
              ← back to pulse
            </Link>
            <h1 className="mt-1 font-mono text-[18px] font-semibold tabular-nums">
              {valid ? shortAddr(address) : "Wallet"}
            </h1>
            {valid && <div className="break-all font-mono text-[11px] text-[var(--ink-faint)]">{address}</div>}
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
            <Panel title="Lifetime P&L" meta="all positions · priced in ETH" bodyClassName="p-0">
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
                            {formatEthAmount(s.net_eth)}
                          </span>
                          <span className="text-[15px] text-[var(--ink)]">net P&L</span>
                        </div>
                        <div className="mt-1 text-[13px] text-[var(--ink-dim)]">
                          {s.realized_eth >= 0 ? "+" : ""}
                          {formatEthAmount(s.realized_eth)} realized ·{" "}
                          {s.unrealized_eth >= 0 ? "+" : ""}
                          {formatEthAmount(s.unrealized_eth)} on paper
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
                    <Tile label="Deposited" value={formatEthAmount(s.deposited_eth)} sub="total bought" />
                    <Tile label="Withdrawn" value={formatEthAmount(s.withdrawn_eth)} sub="total sold" />
                    <Tile
                      label="Still holding"
                      value={formatEthAmount(s.holding_value_eth)}
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

            {/* POSITIONS */}
            {s && s.positions > 0 && (
              <Panel title="Positions" meta={`${s.positions} · one row per market side`} bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                        <th className="px-3 py-2 text-left font-medium">Market</th>
                        <th className="px-3 py-2 text-left font-medium">Side</th>
                        <th className="px-3 py-2 text-right font-medium">In</th>
                        <th className="px-3 py-2 text-right font-medium">Out</th>
                        <th className="px-3 py-2 text-right font-medium">Realized</th>
                        <th className="px-3 py-2 text-right font-medium">Held</th>
                        <th className="px-3 py-2 text-right font-medium">On paper</th>
                        <th className="px-3 py-2 text-right font-medium">ROI</th>
                        <th className="px-3 py-2 text-left font-medium">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.positions.map((p) => (
                        <PositionRow key={`${p.belief_id}-${p.side}`} p={p} />
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
