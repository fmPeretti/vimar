import "server-only";

import {
  daysUntil,
  eventReadiness,
  materialStock,
  patternCost,
  rollUpInventory,
  type DashboardTotals,
  type MaterialStock,
  type MaterialWithBatches,
  type PatternCost,
  type PatternDetail,
} from "@vimar/core";
import { repositories } from "@/lib/repos";

export interface MaterialView {
  material: MaterialWithBatches;
  stock: MaterialStock;
}

export async function getMaterialViews(): Promise<MaterialView[]> {
  const materials = await repositories.materials.list();
  return materials.map((material) => ({ material, stock: materialStock(material) }));
}

export interface PatternView {
  pattern: PatternDetail;
  cost: PatternCost;
}

export async function getPatternViews(): Promise<{
  patterns: PatternView[];
  materials: MaterialWithBatches[];
}> {
  const [patterns, materials] = await Promise.all([
    repositories.patterns.list(),
    repositories.materials.list(),
  ]);

  return {
    materials,
    patterns: patterns.map((pattern) => ({
      pattern,
      cost: patternCost(pattern.bom, materials),
    })),
  };
}

export async function getInventoryData() {
  const [patterns, sessions] = await Promise.all([
    repositories.patterns.list(),
    repositories.crafts.listSessions(),
  ]);
  return { rollups: rollUpInventory(patterns, sessions), sessions };
}

export async function getDashboardData() {
  const [materials, patterns, sessions] = await Promise.all([
    repositories.materials.list(),
    repositories.patterns.list(),
    repositories.crafts.listSessions(),
  ]);

  const materialViews = materials.map((material) => ({
    material,
    stock: materialStock(material),
  }));

  const rollups = rollUpInventory(patterns, sessions);

  const materialsValueCents = materialViews.reduce((sum, v) => sum + v.stock.stockValueCents, 0);
  const craftedValueCents = rollups.reduce((sum, r) => sum + r.stockValueCents, 0);
  const craftedUnits = rollups.reduce((sum, r) => sum + r.qtyOnHand, 0);
  const retailValueCents = rollups.reduce(
    (sum, r) => sum + r.qtyOnHand * r.pattern.salePriceCents,
    0,
  );

  const totals: DashboardTotals = {
    materialsValueCents,
    materialTypeCount: materialViews.length,
    craftedValueCents,
    craftedUnits,
    totalTiedUpCents: materialsValueCents + craftedValueCents,
    retailValueCents,
    potentialProfitCents: retailValueCents - craftedValueCents,
    lowStockCount: materialViews.filter((v) => v.stock.isLow).length,
    outOfStockCount: materialViews.filter((v) => v.stock.isOut).length,
  };

  return {
    totals,
    lowStock: materialViews
      .filter((v) => v.stock.isLow)
      .sort((a, b) => a.stock.qtyOnHand - b.stock.qtyOnHand),
    rollups: rollups.filter((r) => r.qtyOnHand > 0).sort((a, b) => b.stockValueCents - a.stockValueCents),
    recentSessions: sessions.slice(0, 6),
    patterns,
  };
}

export async function getCraftPageData() {
  const [patterns, materials] = await Promise.all([
    repositories.patterns.list(),
    repositories.materials.list(),
  ]);

  return {
    patterns,
    materials: materials.map((material) => {
      const stock = materialStock(material);
      return {
        id: material.id,
        name: material.name,
        unit: material.unit,
        qtyOnHand: stock.qtyOnHand,
        unitCostCents: stock.avgCostCents || stock.lifetimeAvgCostCents,
      };
    }),
  };
}

export async function getTags() {
  return repositories.tags.list();
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * Events for a month, each paired with a materials readiness check so the
 * calendar can flag a craft that can't actually be made before the day arrives.
 */
export async function getPlannerData(from: string, to: string) {
  const [events, patterns, materials] = await Promise.all([
    repositories.events.list({ from, to }),
    repositories.patterns.list({ includeArchived: true }),
    repositories.materials.list(),
  ]);

  const patternsById = new Map(patterns.map((p) => [p.id, p]));

  return {
    patterns,
    events: events.map((event) => {
      const pattern = event.patternId ? patternsById.get(event.patternId) ?? null : null;
      return {
        event,
        pattern,
        readiness: eventReadiness(event, pattern?.bom, materials),
      };
    }),
  };
}

export async function getEventDetail(id: string) {
  const event = await repositories.events.findById(id);
  if (!event) return null;

  const [patterns, materials] = await Promise.all([
    repositories.patterns.list({ includeArchived: true }),
    repositories.materials.list(),
  ]);

  const pattern = event.patternId ? patterns.find((p) => p.id === event.patternId) ?? null : null;

  return {
    event,
    pattern,
    patterns,
    readiness: eventReadiness(event, pattern?.bom, materials),
  };
}

/** The dashboard's "coming up" strip: the next few planned events. */
export async function getUpcomingEvents(today: string, days = 21) {
  const to = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [events, patterns, materials] = await Promise.all([
    repositories.events.list({ from: today, to, status: "planned" }),
    repositories.patterns.list({ includeArchived: true }),
    repositories.materials.list(),
  ]);

  const patternsById = new Map(patterns.map((p) => [p.id, p]));

  return events.map((event) => {
    const pattern = event.patternId ? patternsById.get(event.patternId) ?? null : null;
    return {
      event,
      pattern,
      readiness: eventReadiness(event, pattern?.bom, materials),
      daysAway: daysUntil(event.scheduledFor, today),
    };
  });
}
