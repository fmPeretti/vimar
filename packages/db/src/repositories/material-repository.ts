import {
  InUseError,
  type AddBatchInput,
  type CreateMaterialInput,
  type ID,
  type Material,
  type MaterialBatch,
  type MaterialRepository,
  type MaterialWithBatches,
  type UpdateMaterialInput,
} from "@vimar/core";
import { and, asc, eq } from "drizzle-orm";
import type { DrizzleDb } from "../client";
import { createId } from "../id";
import { craftConsumptions, materialBatches, materials, patternMaterials } from "../schema";

type MaterialRow = typeof materials.$inferSelect;
type BatchRow = typeof materialBatches.$inferSelect;

function toMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    provider: row.provider,
    description: row.description,
    reorderLevel: row.reorderLevel,
    imageUrl: row.imageUrl,
    archived: row.archived,
    createdAt: row.createdAt,
  };
}

function toBatch(row: BatchRow): MaterialBatch {
  return {
    id: row.id,
    materialId: row.materialId,
    purchasedAt: row.purchasedAt,
    qty: row.qty,
    qtyRemaining: row.qtyRemaining,
    unitCostCents: row.unitCostCents,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export class DrizzleMaterialRepository implements MaterialRepository {
  constructor(private readonly db: DrizzleDb) {}

  async list(options?: { includeArchived?: boolean }): Promise<MaterialWithBatches[]> {
    const rows = await this.db
      .select()
      .from(materials)
      .where(options?.includeArchived ? undefined : eq(materials.archived, false))
      .orderBy(asc(materials.category), asc(materials.name));

    if (rows.length === 0) return [];

    // One extra query for every batch, then group in memory — cheaper and
    // simpler than a join we would have to de-duplicate anyway.
    const batchRows = await this.db
      .select()
      .from(materialBatches)
      .orderBy(asc(materialBatches.purchasedAt), asc(materialBatches.createdAt));

    const byMaterial = new Map<ID, MaterialBatch[]>();
    for (const row of batchRows) {
      const list = byMaterial.get(row.materialId);
      if (list) list.push(toBatch(row));
      else byMaterial.set(row.materialId, [toBatch(row)]);
    }

    return rows.map((row) => ({ ...toMaterial(row), batches: byMaterial.get(row.id) ?? [] }));
  }

  async findById(id: ID): Promise<MaterialWithBatches | null> {
    const [row] = await this.db.select().from(materials).where(eq(materials.id, id)).limit(1);
    if (!row) return null;

    const batchRows = await this.db
      .select()
      .from(materialBatches)
      .where(eq(materialBatches.materialId, id))
      .orderBy(asc(materialBatches.purchasedAt), asc(materialBatches.createdAt));

    return { ...toMaterial(row), batches: batchRows.map(toBatch) };
  }

  async create(input: CreateMaterialInput): Promise<Material> {
    const row = {
      id: createId("mat"),
      name: input.name.trim(),
      category: input.category?.trim() || "Other",
      unit: input.unit?.trim() || "unit",
      provider: input.provider?.trim() || null,
      description: input.description?.trim() || null,
      reorderLevel: input.reorderLevel ?? 0,
      imageUrl: input.imageUrl?.trim() || null,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    await this.db.insert(materials).values(row);
    return toMaterial(row);
  }

  async update(id: ID, input: UpdateMaterialInput): Promise<void> {
    const patch: Partial<MaterialRow> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.category !== undefined) patch.category = input.category.trim() || "Other";
    if (input.unit !== undefined) patch.unit = input.unit.trim() || "unit";
    if (input.provider !== undefined) patch.provider = input.provider?.trim() || null;
    if (input.description !== undefined) patch.description = input.description?.trim() || null;
    if (input.reorderLevel !== undefined) patch.reorderLevel = input.reorderLevel;
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl?.trim() || null;
    if (input.archived !== undefined) patch.archived = input.archived;

    if (Object.keys(patch).length === 0) return;
    await this.db.update(materials).set(patch).where(eq(materials.id, id));
  }

  async remove(id: ID): Promise<void> {
    const [usedByPattern] = await this.db
      .select({ id: patternMaterials.id })
      .from(patternMaterials)
      .where(eq(patternMaterials.materialId, id))
      .limit(1);
    if (usedByPattern) {
      throw new InUseError("This material is part of a pattern. Remove it from the pattern first, or archive the material instead.");
    }

    const [usedByCraft] = await this.db
      .select({ id: craftConsumptions.id })
      .from(craftConsumptions)
      .where(eq(craftConsumptions.materialId, id))
      .limit(1);
    if (usedByCraft) {
      throw new InUseError("This material has craft history and can't be deleted. Archive it instead so past costs stay intact.");
    }

    await this.db.delete(materials).where(eq(materials.id, id));
  }

  async addBatch(input: AddBatchInput): Promise<MaterialBatch> {
    const row = {
      id: createId("bat"),
      materialId: input.materialId,
      purchasedAt: input.purchasedAt,
      qty: input.qty,
      qtyRemaining: input.qty,
      unitCostCents: input.unitCostCents,
      note: input.note?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    await this.db.insert(materialBatches).values(row);
    return toBatch(row);
  }

  async removeBatch(batchId: ID): Promise<void> {
    const [consumed] = await this.db
      .select({ id: craftConsumptions.id })
      .from(craftConsumptions)
      .where(eq(craftConsumptions.batchId, batchId))
      .limit(1);
    if (consumed) {
      throw new InUseError("This purchase has already been used in a craft, so deleting it would rewrite past costs.");
    }

    await this.db
      .delete(materialBatches)
      .where(and(eq(materialBatches.id, batchId)));
  }
}
