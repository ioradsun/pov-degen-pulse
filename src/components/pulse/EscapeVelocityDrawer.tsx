import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { PriceDelta } from "@/components/pov/primitives/PriceDelta";
import {
  useApiEscapeVelocityBeliefs,
  useApiBeliefPriceDeltas,
} from "@/hooks/pov/useApiPulse";
import { RANGE_META, type Range } from "@/lib/pov/ranges";
import { ExternalLink, Users } from "lucide-react";


function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function fmtEth(n: number): string {
  if (n >= 1) return `${n.toFixed(2)} ETH`;
  return `${n.toFixed(4)} ETH`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function EscapeVelocityDrawer({
  open,
  onOpenChange,
  range,
  threshold,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  range: Range;
  threshold: number;
}) {
  const { data, isLoading } = useApiEscapeVelocityBeliefs(range, threshold, open);
  const rows = data?.rows ?? [];
  const window = RANGE_META[range];
  const beliefIds = useMemo(() => rows.map((r) => r.belief_id), [rows]);
  const { data: deltaData } = useApiBeliefPriceDeltas(range, beliefIds);
  const deltas = deltaData?.deltas ?? {};


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-[var(--line-dim)] bg-[var(--bg)] p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-[var(--line-dim)] p-4 text-left">
          <SheetTitle className="text-[13px] uppercase tracking-[0.18em] text-[var(--ink)]">
            Escape velocity · {threshold}+ buyers
          </SheetTitle>
          <SheetDescription className="text-[11px] leading-snug text-[var(--ink-dim)]">
            Beliefs created in the {window} that attracted at least {threshold} unique
            buyers.
          </SheetDescription>
        </SheetHeader>

        <div className="divide-y divide-[var(--line-dim)]">
          {isLoading && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="p-6 text-center text-[12px] text-[var(--ink-dim)]">
              No beliefs reached {threshold}+ buyers in the {window} yet.
            </div>
          )}

          {!isLoading &&
            rows.map((b, idx) => {
              const title = b.title ?? `Belief #${b.belief_id}`;
              const creator =
                b.creator_display_name?.trim() || shortAddr(b.creator_address);
              const href = b.slug
                ? `https://pov.co/markets/${b.slug}`
                : `https://pov.co/markets/${b.belief_id}`;
              return (
                <a
                  key={b.belief_id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-2 p-4 transition-colors hover:bg-[var(--line-dim)]/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-[2px] w-6 shrink-0 text-[10px] tabular-nums text-[var(--ink-faint)]">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-[13px] leading-snug text-[var(--ink)] group-hover:text-[var(--pov)]">
                          {title}
                        </div>
                        <div className="mt-1 text-[10px] text-[var(--ink-dim)]">
                          by {creator} · {timeAgo(b.created_at)}
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 shrink-0 text-[var(--ink-faint)] group-hover:text-[var(--pov)]" />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-[10px] tabular-nums text-[var(--ink-dim)]">
                    <span className="inline-flex items-center gap-1 text-[var(--up)]">
                      <Users className="h-3 w-3" />
                      {b.unique_buyers} buyers
                    </span>
                    <span>·</span>
                    <span>{fmtUsd(b.buy_volume_usd)}</span>
                    <span className="text-[var(--ink-faint)]">
                      ({fmtEth(b.buy_volume_eth)})
                    </span>
                    <span aria-hidden>·</span>
                    <PriceDelta
                      data={deltas[String(b.belief_id)]}
                      layout="inline"
                      windowLabel={window}
                    />
                  </div>
                </a>
              );
            })}

        </div>
      </SheetContent>
    </Sheet>
  );
}
