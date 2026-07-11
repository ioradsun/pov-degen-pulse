export type Range = "1h" | "24h" | "7d" | "30d" | "all";

export const RANGES: { key: Range; label: string }[] = [
  { key: "1h", label: "1H" },
  { key: "24h", label: "1D" },
  { key: "7d", label: "1W" },
  { key: "30d", label: "1M" },
  { key: "all", label: "ALL" },
];

export const RANGE_TITLE: Record<Range, string> = {
  "1h": "POV · last hour",
  "24h": "POV · last 24 hours",
  "7d": "POV · last 7 days",
  "30d": "POV · last 30 days",
  all: "POV · all time",
};

/** Short "last X" phrase for chart/board subtitles. */
export const RANGE_META: Record<Range, string> = {
  "1h": "last hour",
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  all: "all time",
};

/** Chart bucket size: short ranges get hourly bars, longer ones daily. */
export function granularityForRange(range: Range): "hour" | "day" {
  return range === "1h" || range === "24h" ? "hour" : "day";
}

/** How many hours of DEGEN OHLC to fetch to cover a given range (API caps at 1000). */
export const OHLC_HOURS_FOR_RANGE: Record<Range, number> = {
  "1h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
  all: 1000,
};
