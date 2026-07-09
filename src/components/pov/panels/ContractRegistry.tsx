import { Panel } from "../primitives/Panel";
import { AddrLink } from "../primitives/AddrLink";
import { POV_CONTRACTS } from "@/lib/pov/constants";
import { formatEth } from "@/lib/pov/format";
import type { DecodedEvent } from "@/lib/pov/types";

interface Props {
  balances: Record<string, bigint>;
  events: DecodedEvent[];
}

const ROWS: { key: keyof typeof POV_CONTRACTS; label: string; sub: string }[] =
  [
    {
      key: "beliefMarketProxy",
      label: "BeliefMarket (proxy)",
      sub: "state, entrypoint",
    },
    {
      key: "beliefMarketImpl",
      label: "BeliefMarket (impl)",
      sub: "logic, no state",
    },
    {
      key: "beliefTokenImpl",
      label: "BeliefToken (impl)",
      sub: "per-belief ERC20",
    },
    { key: "linearCurve", label: "Linear curve", sub: "bonding curve" },
    { key: "cpCurve", label: "CP curve", sub: "constant product, 69e18" },
    { key: "degenBoost", label: "DegenBoost", sub: "amplifier + buyback" },
  ];

export function ContractRegistry({ balances, events }: Props) {
  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.address] = (acc[e.address] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <Panel title="Contract registry" meta="Base · chainId 8453" bodyClassName="p-0">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            <th className="border-b border-[var(--line)] px-3 py-2 font-normal">
              Contract
            </th>
            <th className="border-b border-[var(--line)] px-3 py-2 font-normal">
              Address
            </th>
            <th className="border-b border-[var(--line)] px-3 py-2 text-right font-normal">
              Balance
            </th>
            <th className="border-b border-[var(--line)] px-3 py-2 text-right font-normal">
              Events (feed)
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const addr = POV_CONTRACTS[r.key];
            const bal = balances[addr.toLowerCase()];
            const c = counts[addr.toLowerCase()] ?? 0;
            return (
              <tr key={r.key}>
                <td className="border-b border-[var(--line-dim)] px-3 py-2">
                  <div className="text-[var(--ink)]">{r.label}</div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                    {r.sub}
                  </div>
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2">
                  <AddrLink value={addr} short={6} />
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right tabular-nums text-[var(--ink)]">
                  {bal != null ? `${formatEth(bal, 4)} Ξ` : "—"}
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right tabular-nums text-[var(--ink-dim)]">
                  {c}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
