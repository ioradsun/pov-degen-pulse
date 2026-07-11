import { Panel } from "@/components/pov/primitives/Panel";
import { useApiRetention } from "@/hooks/pov/useApiPulse";

export function RepeatWalletCard() {
  const { data, isLoading } = useApiRetention();
  const newWallets = data?.new_wallets ?? 0;
  const repeatWallets = data?.repeat_wallets ?? 0;
  const rate = data?.repeat_rate;

  return (
    <Panel title="Repeat traders" meta={isLoading ? "loading…" : undefined}>
      <div className="flex flex-col gap-1">
        <div className="text-[40px] leading-none tabular-nums text-[var(--pov)]">
          {rate == null ? "—" : `${Math.round(rate * 100)}%`}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--ink-dim)]">
          {newWallets > 0
            ? `${repeatWallets} of ${newWallets} new wallets returned within 7 days`
            : "Not enough wallet history yet — needs wallets whose first buy was 7+ days ago."}
        </p>
      </div>
    </Panel>
  );
}
