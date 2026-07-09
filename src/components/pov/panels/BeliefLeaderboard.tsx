import { Panel } from "../primitives/Panel";
import { AddrLink } from "../primitives/AddrLink";
import { Pill } from "../primitives/Pill";
import { formatEth, formatCompact, timeAgo } from "@/lib/pov/format";
import type { BeliefRow } from "@/hooks/pov/useBeliefs";

export function BeliefLeaderboard({ beliefs }: { beliefs: BeliefRow[] }) {
  return (
    <Panel
      title="Belief leaderboard"
      meta={`${beliefs.length} beliefs · sorted by recency`}
      bodyClassName="p-0"
    >
      {beliefs.length === 0 ? (
        <div className="p-6 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          no belief tokens decoded yet — waiting for BeliefCreated / buy / sell events
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 bg-[var(--surface)]">
              <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                <Th>Belief</Th>
                <Th>Curve</Th>
                <Th align="right">Buys</Th>
                <Th align="right">Sells</Th>
                <Th align="right">Volume</Th>
                <Th align="right">Boosts</Th>
                <Th align="right">Participants</Th>
                <Th align="right">Last</Th>
              </tr>
            </thead>
            <tbody>
              {beliefs.map((b) => (
                <tr key={b.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--ink)]">
                        #{b.id.length > 12 ? `${b.id.slice(0, 6)}…` : b.id}
                      </span>
                      {b.yesToken && (
                        <AddrLink value={b.yesToken} short={4} />
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Pill
                      kind={
                        b.curve === "linear"
                          ? "created"
                          : b.curve === "cp"
                            ? "boost"
                            : "unknown"
                      }
                    >
                      {b.curve}
                    </Pill>
                  </Td>
                  <Td align="right" className="text-[var(--up)]">
                    {b.totalBuys}
                  </Td>
                  <Td align="right" className="text-[var(--down)]">
                    {b.totalSells}
                  </Td>
                  <Td align="right">{formatEth(b.volumeWei, 3)} Ξ</Td>
                  <Td align="right" className="text-[var(--boost)]">
                    {b.boostCount}
                  </Td>
                  <Td align="right">{formatCompact(b.participants)}</Td>
                  <Td align="right" className="text-[var(--ink-dim)]">
                    {b.lastEventAt
                      ? timeAgo(b.lastEventAt * 1000)
                      : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={
        "border-b border-[var(--line)] px-3 py-2 font-normal " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <td
      className={
        "border-b border-[var(--line-dim)] px-3 py-2 tabular-nums " +
        (align === "right" ? "text-right " : "") +
        (className ?? "text-[var(--ink)]")
      }
    >
      {children}
    </td>
  );
}
