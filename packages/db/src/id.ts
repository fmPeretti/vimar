import { randomUUID } from "node:crypto";

/**
 * Prefixed, sortable-ish ids: `mat_lq2f8x…`. The timestamp prefix means rows
 * created in the same millisecond still tie-break consistently by `createdAt`,
 * which the FIFO ordering relies on.
 */
export function createId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}_${time}${rand}`;
}
