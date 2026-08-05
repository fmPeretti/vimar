import { getCraftPageData } from "@/lib/queries";
import { CraftScreen } from "./CraftScreen";

export const dynamic = "force-dynamic";

export default async function CraftPage({
  searchParams,
}: {
  // Prefilled when arriving from a planned calendar event.
  searchParams: Promise<{ pattern?: string; qty?: string; event?: string }>;
}) {
  const [{ patterns, materials }, params] = await Promise.all([
    getCraftPageData(),
    searchParams,
  ]);

  return (
    <CraftScreen
      patterns={patterns.map((p) => ({
        id: p.id,
        name: p.name,
        estimatedMinutes: p.estimatedMinutes,
        bom: p.bom,
      }))}
      materials={materials}
      initialPatternId={params.pattern}
      initialQty={params.qty}
      eventId={params.event}
    />
  );
}
