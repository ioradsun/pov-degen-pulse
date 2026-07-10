import { clsx } from "clsx";
import type { EventKind } from "@/lib/pov/types";

const KIND_STYLES: Record<EventKind, string> = {
  buy: "text-[var(--up)] border-[var(--up)]/40",
  sell: "text-[var(--down)] border-[var(--down)]/40",
  boost: "text-[var(--boost)] border-[var(--boost)]/40",
  created: "text-[var(--pov)] border-[var(--pov)]/40",
  transfer: "text-[var(--ink-dim)] border-[var(--line)]",
  approval: "text-[var(--ink-dim)] border-[var(--line)]",
  admin: "text-[var(--info)] border-[var(--info)]/40",
  fee: "text-[var(--boost)] border-[var(--boost)]/40",
  unknown: "text-[var(--ink-faint)] border-[var(--line)]",
};

export function Pill({
  children,
  kind = "unknown",
  className,
}: {
  children: React.ReactNode;
  kind?: EventKind | "pov" | "degen";
  className?: string;
}) {
  const cls =
    kind === "pov"
      ? "text-[var(--pov)] border-[var(--pov)]/40"
      : kind === "degen"
        ? "text-[var(--up)] border-[var(--up)]/40"
        : KIND_STYLES[kind];
  return (
    <span
      className={clsx(
        "inline-flex items-center border px-1.5 py-[1px] text-[10px] uppercase tracking-[0.14em]",
        cls,
        className,
      )}
    >
      {children}
    </span>
  );
}
