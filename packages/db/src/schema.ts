import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export const materials = sqliteTable(
  "materials",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull().default("Other"),
    unit: text("unit").notNull().default("unit"),
    provider: text("provider"),
    description: text("description"),
    reorderLevel: real("reorder_level").notNull().default(0),
    imageUrl: text("image_url"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("materials_name_idx").on(t.name)],
);

/**
 * A purchase lot. `qty` is the historical purchase quantity and never changes;
 * `qtyRemaining` is drawn down FIFO as crafts consume the material, which is
 * what preserves the price actually paid for the yarn being used.
 */
export const materialBatches = sqliteTable(
  "material_batches",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    purchasedAt: text("purchased_at").notNull(),
    qty: real("qty").notNull(),
    qtyRemaining: real("qty_remaining").notNull(),
    /** Cents per unit; fractional cents allowed. */
    unitCostCents: real("unit_cost_cents").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("material_batches_fifo_idx").on(t.materialId, t.purchasedAt, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export const patterns = sqliteTable(
  "patterns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
    salePriceCents: integer("sale_price_cents").notNull().default(0),
    imageUrl: text("image_url"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("patterns_name_idx").on(t.name)],
);

/** Bill of materials: how much of a material one unit of the pattern needs. */
export const patternMaterials = sqliteTable(
  "pattern_materials",
  {
    id: text("id").primaryKey(),
    patternId: text("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    qty: real("qty").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("pattern_materials_unique").on(t.patternId, t.materialId)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    isPredefined: integer("is_predefined", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("tags_name_unique").on(t.name)],
);

export const patternTags = sqliteTable(
  "pattern_tags",
  {
    patternId: text("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("pattern_tags_unique").on(t.patternId, t.tagId)],
);

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------

/** One "finished a batch of these" event, with its own cost basis. */
export const craftSessions = sqliteTable(
  "craft_sessions",
  {
    id: text("id").primaryKey(),
    patternId: text("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "restrict" }),
    qty: real("qty").notNull(),
    qtyRemaining: real("qty_remaining").notNull(),
    unitCostCents: real("unit_cost_cents").notNull(),
    totalCostCents: real("total_cost_cents").notNull(),
    craftedAt: text("crafted_at").notNull(),
    actualMinutes: integer("actual_minutes"),
    note: text("note"),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("craft_sessions_pattern_idx").on(t.patternId, t.craftedAt)],
);

/**
 * Actual per-unit usage for a session, alongside the recipe's standard qty.
 * A row where `qty_per_unit > standard_qty_per_unit` is the record of extra
 * material burned on this specific batch.
 */
export const craftSessionLines = sqliteTable(
  "craft_session_lines",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => craftSessions.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    qtyPerUnit: real("qty_per_unit").notNull(),
    standardQtyPerUnit: real("standard_qty_per_unit"),
    totalQty: real("total_qty").notNull(),
    costCents: real("cost_cents").notNull(),
  },
  (t) => [index("craft_session_lines_session_idx").on(t.sessionId)],
);

/** Audit trail: which lot fed which session, at which price. */
export const craftConsumptions = sqliteTable(
  "craft_consumptions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => craftSessions.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    batchId: text("batch_id")
      .notNull()
      .references(() => materialBatches.id, { onDelete: "restrict" }),
    qty: real("qty").notNull(),
    unitCostCents: real("unit_cost_cents").notNull(),
    costCents: real("cost_cents").notNull(),
  },
  (t) => [index("craft_consumptions_session_idx").on(t.sessionId)],
);

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * A planned event. When `pattern_id` is set the app can check, ahead of time,
 * whether the materials for `planned_qty` units are actually on the shelf.
 *
 * `onDelete: "set null"` on the pattern keeps old plans readable after a
 * pattern is deleted, rather than cascading the history away.
 */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("other"),
    scheduledFor: text("scheduled_for").notNull(),
    scheduledTime: text("scheduled_time"),
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    status: text("status").notNull().default("planned"),
    patternId: text("pattern_id").references(() => patterns.id, { onDelete: "set null" }),
    plannedQty: real("planned_qty"),
    createdAt: text("created_at").notNull().$defaultFn(now),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("events_date_idx").on(t.scheduledFor),
    index("events_status_idx").on(t.status, t.scheduledFor),
  ],
);

/** Checklist items Vicky ticks off as the event approaches. */
export const eventTasks = sqliteTable(
  "event_tasks",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    doneAt: text("done_at"),
  },
  (t) => [index("event_tasks_event_idx").on(t.eventId, t.sortOrder)],
);

// ---------------------------------------------------------------------------
// Site login lockout
// ---------------------------------------------------------------------------

/**
 * Single-row table (id is always 1) tracking failed Basic Auth attempts
 * against the whole site. Once `locked` is set it stays set — a correct
 * password no longer clears it — until the row is reset. That happens two
 * ways: the app resets it once at process startup (so restarting the server
 * is always a way out), or an operator runs
 * `UPDATE auth_lockout SET failed_attempts = 0, locked = 0 WHERE id = 1;`
 * directly against the live database.
 */
export const authLockout = sqliteTable("auth_lockout", {
  id: integer("id").primaryKey(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

export const schema = {
  materials,
  materialBatches,
  patterns,
  patternMaterials,
  tags,
  patternTags,
  craftSessions,
  craftSessionLines,
  craftConsumptions,
  events,
  eventTasks,
  authLockout,
};
