"use server";

import type { BomLine } from "@vimar/core";
import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { deleteAssetIfOwned, replaceAsset } from "@/lib/blob";
import { repositories } from "@/lib/repos";

function revalidateAll() {
  revalidatePath("/", "layout");
}

export interface PatternFormValues {
  id?: string;
  name: string;
  description: string;
  estimatedMinutes: number;
  salePriceCents: number;
  imageUrl: string;
  tagNames: string[];
  bom: BomLine[];
}

export async function savePatternAction(values: PatternFormValues): Promise<ActionResult> {
  try {
    if (!values.name.trim()) return { ok: false, error: "Give the pattern a name." };

    const usableBom = values.bom.filter((line) => line.materialId && line.qty > 0);
    if (usableBom.length === 0) {
      return { ok: false, error: "Add at least one material to the pattern." };
    }

    const before = values.id ? await repositories.patterns.findById(values.id) : null;

    const saved = await repositories.patterns.save({
      id: values.id,
      name: values.name,
      description: values.description,
      estimatedMinutes: values.estimatedMinutes,
      salePriceCents: values.salePriceCents,
      imageUrl: values.imageUrl,
      tagNames: values.tagNames,
      bom: usableBom,
    });

    // Drop the old photo only once the new one is safely stored.
    await replaceAsset(before?.imageUrl, saved.imageUrl);

    revalidateAll();
    return { ok: true, message: `${saved.name} saved.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function archivePatternAction(id: string, archived: boolean): Promise<ActionResult> {
  try {
    await repositories.patterns.archive(id, archived);
    revalidateAll();
    return { ok: true, message: archived ? "Pattern archived." : "Pattern restored." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deletePatternAction(id: string): Promise<ActionResult> {
  try {
    const before = await repositories.patterns.findById(id);
    await repositories.patterns.remove(id);
    // Only after the row is gone, so a failed delete can't orphan the photo.
    await deleteAssetIfOwned(before?.imageUrl);
    revalidateAll();
    return { ok: true, message: "Pattern deleted." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createTagAction(name: string): Promise<ActionResult> {
  try {
    if (!name.trim()) return { ok: false, error: "Tag name can't be empty." };
    await repositories.tags.ensure(name);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
