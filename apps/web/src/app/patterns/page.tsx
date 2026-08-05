import { estimateUnitCostCents, materialStock, PREDEFINED_TAGS } from "@vimar/core";
import { getPatternViews, getTags } from "@/lib/queries";
import { PatternsScreen } from "./PatternsScreen";

export const dynamic = "force-dynamic";

export default async function PatternsPage() {
  const [{ patterns, materials }, tags] = await Promise.all([getPatternViews(), getTags()]);

  // Predefined names are merged in so the picker is never empty on a fresh database.
  const tagNames = [...new Set([...PREDEFINED_TAGS, ...tags.map((t) => t.name)])];

  return (
    <PatternsScreen
      views={patterns.map(({ pattern, cost }) => ({
        pattern,
        totalCents: cost.totalCents,
        craftableUnits: cost.craftableUnits,
        lines: cost.lines,
      }))}
      materials={materials.map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        // Sent down so the editor can price a recipe live, without a round trip.
        unitCostCents: estimateUnitCostCents(m),
        qtyOnHand: materialStock(m).qtyOnHand,
      }))}
      allTags={tagNames}
    />
  );
}
