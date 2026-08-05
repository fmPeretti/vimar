/**
 * Pure costing logic. No I/O, no framework — everything here is a function of
 * its arguments so it can be unit-tested and reused by any repository backend.
 */

import { QTY_EPSILON, roundCents, roundQty } from "./money";
import type {
  BomLine,
  CraftUsageLine,
  ID,
  MaterialBatch,
  MaterialStock,
  MaterialWithBatches,
} from "./types";

// ---------------------------------------------------------------------------
// Material valuation
// ---------------------------------------------------------------------------

/** FIFO order: oldest purchase first, ties broken by insertion order. */
export function fifoSort(batches: readonly MaterialBatch[]): MaterialBatch[] {
  return [...batches].sort((a, b) => {
    if (a.purchasedAt !== b.purchasedAt) return a.purchasedAt < b.purchasedAt ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function materialStock(material: MaterialWithBatches): MaterialStock {
  const batches = material.batches;

  let qtyOnHand = 0;
  let stockValueCents = 0;
  let lifetimeQty = 0;
  let lifetimeValueCents = 0;

  for (const b of batches) {
    qtyOnHand += b.qtyRemaining;
    stockValueCents += b.qtyRemaining * b.unitCostCents;
    lifetimeQty += b.qty;
    lifetimeValueCents += b.qty * b.unitCostCents;
  }

  qtyOnHand = roundQty(qtyOnHand);

  const latest = fifoSort(batches).at(-1) ?? null;

  return {
    qtyOnHand,
    stockValueCents: roundCents(stockValueCents),
    avgCostCents: qtyOnHand > QTY_EPSILON ? stockValueCents / qtyOnHand : 0,
    lifetimeAvgCostCents: lifetimeQty > QTY_EPSILON ? lifetimeValueCents / lifetimeQty : 0,
    latestCostCents: latest ? latest.unitCostCents : null,
    isOut: qtyOnHand <= QTY_EPSILON,
    isLow: qtyOnHand <= material.reorderLevel,
  };
}

/**
 * Cost used to *estimate* a material before it is actually consumed. Prefers
 * the average of what's on hand; falls back to the lifetime average (and then
 * the last purchase price) so patterns using out-of-stock materials still
 * price sensibly instead of showing $0.
 */
export function estimateUnitCostCents(material: MaterialWithBatches): number {
  const s = materialStock(material);
  if (s.avgCostCents > 0) return s.avgCostCents;
  if (s.lifetimeAvgCostCents > 0) return s.lifetimeAvgCostCents;
  return s.latestCostCents ?? 0;
}

// ---------------------------------------------------------------------------
// FIFO consumption
// ---------------------------------------------------------------------------

export interface Allocation {
  batchId: ID;
  qty: number;
  unitCostCents: number;
  costCents: number;
}

export interface ConsumptionPlan {
  allocations: Allocation[];
  costCents: number;
  /** Quantity that could not be covered by existing stock. */
  shortfall: number;
}

/**
 * Draw `qtyNeeded` from a material's lots, oldest first, so the cost recorded
 * is the price actually paid for the yarn being used rather than today's price.
 */
export function planConsumption(
  batches: readonly MaterialBatch[],
  qtyNeeded: number,
): ConsumptionPlan {
  let remaining = roundQty(qtyNeeded);
  let costCents = 0;
  const allocations: Allocation[] = [];

  if (remaining <= QTY_EPSILON) return { allocations, costCents: 0, shortfall: 0 };

  for (const batch of fifoSort(batches)) {
    if (remaining <= QTY_EPSILON) break;
    if (batch.qtyRemaining <= QTY_EPSILON) continue;

    const take = roundQty(Math.min(batch.qtyRemaining, remaining));
    const lineCost = take * batch.unitCostCents;

    allocations.push({
      batchId: batch.id,
      qty: take,
      unitCostCents: batch.unitCostCents,
      costCents: lineCost,
    });

    costCents += lineCost;
    remaining = roundQty(remaining - take);
  }

  return {
    allocations,
    costCents,
    shortfall: remaining > QTY_EPSILON ? remaining : 0,
  };
}

// ---------------------------------------------------------------------------
// Pattern costing
// ---------------------------------------------------------------------------

export interface PatternCostLine {
  materialId: ID;
  materialName: string;
  unit: string;
  qtyPerUnit: number;
  unitCostCents: number;
  costCents: number;
  qtyOnHand: number;
  /** How many units of the pattern current stock of *this* material supports. */
  unitsCoverable: number;
}

export interface PatternCost {
  lines: PatternCostLine[];
  totalCents: number;
  /** Units craftable right now, limited by the scarcest material. */
  craftableUnits: number;
}

/**
 * The pattern's standard cost: what one unit costs if it goes exactly to plan,
 * priced at each material's current estimate.
 */
export function patternCost(
  bom: readonly BomLine[],
  materials: readonly MaterialWithBatches[],
): PatternCost {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const lines: PatternCostLine[] = [];
  let totalCents = 0;
  let craftableUnits = Number.POSITIVE_INFINITY;

  for (const line of bom) {
    const material = byId.get(line.materialId);
    if (!material) continue;

    const stock = materialStock(material);
    const unitCostCents = estimateUnitCostCents(material);
    const costCents = unitCostCents * line.qty;
    const unitsCoverable = line.qty > QTY_EPSILON ? Math.floor(stock.qtyOnHand / line.qty) : Infinity;

    lines.push({
      materialId: material.id,
      materialName: material.name,
      unit: material.unit,
      qtyPerUnit: line.qty,
      unitCostCents,
      costCents,
      qtyOnHand: stock.qtyOnHand,
      unitsCoverable,
    });

    totalCents += costCents;
    craftableUnits = Math.min(craftableUnits, unitsCoverable);
  }

  return {
    lines,
    totalCents,
    craftableUnits: Number.isFinite(craftableUnits) ? Math.max(0, craftableUnits) : 0,
  };
}

// ---------------------------------------------------------------------------
// Craft planning
// ---------------------------------------------------------------------------

export interface CraftPlanLine {
  materialId: ID;
  materialName: string;
  unit: string;
  qtyPerUnit: number;
  /** BOM qty at plan time, or null if this material isn't part of the recipe. */
  standardQtyPerUnit: number | null;
  totalQty: number;
  costCents: number;
  allocations: Allocation[];
  shortfall: number;
  /** True when more was used than the recipe calls for (a mistake, a thicker build). */
  isExtra: boolean;
}

export interface CraftPlan {
  lines: CraftPlanLine[];
  totalCostCents: number;
  unitCostCents: number;
  /** Human-readable "you don't have enough of X" messages. */
  shortfalls: string[];
  hasShortfall: boolean;
}

/**
 * Work out what completing `qty` units actually costs, given the *actual*
 * per-unit usage the user entered — which may exceed the pattern's BOM.
 *
 * The result is a plan, not a mutation: `allocations` say which lots to draw
 * from, and the repository applies them inside a transaction.
 */
export function planCraft(
  bom: readonly BomLine[],
  usage: readonly CraftUsageLine[],
  materials: readonly MaterialWithBatches[],
  qty: number,
): CraftPlan {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const standardByMaterial = new Map(bom.map((b) => [b.materialId, b.qty]));

  const lines: CraftPlanLine[] = [];
  const shortfalls: string[] = [];
  let totalCostCents = 0;

  for (const use of usage) {
    const material = byId.get(use.materialId);
    if (!material || use.qtyPerUnit <= QTY_EPSILON) continue;

    const totalQty = roundQty(use.qtyPerUnit * qty);
    const plan = planConsumption(material.batches, totalQty);
    const standardQtyPerUnit = standardByMaterial.get(use.materialId) ?? null;

    if (plan.shortfall > 0) {
      shortfalls.push(
        `${material.name}: short by ${roundQty(plan.shortfall)} ${material.unit}`,
      );
    }

    lines.push({
      materialId: material.id,
      materialName: material.name,
      unit: material.unit,
      qtyPerUnit: use.qtyPerUnit,
      standardQtyPerUnit,
      totalQty,
      costCents: plan.costCents,
      allocations: plan.allocations,
      shortfall: plan.shortfall,
      isExtra: standardQtyPerUnit !== null && use.qtyPerUnit > standardQtyPerUnit + QTY_EPSILON,
    });

    totalCostCents += plan.costCents;
  }

  return {
    lines,
    totalCostCents,
    unitCostCents: qty > 0 ? totalCostCents / qty : 0,
    shortfalls,
    hasShortfall: shortfalls.length > 0,
  };
}

/**
 * Estimated cost of a craft *before* committing, priced at each material's
 * current average. Used for the live preview on the Craft screen — the real
 * number comes from `planCraft`, which walks the actual lots.
 */
export function estimateCraftCostCents(
  usage: readonly CraftUsageLine[],
  materials: readonly MaterialWithBatches[],
): number {
  const byId = new Map(materials.map((m) => [m.id, m]));
  return usage.reduce((sum, use) => {
    const material = byId.get(use.materialId);
    return material ? sum + estimateUnitCostCents(material) * use.qtyPerUnit : sum;
  }, 0);
}
