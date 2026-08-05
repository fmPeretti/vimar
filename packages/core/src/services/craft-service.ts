/**
 * The one operation that spans several repositories: completing a pattern.
 *
 * FIFO planning happens here (pure, testable); the repository applies the
 * resulting allocations atomically and re-validates them inside the
 * transaction, so a concurrent craft can't double-spend a lot.
 */

import { estimateCraftCostCents, planCraft } from "../costing";
import { roundCents, todayISO } from "../money";
import { InsufficientStockError, type Repositories } from "../repositories";
import type { CompleteCraftInput, CraftSession, ID, MaterialWithBatches } from "../types";

export interface CraftPreview {
  /** Per-unit usage, prefilled from the pattern's BOM and editable by the user. */
  usage: Array<{
    materialId: ID;
    materialName: string;
    unit: string;
    standardQtyPerUnit: number | null;
    qtyPerUnit: number;
    qtyOnHand: number;
    unitCostCents: number;
  }>;
  estimatedUnitCostCents: number;
}

/** Build the prefilled "materials used per unit" form for a pattern. */
export async function buildCraftPreview(
  repos: Repositories,
  patternId: ID,
): Promise<CraftPreview | null> {
  const [pattern, materials] = await Promise.all([
    repos.patterns.findById(patternId),
    repos.materials.list(),
  ]);
  if (!pattern) return null;

  const byId = new Map(materials.map((m) => [m.id, m]));
  const usage = pattern.bom.flatMap((line) => {
    const material = byId.get(line.materialId);
    if (!material) return [];
    const stock = materialSummary(material);
    return [
      {
        materialId: material.id,
        materialName: material.name,
        unit: material.unit,
        standardQtyPerUnit: line.qty,
        qtyPerUnit: line.qty,
        qtyOnHand: stock.qtyOnHand,
        unitCostCents: stock.unitCostCents,
      },
    ];
  });

  return {
    usage,
    estimatedUnitCostCents: estimateCraftCostCents(
      usage.map((u) => ({ materialId: u.materialId, qtyPerUnit: u.qtyPerUnit })),
      materials,
    ),
  };
}

function materialSummary(material: MaterialWithBatches) {
  let qtyOnHand = 0;
  let valueCents = 0;
  for (const b of material.batches) {
    qtyOnHand += b.qtyRemaining;
    valueCents += b.qtyRemaining * b.unitCostCents;
  }
  return { qtyOnHand, unitCostCents: qtyOnHand > 0 ? valueCents / qtyOnHand : 0 };
}

export interface CompleteCraftResult {
  session: CraftSession;
  /** Materials that ran short — only possible when `allowNegativeStock` is set. */
  warnings: string[];
  /** Lines where more was used than the recipe called for. */
  extras: Array<{ materialName: string; standard: number; actual: number; unit: string }>;
}

/**
 * Complete `qty` units of a pattern: draw the materials FIFO, record what was
 * actually used (including any extra), and add the finished units to stock at
 * the cost the materials really carried.
 */
export async function completeCraft(
  repos: Repositories,
  input: CompleteCraftInput,
): Promise<CompleteCraftResult> {
  if (input.qty <= 0) throw new Error("Quantity to craft must be greater than zero.");

  const [pattern, materials] = await Promise.all([
    repos.patterns.findById(input.patternId),
    repos.materials.list(),
  ]);
  if (!pattern) throw new Error(`Pattern ${input.patternId} not found.`);

  const usage = input.usage.filter((u) => u.qtyPerUnit > 0);
  if (usage.length === 0) throw new Error("Record at least one material used.");

  const plan = planCraft(pattern.bom, usage, materials, input.qty);

  if (plan.hasShortfall && !input.allowNegativeStock) {
    throw new InsufficientStockError(plan.shortfalls);
  }

  const session = await repos.crafts.record({
    patternId: pattern.id,
    qty: input.qty,
    craftedAt: input.craftedAt ?? todayISO(),
    actualMinutes: input.actualMinutes ?? null,
    note: input.note?.trim() || null,
    unitCostCents: plan.unitCostCents,
    totalCostCents: roundCents(plan.totalCostCents),
    lines: plan.lines.map((line) => ({
      materialId: line.materialId,
      qtyPerUnit: line.qtyPerUnit,
      standardQtyPerUnit: line.standardQtyPerUnit,
      totalQty: line.totalQty,
      costCents: roundCents(line.costCents),
    })),
    consumptions: plan.lines.flatMap((line) =>
      line.allocations.map((a) => ({
        materialId: line.materialId,
        batchId: a.batchId,
        qty: a.qty,
        unitCostCents: a.unitCostCents,
        costCents: roundCents(a.costCents),
      })),
    ),
    allowNegativeStock: input.allowNegativeStock ?? false,
  });

  return {
    session,
    warnings: plan.shortfalls,
    extras: plan.lines
      .filter((l) => l.isExtra)
      .map((l) => ({
        materialName: l.materialName,
        standard: l.standardQtyPerUnit ?? 0,
        actual: l.qtyPerUnit,
        unit: l.unit,
      })),
  };
}
