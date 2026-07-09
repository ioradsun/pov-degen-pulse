import { ExternalLink } from "lucide-react";
import { BASESCAN_ADDR, BASESCAN_TX } from "@/lib/pov/constants";
import { shortAddr } from "@/lib/pov/format";

interface Props {
  value: string;
  kind?: "addr" | "tx";
  short?: number;
  className?: string;
}

export function AddrLink({ value, kind = "addr", short = 4, className }: Props) {
  const href = kind === "tx" ? BASESCAN_TX(value) : BASESCAN_ADDR(value);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={
        "inline-flex items-center gap-1 tabular-nums text-[var(--ink-dim)] hover:text-[var(--ink)] " +
        (className ?? "")
      }
    >
      <span>{shortAddr(value, short)}</span>
      <ExternalLink className="h-3 w-3 opacity-60" />
    </a>
  );
}
