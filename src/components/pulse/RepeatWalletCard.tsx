import { Panel } from "@/components/pov/primitives/Panel";
import { useApiRetention } from "@/hooks/pov/useApiPulse";

export function RepeatWalletCard() {
  const { data, isLoading } = useApiRetention();
  const newWallets = data?.new_wallets ?? 0;
  const repeatWallets = data?.repeat_wallets ?? 0;
  const rate = data?.repeat_rate;
  // repeat_wallets is supposed to be a subset of new_wallets (wallets whose
  // first buy was 7+ days ago that came back). If the backing SQL function
  // ever regresses to the earlier "active in last 24h, partitioned into new
  // vs repeat" definition, repeat_wallets can exceed new_wallets and the
  // "X of Y" phrasing below would be self-contradictory — guard for that
  // rather than assume the invariant always holds.
  const subsetHolds = repeatWallets <= newWallets;

  return (
    <Panel title="Repeat traders" meta={isLoading ? "loading…" : undefined}>
      <div className="flex flex-col gap-1">
        <div className="text-[40px] leading-none tabular-nums text-[var(--pov)]">
          {rate == null ? "—" : `${Math.round(rate * 100)}%`}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--ink-dim)]">
          {newWallets === 0 && repeatWallets === 0
            ? "Not enough wallet history yet — needs wallets whose first buy was 7+ days ago."
            : subsetHolds
              ? `${repeatWallets} of ${newWallets} new wallets returned within 7 days`
              : `${repeatWallets} repeat, ${newWallets} new wallets (last 24h)`}
        </p>
      </div>
    </Panel>
  );
}
