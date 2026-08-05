/** Pure rollups over finished (crafted) stock. */

import { QTY_EPSILON, roundCents } from "./money";
import type { CraftSession, ID, Pattern } from "./types";

export interface PatternInventory {
  pattern: Pattern;
  /** Units currently in stock across all sessions. */
  qtyOnHand: number;
  /** Units ever produced. */
  qtyProduced: number;
  /** Value of units on hand, each at its own session's cost basis. */
  stockValueCents: number;
  /** Weighted average cost of the units on hand. */
  avgCostCents: number;
  /** Weighted average across everything ever crafted — the "what this usually costs" number. */
  lifetimeAvgCostCents: number;
  /** Sale price minus average cost of stock on hand. */
  marginCents: number;
  marginPct: number | null;
  /** Sessions newest-first, so the cost history reads top-down. */
  sessions: CraftSession[];
}

export function rollUpInventory(
  patterns: readonly Pattern[],
  sessions: readonly CraftSession[],
): PatternInventory[] {
  const byPattern = new Map<ID, CraftSession[]>();
  for (const session of sessions) {
    const list = byPattern.get(session.patternId);
    if (list) list.push(session);
    else byPattern.set(session.patternId, [session]);
  }

  return patterns.map((pattern) => {
    const patternSessions = (byPattern.get(pattern.id) ?? []).slice().sort((a, b) => {
      if (a.craftedAt !== b.craftedAt) return a.craftedAt < b.craftedAt ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });

    let qtyOnHand = 0;
    let qtyProduced = 0;
    let stockValueCents = 0;
    let lifetimeValueCents = 0;

    for (const s of patternSessions) {
      qtyOnHand += s.qtyRemaining;
      qtyProduced += s.qty;
      stockValueCents += s.qtyRemaining * s.unitCostCents;
      lifetimeValueCents += s.qty * s.unitCostCents;
    }

    const avgCostCents = qtyOnHand > QTY_EPSILON ? stockValueCents / qtyOnHand : 0;
    const lifetimeAvgCostCents = qtyProduced > QTY_EPSILON ? lifetimeValueCents / qtyProduced : 0;
    const basis = avgCostCents || lifetimeAvgCostCents;
    const marginCents = pattern.salePriceCents - basis;

    return {
      pattern,
      qtyOnHand,
      qtyProduced,
      stockValueCents: roundCents(stockValueCents),
      avgCostCents,
      lifetimeAvgCostCents,
      marginCents,
      marginPct: pattern.salePriceCents > 0 ? (marginCents / pattern.salePriceCents) * 100 : null,
      sessions: patternSessions,
    };
  });
}

/**
 * Remove `qty` finished units from a pattern's stock, oldest session first, so
 * the units that leave carry the cost basis of the units that were made first.
 */
export function planStockRemoval(
  sessions: readonly CraftSession[],
  qty: number,
): { removals: Array<{ sessionId: ID; qty: number; unitCostCents: number }>; shortfall: number } {
  let remaining = qty;
  const removals: Array<{ sessionId: ID; qty: number; unitCostCents: number }> = [];

  const oldestFirst = [...sessions].sort((a, b) => {
    if (a.craftedAt !== b.craftedAt) return a.craftedAt < b.craftedAt ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  for (const session of oldestFirst) {
    if (remaining <= 0) break;
    if (session.qtyRemaining <= 0) continue;
    const take = Math.min(session.qtyRemaining, remaining);
    removals.push({ sessionId: session.id, qty: take, unitCostCents: session.unitCostCents });
    remaining -= take;
  }

  return { removals, shortfall: Math.max(0, remaining) };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardTotals {
  materialsValueCents: number;
  materialTypeCount: number;
  craftedValueCents: number;
  craftedUnits: number;
  /** Materials + finished goods — everything currently tied up in stock. */
  totalTiedUpCents: number;
  /** What the finished stock would bring in at list price. */
  retailValueCents: number;
  potentialProfitCents: number;
  lowStockCount: number;
  outOfStockCount: number;
}
