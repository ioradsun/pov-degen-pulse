import { Panel } from "../primitives/Panel";
import type { RpcHealthState } from "@/lib/pov/types";
import { timeAgo } from "@/lib/pov/format";

export function RpcHealth({ health }: { health: RpcHealthState }) {
  const rate =
    health.attempts > 0
      ? (health.successes / health.attempts) * 100
      : 0;
  const endpoints = Object.entries(health.perEndpoint).sort(
    ([, a], [, b]) => b.s + b.f - (a.s + a.f),
  );
  return (
    <Panel
      title="RPC health"
      meta={`${health.successes}/${health.attempts} · ${rate.toFixed(0)}%`}
      bodyClassName="p-0"
    >
      <div className="space-y-2 p-4 text-[11px]">
        <div className="flex justify-between text-[var(--ink-dim)]">
          <span>Active</span>
          <span className="tabular-nums text-[var(--ink)]">
            {health.active.replace("https://", "")}
          </span>
        </div>
        {health.lastError && (
          <div className="flex justify-between text-[var(--down)]">
            <span>Last error</span>
            <span className="tabular-nums">
              {health.lastErrorAt ? timeAgo(health.lastErrorAt) : "—"}
            </span>
          </div>
        )}
      </div>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            <th className="border-y border-[var(--line)] px-3 py-2 font-normal">
              Endpoint
            </th>
            <th className="border-y border-[var(--line)] px-3 py-2 text-right font-normal">
              OK
            </th>
            <th className="border-y border-[var(--line)] px-3 py-2 text-right font-normal">
              Fail
            </th>
            <th className="border-y border-[var(--line)] px-3 py-2 text-right font-normal">
              Rate
            </th>
          </tr>
        </thead>
        <tbody>
          {endpoints.length === 0 && (
            <tr>
              <td
                colSpan={4}
                className="px-3 py-4 text-center text-[var(--ink-faint)]"
              >
                no calls yet
              </td>
            </tr>
          )}
          {endpoints.map(([url, v]) => {
            const total = v.s + v.f;
            const r = total ? (v.s / total) * 100 : 0;
            return (
              <tr key={url}>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-[var(--ink)]">
                  {url.replace("https://", "")}
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right tabular-nums text-[var(--up)]">
                  {v.s}
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right tabular-nums text-[var(--down)]">
                  {v.f}
                </td>
                <td className="border-b border-[var(--line-dim)] px-3 py-2 text-right tabular-nums text-[var(--ink-dim)]">
                  {r.toFixed(0)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {health.lastError && (
        <div className="border-t border-[var(--line)] px-4 py-2 text-[11px] text-[var(--down)]">
          {health.lastError}
        </div>
      )}
    </Panel>
  );
}
