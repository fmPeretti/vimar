"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions/auth-actions";

type NavItem = { type: "label"; label: string } | { type: "link"; href: string; label: string };

/** Grouped nav, matching the design system's sectioned Sidebar. */
const ITEMS: NavItem[] = [
  { type: "label", label: "Overview" },
  { type: "link", href: "/", label: "Dashboard" },
  { type: "link", href: "/calendar", label: "Calendar" },
  { type: "label", label: "Stock" },
  { type: "link", href: "/materials", label: "Materials" },
  { type: "link", href: "/inventory", label: "Finished Inventory" },
  { type: "label", label: "Making" },
  { type: "link", href: "/patterns", label: "Patterns" },
  { type: "link", href: "/craft", label: "Complete a Pattern" },
];

export function Sidebar({ showLogout = false }: { showLogout?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="vm-sidebar" aria-label="Main">
      <div className="vm-sidebar__brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static asset, no need for next/image here */}
        <img className="vm-sidebar__mark" src="/logo.png" alt="" aria-hidden="true" />
        <span>
          <span className="vm-sidebar__name">Vimars</span>
          <span className="vm-sidebar__tagline">stitches &amp; stock</span>
        </span>
      </div>

      <div className="vm-sidebar__nav">
        {ITEMS.map((item) =>
          item.type === "label" ? (
            <div key={`label-${item.label}`} className="vm-sidebar__label">
              {item.label}
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className="vm-sidebar__link"
              // Every other route is a prefix of "/", so it needs an exact match.
              aria-current={
                (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
                  ? "page"
                  : undefined
              }
            >
              {item.label}
            </Link>
          ),
        )}
      </div>

      <div className="vm-sidebar__bottom">
        {showLogout ? (
          <form action={logoutAction} className="vm-sidebar__logout-form">
            <button type="submit" className="vm-sidebar__link vm-sidebar__logout">
              Sign out
            </button>
          </form>
        ) : null}

        <div className="vm-sidebar__foot">
          Costs are tracked per purchase lot and consumed oldest-first.
        </div>
      </div>
    </nav>
  );
}
