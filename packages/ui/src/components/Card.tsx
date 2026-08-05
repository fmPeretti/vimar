import type { ReactNode } from "react";
import { cx } from "../cx";

/**
 * Polaroid-style photo card. `tilt` alternates the slight rotation the brand
 * uses so a grid of them reads as a collage rather than a corporate grid.
 */
export function Card({
  image,
  caption,
  tilt,
  children,
  className,
}: {
  image?: string | null;
  caption?: string;
  /** Pass the item's index — even/odd picks the rotation direction. */
  tilt?: number;
  children?: ReactNode;
  className?: string;
}) {
  const tiltClass =
    tilt === undefined ? undefined : tilt % 2 === 0 ? "vm-card--tilt-a" : "vm-card--tilt-b";

  return (
    <div className={cx("vm-card", tiltClass, className)}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- images are user-supplied URLs
        <img className="vm-card__media" src={image} alt={caption ?? ""} />
      ) : (
        <div className="vm-card__media vm-card__placeholder" aria-hidden="true">
          {caption?.trim().charAt(0).toUpperCase() ?? "?"}
        </div>
      )}
      {caption ? <div className="vm-card__caption">{caption}</div> : null}
      {children}
    </div>
  );
}
