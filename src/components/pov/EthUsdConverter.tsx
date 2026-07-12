import { useState } from "react";
import { formatUsd } from "@/lib/pov/format";

interface Props {
  ethUsd?: number;
  className?: string;
}

/** Small two-way ETH ↔ USD converter. Uses the live ETH/USD rate. */
export function EthUsdConverter({ ethUsd, className }: Props) {
  const [eth, setEth] = useState("1");
  const [usd, setUsd] = useState("");
  const [last, setLast] = useState<"eth" | "usd">("eth");

  const rate = ethUsd && ethUsd > 0 ? ethUsd : null;
  const ethNum = Number(eth);
  const usdNum = Number(usd);

  const ethDisplay =
    last === "eth"
      ? eth
      : rate && Number.isFinite(usdNum)
        ? (usdNum / rate).toLocaleString(undefined, { maximumFractionDigits: 6 })
        : "";
  const usdDisplay =
    last === "usd"
      ? usd
      : rate && Number.isFinite(ethNum)
        ? formatUsd(ethNum * rate, ethNum * rate >= 1 ? 2 : 4).replace("$", "")
        : "";

  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${className ?? ""}`}
      title={rate ? `1 Ξ = ${formatUsd(rate)}` : "loading rate…"}
    >
      <input
        value={ethDisplay}
        onChange={(e) => {
          setEth(e.target.value.replace(/[^0-9.]/g, ""));
          setLast("eth");
        }}
        inputMode="decimal"
        aria-label="ETH amount"
        className="w-20 border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-right tabular-nums text-[var(--ink)] focus:border-[var(--pov)] focus:outline-none"
      />
      <span className="text-[var(--ink-faint)]">Ξ =</span>
      <span className="text-[var(--ink-faint)]">$</span>
      <input
        value={usdDisplay}
        onChange={(e) => {
          setUsd(e.target.value.replace(/[^0-9.]/g, ""));
          setLast("usd");
        }}
        inputMode="decimal"
        aria-label="USD amount"
        className="w-24 border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-right tabular-nums text-[var(--ink)] focus:border-[var(--pov)] focus:outline-none"
      />
    </div>
  );
}
