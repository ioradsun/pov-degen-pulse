import { Panel } from "../primitives/Panel";
import { AddrLink } from "../primitives/AddrLink";
import { CONTRACT_LABELS, POV_CONTRACTS } from "@/lib/pov/constants";
import type { AbiState } from "@/hooks/pov/useAbis";

export function AbiStatus({ state }: { state: AbiState }) {
  const status = new Map(state.results.map((r) => [r.address, r]));
  const okCount = state.results.filter((r) => r.ok).length;
  const total = state.results.length || Object.values(POV_CONTRACTS).length;

  return (
    <Panel
      title="ABI status"
      meta={
        state.loading
          ? "loading…"
          : `${okCount} / ${total} decoded${state.error ? ` · ${state.error}` : ""}`
      }
      bodyClassName="p-0"
    >
      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {Object.values(POV_CONTRACTS).map((addr) => {
            const key = addr.toLowerCase();
            const r = status.get(key);
            const label = CONTRACT_LABELS[key] ?? "Unknown";
            const events =
              r?.abi?.filter((i) => (i as { type?: string }).type === "event")
                .length ?? 0;
            return (
              <tr key={addr}>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-[var(--ink)]">
                  {label}
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-[var(--ink-dim)]">
                  <AddrLink value={addr} short={5} />
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right tabular-nums text-[var(--ink-dim)]">
                  {r?.ok
                    ? `${events} events`
                    : r?.error ?? (state.loading ? "…" : "—")}
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right">
                  <span
                    className={
                      "inline-block h-2 w-2 rounded-full " +
                      (r?.ok
                        ? "bg-[var(--up)]"
                        : state.loading
                          ? "bg-[var(--ink-faint)]"
                          : "bg-[var(--down)]")
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
