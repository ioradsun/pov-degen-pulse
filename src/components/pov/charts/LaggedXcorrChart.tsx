import { Panel } from "../primitives/Panel";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: Array<{ lag: number; r: number; n: number }>;
}

const AXIS_STYLE = {
  fontSize: 10,
  fill: "var(--ink-faint)",
  letterSpacing: "0.14em",
};

export function LaggedXcorrChart({ data }: Props) {
  const best = data.reduce<{ lag: number; r: number } | null>((acc, cur) => {
    if (!acc || Math.abs(cur.r) > Math.abs(acc.r)) {
      return { lag: cur.lag, r: cur.r };
    }
    return acc;
  }, null);

  return (
    <Panel
      title="Lagged cross-correlation"
      meta="POV events → DEGEN return · r by lag (hours)"
      action={
        best ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
            best lag {best.lag >= 0 ? `+${best.lag}` : best.lag}h · r{" "}
            <span
              className={
                best.r >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"
              }
            >
              {best.r.toFixed(3)}
            </span>
          </span>
        ) : null
      }
      bodyClassName="p-0"
    >
      <div className="h-[240px] px-2 py-3">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Not enough overlap yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 24, bottom: 24, left: 48 }}
            >
              <CartesianGrid stroke="var(--line-dim)" vertical={false} />
              <XAxis
                dataKey="lag"
                stroke="var(--line)"
                tick={AXIS_STYLE}
                tickFormatter={(v) =>
                  (v as number) > 0 ? `+${v}` : `${v}`
                }
                label={{
                  value: "lag (h) — negative: DEGEN leads · positive: POV leads",
                  position: "insideBottom",
                  offset: -6,
                  fill: "var(--ink-faint)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                }}
              />
              <YAxis
                stroke="var(--line)"
                tick={AXIS_STYLE}
                domain={[-1, 1]}
                tickFormatter={(v) => (v as number).toFixed(1)}
                width={44}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-2)", opacity: 0.4 }}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 0,
                  fontSize: 12,
                  color: "var(--ink)",
                  padding: "8px 10px",
                }}
                labelStyle={{
                  color: "var(--ink-faint)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  marginBottom: 4,
                }}
                formatter={(v: number, _n, ctx) => {
                  const row = ctx?.payload as { r: number; n: number };
                  return [`${row.r.toFixed(3)} · n=${row.n}`, "r"];
                }}
                labelFormatter={(l) =>
                  `lag ${(l as number) > 0 ? "+" : ""}${l}h`
                }
              />
              <ReferenceLine y={0} stroke="var(--line)" />
              <Bar dataKey="r" isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.r >= 0 ? "var(--up)" : "var(--down)"}
                    fillOpacity={
                      best && d.lag === best.lag ? 1 : 0.55
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
