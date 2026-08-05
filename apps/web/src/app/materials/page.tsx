import { MATERIAL_CATEGORIES, COMMON_UNITS } from "@vimar/core";
import { getMaterialViews } from "@/lib/queries";
import { MaterialsScreen } from "./MaterialsScreen";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const views = await getMaterialViews();

  return (
    <MaterialsScreen
      views={views}
      categories={[...MATERIAL_CATEGORIES]}
      units={[...COMMON_UNITS]}
    />
  );
}
