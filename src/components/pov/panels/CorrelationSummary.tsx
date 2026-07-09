import { Panel } from "../primitives/Panel";
import { Metric } from "../primitives/Metric";
import type { CorrelationSummary } from "@/lib/pov/correlations";

interface Props {
  summary: CorrelationSummary;
}

function rColor(r: number): string {
  if (!Number.isFinite(r) || r === 0) return "var(--ink-dim)";
  return r > 0 ? "var(--up)" : "var(--down)";
}

function rLabel(r: number): string {
  const a = Math.abs(r);
  if (a < 0.1) return "none";
  if (a < 0.3) return "weak";
  if (a < 0.5) return "moderate";
  if (a < 0.7) return "strong";
  return "very strong";
}

export function CorrelationSummary({ summary }: Props) {
  const { pearsonEventsVolume, pearsonEventsReturn, pearsonBuysReturn, bestLag, n } =
    summary;

  return (
    <Panel
      title="Correlation summary"
      meta={n ? `n=${n} hourly obs` : "—"}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric
          label="Events × DEGEN vol"
          value={pearsonEventsVolume.toFixed(3)}
          hint={rLabel(pearsonEventsVolume)}
          valueColor={rColor(pearsonEventsVolume)}
        />
        <Metric
          label="Events × DEGEN return"
          value={pearsonEventsReturn.toFixed(3)}
          hint={rLabel(pearsonEventsReturn)}
          valueColor={rColor(pearsonEventsReturn)}
        />
        <Metric
          label="Buys × DEGEN return"
          value={pearsonBuysReturn.toFixed(3)}
          hint={rLabel(pearsonBuysReturn)}
          valueColor={rColor(pearsonBuysReturn)}
        />
        <Metric
          label="Best lead/lag"
          value={
            bestLag
              ? `${bestLag.lag >= 0 ? "+" : ""}${bestLag.lag}h`
              : "—"
          }
          hint={
            bestLag
              ? `r ${bestLag.r.toFixed(3)} · ${
                  bestLag.lag > 0
                    ? "POV leads"
                    : bestLag.lag < 0
                      ? "DEGEN leads"
                      : "contemporaneous"
                }`
              : "insufficient overlap"
          }
          valueColor={bestLag ? rColor(bestLag.r) : undefined}
        />
      </div>
      <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        Pearson r on hourly series · lag &gt; 0 → POV activity precedes DEGEN move
      </p>
    </Panel>
  );
}
