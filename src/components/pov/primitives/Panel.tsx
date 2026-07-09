import { clsx } from "clsx";
import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  highlight?: boolean;
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  title,
  meta,
  action,
  children,
  highlight,
  className,
  bodyClassName,
}: PanelProps) {
  return (
    <section
      className={clsx(
        "flex flex-col border border-[var(--line)] bg-[var(--surface)]",
        highlight && "ring-1 ring-[var(--pov)] transition-shadow duration-300",
        className,
      )}
    >
      {(title || meta || action) && (
        <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
          <div className="flex items-baseline gap-3">
            {title && (
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
                {title}
              </h2>
            )}
            {meta && (
              <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                {meta}
              </span>
            )}
          </div>
          {action && <div className="text-[10px] text-[var(--ink-dim)]">{action}</div>}
        </header>
      )}
      <div className={clsx("flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
