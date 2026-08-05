"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { deleteAssetIfOwned, replaceAsset } from "@/lib/blob";
import { repositories } from "@/lib/repos";

/** Every screen shows some material-derived number, so refresh all of them. */
function revalidateAll() {
  revalidatePath("/", "layout");
}

export interface MaterialFormValues {
  name: string;
  category: string;
  unit: string;
  provider: string;
  description: string;
  reorderLevel: number;
  imageUrl?: string | null;
  /** Optional opening purchase, recorded as the first lot. */
  openingQty?: number;
  openingUnitCostCents?: number;
  openingPurchasedAt?: string;
}

export async function createMaterialAction(values: MaterialFormValues): Promise<ActionResult> {
  try {
    if (!values.name.trim()) return { ok: false, error: "Give the material a name." };

    const material = await repositories.materials.create({
      name: values.name,
      category: values.category,
      unit: values.unit,
      provider: values.provider,
      description: values.description,
      reorderLevel: values.reorderLevel,
      imageUrl: values.imageUrl,
    });

    if (values.openingQty && values.openingQty > 0) {
      await repositories.materials.addBatch({
        materialId: material.id,
        purchasedAt: values.openingPurchasedAt || new Date().toISOString().slice(0, 10),
        qty: values.openingQty,
        unitCostCents: values.openingUnitCostCents ?? 0,
      });
    }

    revalidateAll();
    return { ok: true, message: `${material.name} added.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateMaterialAction(
  id: string,
  values: Omit<MaterialFormValues, "openingQty" | "openingUnitCostCents" | "openingPurchasedAt">,
): Promise<ActionResult> {
  try {
    if (!values.name.trim()) return { ok: false, error: "Give the material a name." };

    // Drop the old photo only once the new one is safely stored.
    const before = await repositories.materials.findById(id);
    await repositories.materials.update(id, values);
    if (values.imageUrl !== undefined) await replaceAsset(before?.imageUrl, values.imageUrl);

    revalidateAll();
    return { ok: true, message: "Saved." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function archiveMaterialAction(id: string, archived: boolean): Promise<ActionResult> {
  try {
    await repositories.materials.update(id, { archived });
    revalidateAll();
    return { ok: true, message: archived ? "Material archived." : "Material restored." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteMaterialAction(id: string): Promise<ActionResult> {
  try {
    const before = await repositories.materials.findById(id);
    await repositories.materials.remove(id);
    // Only after the row is gone, so a failed delete can't orphan the photo.
    await deleteAssetIfOwned(before?.imageUrl);
    revalidateAll();
    return { ok: true, message: "Material deleted." };
  } catch (error) {
    return toActionError(error);
  }
}

export interface BatchFormValues {
  materialId: string;
  purchasedAt: string;
  qty: number;
  unitCostCents: number;
  note: string;
}

/**
 * Record a purchase. Each one keeps the price actually paid, which is what
 * makes per-lot (rather than blended) costing possible later.
 */
export async function addBatchAction(values: BatchFormValues): Promise<ActionResult> {
  try {
    if (!(values.qty > 0)) return { ok: false, error: "Quantity must be greater than zero." };
    if (values.unitCostCents < 0) return { ok: false, error: "Cost can't be negative." };

    await repositories.materials.addBatch({
      materialId: values.materialId,
      purchasedAt: values.purchasedAt || new Date().toISOString().slice(0, 10),
      qty: values.qty,
      unitCostCents: values.unitCostCents,
      note: values.note,
    });

    revalidateAll();
    return { ok: true, message: "Purchase recorded." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBatchAction(batchId: string): Promise<ActionResult> {
  try {
    await repositories.materials.removeBatch(batchId);
    revalidateAll();
    return { ok: true, message: "Purchase removed." };
  } catch (error) {
    return toActionError(error);
  }
}
