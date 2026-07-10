import { useState } from "react";
import { Panel } from "@/components/pov/primitives/Panel";
import { fetchInsight, type InsightResult, type PulseInsight } from "@/lib/pov/insights.functions";
import { timeAgo } from "@/lib/pov/format";

interface InsightPanelProps {
  /** Compact JSON snapshot of the current pulse (built in the route). */
  snapshot: string;
  ready: boolean;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {label}
      </div>
      <div className="text-[12px] leading-relaxed text-[var(--ink)]">{children}</div>
    </div>
  );
}

export function InsightPanel({ snapshot, ready }: InsightPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsightResult | null>(null);

  async function run(force = false) {
    setLoading(true);
    try {
      const r = await fetchInsight({ data: { snapshot, force } });
      setResult(r);
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const insight: PulseInsight | undefined = result?.ok ? result.insight : undefined;

  return (
    <Panel
      title="AI read"
      meta={result?.generatedAt ? `as of ${timeAgo(result.generatedAt)} ago` : undefined}
      action={
        <button
          onClick={() => run(!!result)}
          disabled={loading || !ready}
          className="border border-[var(--line)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--pov)] transition-colors hover:border-[var(--pov)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Reading…" : result ? "Refresh" : "Read the tape"}
        </button>
      }
    >
      {!result && !loading && (
        <p className="text-[12px] leading-relaxed text-[var(--ink-dim)]">
          {ready
            ? "Get a plain-English read on what beliefs are trending, where the money is flowing, and what it means for DEGEN."
            : "Waiting for on-chain data to load…"}
        </p>
      )}
      {loading && (
        <p className="animate-pulse text-[12px] text-[var(--ink-dim)]">
          Reading 24h of beliefs, flows, and DEGEN price action…
        </p>
      )}
      {result && !result.ok && !loading && (
        <p className="text-[12px] leading-relaxed text-[var(--down)]">{result.error}</p>
      )}
      {insight && !loading && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] leading-snug text-[var(--pov)]">{insight.headline}</p>
          <Section label="Belief themes">
            <ul className="flex flex-col gap-1">
              {insight.themes.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--ink-faint)]">·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section label="Momentum">{insight.momentum}</Section>
          <Section label="DEGEN read-through">{insight.degenReadThrough}</Section>
          <Section label="Watch next">{insight.watch}</Section>
        </div>
      )}
    </Panel>
  );
}
