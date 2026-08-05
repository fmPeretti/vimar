/** Money and quantity helpers. All money moves around as cents. */

/** Quantities are rounded to this many decimals whenever stored or compared. */
export const QTY_PRECISION = 4;

/** Tolerance for "is this quantity effectively zero / satisfied". */
export const QTY_EPSILON = 1e-6;

export function roundQty(qty: number): number {
  const f = 10 ** QTY_PRECISION;
  return Math.round(qty * f) / f;
}

/** Round a cents amount to whole cents — use at every persistence boundary. */
export function roundCents(cents: number): number {
  return Math.round(cents);
}

export function centsFromInput(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function numberFromInput(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1234` -> `"$12.34"` */
export function formatMoney(cents: number): string {
  return currency.format((cents || 0) / 100);
}

/**
 * Money display for unit costs that can be a fraction of a cent — keeps up to
 * 4 decimal places so a $0.185/oz stuffing cost doesn't read as $0.19.
 */
export function formatUnitCost(cents: number): string {
  const dollars = (cents || 0) / 100;
  const decimals = Number.isInteger(dollars * 100) ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(dollars);
}

/** Compact money for KPI tiles: `"$1,204"`. */
export function formatMoneyShort(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

export function formatQty(qty: number, unit?: string): string {
  const rounded = roundQty(qty);
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return unit ? `${text} ${unit}` : text;
}

/** `90` -> `"1h 30m"` */
export function formatMinutes(minutes: number): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function todayISO(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}
