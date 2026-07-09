import { Panel } from "../primitives/Panel";
import { Pill } from "../primitives/Pill";
import { AddrLink } from "../primitives/AddrLink";
import { formatEth, timeAgo } from "@/lib/pov/format";
import type { DecodedEvent } from "@/lib/pov/types";

interface Props {
  events: DecodedEvent[];
}

export function LiveFeed({ events }: Props) {
  return (
    <Panel
      title="Live feed"
      meta={`${events.length} events`}
      bodyClassName="p-0"
    >
      {events.length === 0 ? (
        <div className="p-6 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          waiting for first event…
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 bg-[var(--surface)]">
              <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                <th className="border-b border-[var(--line)] px-3 py-2 font-normal">
                  Age
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 font-normal">
                  Kind
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 font-normal">
                  Contract
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 font-normal">
                  Event
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 font-normal">
                  From → To
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-right font-normal">
                  Value
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-right font-normal">
                  Tx
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const isNew = e._newUntil && Date.now() < e._newUntil;
                return (
                  <tr
                    key={`${e.txHash}-${e.logIndex}`}
                    className="align-middle transition-colors"
                    style={
                      isNew
                        ? { backgroundColor: "rgba(245, 212, 107, 0.14)" }
                        : undefined
                    }
                  >
                    <td className="border-b border-[var(--line-dim)] px-3 py-2 tabular-nums text-[var(--ink-dim)]">
                      {e.timestamp ? timeAgo(e.timestamp * 1000) : "—"}
                    </td>
                    <td className="border-b border-[var(--line-dim)] px-3 py-2">
                      <Pill kind={e.kind}>{e.kind}</Pill>
                    </td>
                    <td className="border-b border-[var(--line-dim)] px-3 py-2 text-[var(--ink)]">
                      {e.contractLabel}
                    </td>
                    <td className="border-b border-[var(--line-dim)] px-3 py-2 text-[var(--ink-dim)]">
                      {e.eventName}
                    </td>
                    <td className="border-b border-[var(--line-dim)] px-3 py-2">
                      {e.from ? (
                        <span className="flex items-center gap-1">
                          <AddrLink value={e.from} />
                          {e.to && (
                            <>
                              <span className="text-[var(--ink-faint)]">→</span>
                              <AddrLink value={e.to} />
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-[var(--ink-faint)]">—</span>
                      )}
                    </td>
                    <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right tabular-nums text-[var(--ink)]">
                      {e.valueWei != null ? formatEth(e.valueWei) : "—"}
                    </td>
                    <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right">
                      <AddrLink value={e.txHash} kind="tx" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
