/**
 * Domain types for Vimar.
 *
 * Money convention: every `*Cents` field is a number of cents. Unit costs are
 * allowed to be fractional cents (stuffing at $0.185/oz is a real thing), so
 * they are not forced to integers. Totals that get persisted are rounded to
 * whole cents at the boundary — see `money.ts`.
 *
 * Quantity convention: quantities are floats (1.5 skeins, 4.25 oz) rounded to
 * QTY_PRECISION decimals whenever they are stored or compared.
 */

export type ID = string;

/** An ISO date string, `YYYY-MM-DD`. */
export type DateOnly = string;

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export interface Material {
  id: ID;
  name: string;
  category: string;
  /** Unit of measure the material is bought and consumed in: skein, oz, pair… */
  unit: string;
  /** Optional supplier/provider name. */
  provider: string | null;
  description: string | null;
  /** Qty at or below which the material counts as low stock. */
  reorderLevel: number;
  /** Photo of the material — a blob URL, or any URL you paste in. */
  imageUrl: string | null;
  archived: boolean;
  createdAt: string;
}

/**
 * One purchase lot of a material. Cost varies purchase to purchase, so each
 * lot keeps the price it was actually bought at and is consumed FIFO.
 */
export interface MaterialBatch {
  id: ID;
  materialId: ID;
  purchasedAt: DateOnly;
  /** Quantity originally purchased. Never changes — it is the historical record. */
  qty: number;
  /** Quantity still unconsumed. Decremented as crafts eat into the lot. */
  qtyRemaining: number;
  /** Cost per single unit, in cents. May be fractional. */
  unitCostCents: number;
  note: string | null;
  createdAt: string;
}

export interface MaterialWithBatches extends Material {
  batches: MaterialBatch[];
}

/** Derived stock/valuation figures for one material. */
export interface MaterialStock {
  /** Sum of `qtyRemaining` across lots. */
  qtyOnHand: number;
  /** Value of the stock actually on hand, at each lot's own cost. */
  stockValueCents: number;
  /** Weighted average cost of what is *currently* on hand. */
  avgCostCents: number;
  /** Weighted average cost across every lot ever bought — "what this usually costs". */
  lifetimeAvgCostCents: number;
  /** Cost of the most recent purchase, or null if never purchased. */
  latestCostCents: number | null;
  isLow: boolean;
  isOut: boolean;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export interface Tag {
  id: ID;
  name: string;
  /** True for the built-in starter tags, false for ones Vicky typed herself. */
  isPredefined: boolean;
}

/** One line of a pattern's bill of materials: how much of a material per unit. */
export interface BomLine {
  materialId: ID;
  qty: number;
}

export interface Pattern {
  id: ID;
  name: string;
  description: string | null;
  /** Approximate time to craft one unit. */
  estimatedMinutes: number;
  salePriceCents: number;
  imageUrl: string | null;
  archived: boolean;
  createdAt: string;
}

export interface PatternDetail extends Pattern {
  bom: BomLine[];
  tags: Tag[];
}

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------

/**
 * One "I finished a batch of these" event. The unit cost is whatever the FIFO
 * lots actually cost at that moment, including any extra material recorded on
 * this session — so two sessions of the same pattern can legitimately differ.
 */
export interface CraftSession {
  id: ID;
  patternId: ID;
  /** Units produced. */
  qty: number;
  /** Units still in stock (decremented when units are sold/gifted/scrapped). */
  qtyRemaining: number;
  unitCostCents: number;
  totalCostCents: number;
  craftedAt: DateOnly;
  actualMinutes: number | null;
  note: string | null;
  createdAt: string;
}

/**
 * What a session actually used of one material, per unit — compared against
 * what the pattern's standard BOM said. A difference is the "I messed up and
 * burned an extra half skein" record.
 */
export interface CraftSessionLine {
  id: ID;
  sessionId: ID;
  materialId: ID;
  qtyPerUnit: number;
  /** The pattern's BOM qty at craft time, or null if this material wasn't in the BOM. */
  standardQtyPerUnit: number | null;
  totalQty: number;
  costCents: number;
}

/** Audit trail: exactly which purchase lot fed which craft session, and at what price. */
export interface CraftConsumption {
  id: ID;
  sessionId: ID;
  materialId: ID;
  batchId: ID;
  qty: number;
  unitCostCents: number;
  costCents: number;
}

export interface CraftSessionDetail extends CraftSession {
  lines: CraftSessionLine[];
  consumptions: CraftConsumption[];
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateMaterialInput {
  name: string;
  category: string;
  unit: string;
  provider?: string | null;
  description?: string | null;
  reorderLevel?: number;
  imageUrl?: string | null;
}

export type UpdateMaterialInput = Partial<CreateMaterialInput> & { archived?: boolean };

export interface AddBatchInput {
  materialId: ID;
  purchasedAt: DateOnly;
  qty: number;
  unitCostCents: number;
  note?: string | null;
}

export interface SavePatternInput {
  id?: ID;
  name: string;
  description?: string | null;
  estimatedMinutes: number;
  salePriceCents: number;
  imageUrl?: string | null;
  bom: BomLine[];
  /** Tag names — created on demand if they don't exist yet. */
  tagNames: string[];
}

/** What the user says they actually used, per single unit. */
export interface CraftUsageLine {
  materialId: ID;
  qtyPerUnit: number;
}

export interface CompleteCraftInput {
  patternId: ID;
  qty: number;
  usage: CraftUsageLine[];
  craftedAt?: DateOnly;
  actualMinutes?: number | null;
  note?: string | null;
  /** When false (default), a craft that would overdraw stock is rejected. */
  allowNegativeStock?: boolean;
}
