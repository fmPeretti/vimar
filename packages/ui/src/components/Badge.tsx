import type { ReactNode } from "react";
import { cx } from "../cx";

export type BadgeTone = "pink" | "yellow" | "cream" | "burgundy";

export function Badge({
  tone = "pink",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx("vm-badge", `vm-badge--${tone}`, className)}>{children}</span>;
}

/** Maps a stock level onto the badge the design system uses for it. */
export function StockBadge({ isOut, isLow }: { isOut: boolean; isLow: boolean }) {
  if (isOut) return <Badge tone="burgundy">Reorder</Badge>;
  if (isLow) return <Badge tone="pink">Low stock</Badge>;
  return <Badge tone="cream">In stock</Badge>;
}
