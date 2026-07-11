import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-block animate-pulse rounded-sm bg-[var(--surface-2)]",
        className,
      )}
    />
  );
}
