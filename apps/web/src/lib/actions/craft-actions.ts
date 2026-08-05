"use server";

import { completeCraft, type CraftUsageLine } from "@vimar/core";
import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { repositories } from "@/lib/repos";

function revalidateAll() {
  revalidatePath("/", "layout");
}

export interface CompleteCraftFormValues {
  patternId: string;
  qty: number;
  craftedAt: string;
  actualMinutes: number | null;
  note: string;
  /**
   * Actual per-unit usage. May exceed the pattern's BOM, and may include
   * materials the recipe never mentioned — that's the point.
   */
  usage: CraftUsageLine[];
  /** Set after the user confirms they want to record a craft that overdraws stock. */
  allowNegativeStock?: boolean;
}

export type CompleteCraftResponse =
  | { ok: true; message: string; unitCostCents: number }
  | { ok: false; error: string; shortfalls?: string[] };

export async function completeCraftAction(
  values: CompleteCraftFormValues,
): Promise<CompleteCraftResponse> {
  try {
    const result = await completeCraft(repositories, {
      patternId: values.patternId,
      qty: values.qty,
      usage: values.usage,
      craftedAt: values.craftedAt,
      actualMinutes: values.actualMinutes,
      note: values.note,
      allowNegativeStock: values.allowNegativeStock,
    });

    revalidateAll();

    const extraNote = result.extras.length
      ? ` Extra material recorded for ${result.extras.map((e) => e.materialName).join(", ")}.`
      : "";

    return {
      ok: true,
      unitCostCents: result.session.unitCostCents,
      message: `Added ${values.qty} to stock at $${(result.session.unitCostCents / 100).toFixed(2)} each.${extraNote}`,
    };
  } catch (error) {
    const failure = toActionError(error);
    const shortfalls =
      error && typeof error === "object" && "shortfalls" in error
        ? (error as { shortfalls: string[] }).shortfalls
        : undefined;
    return { ok: false, error: failure.ok ? "Unknown error" : failure.error, shortfalls };
  }
}

/** Sold, gifted or scrapped — units leave stock oldest-craft-first. */
export async function removeUnitsAction(patternId: string, qty: number): Promise<ActionResult> {
  try {
    if (!(qty > 0)) return { ok: false, error: "Enter how many units left stock." };
    await repositories.crafts.removeUnits(patternId, qty);
    revalidateAll();
    return { ok: true, message: `Removed ${qty} from stock.` };
  } catch (error) {
    return toActionError(error);
  }
}

/** Undo a craft: materials go back to the lots they came from. */
export async function undoCraftAction(sessionId: string): Promise<ActionResult> {
  try {
    await repositories.crafts.deleteSession(sessionId);
    revalidateAll();
    return { ok: true, message: "Craft undone and materials returned to stock." };
  } catch (error) {
    return toActionError(error);
  }
}
