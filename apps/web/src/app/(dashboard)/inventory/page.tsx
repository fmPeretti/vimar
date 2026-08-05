import { getInventoryData } from "@/lib/queries";
import { InventoryScreen } from "./InventoryScreen";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const { rollups } = await getInventoryData();
  return <InventoryScreen rollups={rollups} />;
}
