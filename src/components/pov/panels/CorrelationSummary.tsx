import { Panel } from "../primitives/Panel";
import type { CorrelationSummary as Summary } from "@/lib/pov/correlations";

interface Props {
  summary: Summary;
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

function Cell({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-4 border-r border-[var(--line-dim)] last:border-r-0">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {label}
      </div>
      <div
        className="text-[24px] leading-none tabular-nums"
        style={{ color: color ?? "var(--ink)" }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
        {sub}
      </div>
    </div>
  );
}

export function CorrelationSummary({ summary }: Props) {
  const { pearsonEventsVolume, pearsonEventsReturn, pearsonBuysReturn, bestLag, n } =
    summary;

  return (
    <Panel title="Correlation summary" meta={n ? `n=${n} hourly obs` : "—"} bodyClassName="p-0">
      <div className="grid grid-cols-2 md:grid-cols-4">
        <Cell
          label="Events × DEGEN vol"
          value={pearsonEventsVolume.toFixed(3)}
          sub={rLabel(pearsonEventsVolume)}
          color={rColor(pearsonEventsVolume)}
        />
        <Cell
          label="Events × DEGEN return"
          value={pearsonEventsReturn.toFixed(3)}
          sub={rLabel(pearsonEventsReturn)}
          color={rColor(pearsonEventsReturn)}
        />
        <Cell
          label="Buys × DEGEN return"
          value={pearsonBuysReturn.toFixed(3)}
          sub={rLabel(pearsonBuysReturn)}
          color={rColor(pearsonBuysReturn)}
        />
        <Cell
          label="Best lead/lag"
          value={bestLag ? `${bestLag.lag >= 0 ? "+" : ""}${bestLag.lag}h` : "—"}
          sub={
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
          color={bestLag ? rColor(bestLag.r) : undefined}
        />
      </div>
      <p className="px-4 pb-3 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        Pearson r on hourly series · lag &gt; 0 → POV activity precedes DEGEN move
      </p>
    </Panel>
  );
}
