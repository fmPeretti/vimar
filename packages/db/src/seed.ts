/**
 * Seeds a realistic starting point: materials with staggered purchase prices,
 * patterns with bills of materials, and a few completed crafts run through the
 * real FIFO service — so the costs in the seeded data are genuinely derived,
 * not hardcoded.
 *
 *   npm run db:seed            # skips if data already exists
 *   npm run db:seed -- --force # wipe and reseed
 */

import { completeCraft, PREDEFINED_TAGS, TASK_TEMPLATES, todayISO, type EventKind } from "@vimar/core";
import { db } from "./client";
import { loadEnvFiles } from "./env";
import { createRepositories } from "./index";
import {
  craftConsumptions,
  craftSessionLines,
  craftSessions,
  eventTasks,
  events,
  materialBatches,
  materials,
  patternMaterials,
  patternTags,
  patterns,
  tags,
} from "./schema";
import { DrizzleTagRepository } from "./repositories/tag-repository";

loadEnvFiles();

const repos = createRepositories(db);
const tagRepo = new DrizzleTagRepository(db);

const force = process.argv.includes("--force");

type BatchSeed = { purchasedAt: string; qty: number; unitCostCents: number };

const MATERIALS: Array<{
  key: string;
  name: string;
  category: string;
  unit: string;
  provider: string;
  description: string;
  reorderLevel: number;
  batches: BatchSeed[];
}> = [
  {
    key: "yellow",
    name: "Sunshine Yellow Chenille",
    category: "Yarn",
    unit: "skein",
    provider: "Bernat (Yarnspirations)",
    description: "Baby Blanket chenille — main Luma colour",
    reorderLevel: 5,
    batches: [
      { purchasedAt: "2026-05-10", qty: 6, unitCostCents: 625 },
      { purchasedAt: "2026-07-12", qty: 8, unitCostCents: 675 },
    ],
  },
  {
    key: "pink",
    name: "Pastel Pink Velvet",
    category: "Yarn",
    unit: "skein",
    provider: "Hobby Lobby Yarn Bee",
    description: "Velvet yarn for faerie wings & accents",
    reorderLevel: 5,
    batches: [{ purchasedAt: "2026-06-01", qty: 15, unitCostCents: 690 }],
  },
  {
    key: "cream",
    name: "Cream Bouclé",
    category: "Yarn",
    unit: "skein",
    provider: "Lion Brand",
    description: "Textured bouclé for toad body",
    reorderLevel: 4,
    batches: [{ purchasedAt: "2026-06-18", qty: 3, unitCostCents: 720 }],
  },
  {
    key: "navy",
    name: "Navy Worsted Cotton",
    category: "Yarn",
    unit: "skein",
    provider: "We Crochet",
    description: "Cotton worsted for accessories",
    reorderLevel: 4,
    batches: [{ purchasedAt: "2026-07-20", qty: 9, unitCostCents: 575 }],
  },
  {
    key: "stuffing",
    name: "Poly-fil Stuffing",
    category: "Notion",
    unit: "oz",
    provider: "We Crochet",
    description: "Polyester fiberfill",
    reorderLevel: 20,
    batches: [
      { purchasedAt: "2026-06-15", qty: 40, unitCostCents: 18 },
      { purchasedAt: "2026-07-22", qty: 32, unitCostCents: 21 },
    ],
  },
  {
    key: "eyes",
    name: "Safety Eyes 9mm",
    category: "Notion",
    unit: "pair",
    provider: "Various (Amazon)",
    description: "Black plastic safety eyes",
    reorderLevel: 10,
    batches: [{ purchasedAt: "2026-06-01", qty: 24, unitCostCents: 35 }],
  },
  {
    key: "floss",
    name: "Embroidery Floss (Black)",
    category: "Notion",
    unit: "skein",
    provider: "DMC",
    description: "For mouths & details",
    reorderLevel: 3,
    batches: [{ purchasedAt: "2026-05-20", qty: 5, unitCostCents: 60 }],
  },
];

const PATTERNS: Array<{
  key: string;
  name: string;
  description: string;
  estimatedMinutes: number;
  salePriceCents: number;
  tagNames: string[];
  bom: Array<{ material: string; qty: number }>;
}> = [
  {
    key: "luma",
    name: "Luma",
    description: "Star plushie with embroidered face. The bestseller.",
    estimatedMinutes: 90,
    salePriceCents: 2400,
    tagNames: ["Character", "Bestseller"],
    bom: [
      { material: "yellow", qty: 1.5 },
      { material: "stuffing", qty: 4 },
      { material: "eyes", qty: 1 },
      { material: "floss", qty: 0.2 },
    ],
  },
  {
    key: "strawberry",
    name: "Strawberry Faerie",
    description: "Velvet faerie with removable wings.",
    estimatedMinutes: 150,
    salePriceCents: 3200,
    tagNames: ["Character", "Seasonal"],
    bom: [
      { material: "pink", qty: 2 },
      { material: "stuffing", qty: 6 },
      { material: "eyes", qty: 1 },
      { material: "floss", qty: 0.3 },
    ],
  },
  {
    key: "flower",
    name: "Granny Flower Charm",
    description: "Granny-square flower keychain charm.",
    estimatedMinutes: 35,
    salePriceCents: 1400,
    tagNames: ["Accessory", "Keychain"],
    bom: [
      { material: "navy", qty: 0.3 },
      { material: "pink", qty: 0.3 },
      { material: "cream", qty: 0.2 },
    ],
  },
  {
    key: "toad",
    name: "Garden Toad",
    description: "Bouclé toad with a little flower hat.",
    estimatedMinutes: 110,
    salePriceCents: 2800,
    tagNames: ["Character"],
    bom: [
      { material: "cream", qty: 1.8 },
      { material: "stuffing", qty: 5 },
      { material: "eyes", qty: 1 },
      { material: "floss", qty: 0.2 },
    ],
  },
];

/** Crafts are replayed in date order so FIFO consumes lots the way it really would. */
const CRAFTS: Array<{
  pattern: string;
  qty: number;
  craftedAt: string;
  note?: string;
  /** Overrides to the standard BOM, keyed by material — this is the "extra material" case. */
  overrides?: Record<string, number>;
}> = [
  { pattern: "luma", qty: 5, craftedAt: "2026-06-20" },
  { pattern: "strawberry", qty: 4, craftedAt: "2026-07-05" },
  { pattern: "flower", qty: 11, craftedAt: "2026-07-10" },
  {
    pattern: "luma",
    qty: 3,
    craftedAt: "2026-07-25",
    note: "Messed up the first ear — used an extra 0.5 skein of yellow chenille on each.",
    overrides: { yellow: 2 },
  },
];

async function isEmpty(): Promise<boolean> {
  const rows = await db.select({ id: materials.id }).from(materials).limit(1);
  return rows.length === 0;
}

function wipe() {
  db.transaction((tx) => {
    tx.delete(eventTasks).run();
    tx.delete(events).run();
    tx.delete(craftConsumptions).run();
    tx.delete(craftSessionLines).run();
    tx.delete(craftSessions).run();
    tx.delete(patternTags).run();
    tx.delete(patternMaterials).run();
    tx.delete(patterns).run();
    tx.delete(materialBatches).run();
    tx.delete(materials).run();
    tx.delete(tags).run();
  });
}

async function seed() {
  if (!(await isEmpty())) {
    if (!force) {
      console.log("Database already has data — nothing to do. Re-run with `-- --force` to wipe and reseed.");
      return;
    }
    console.log("Wiping existing data…");
    wipe();
  }

  for (const name of PREDEFINED_TAGS) {
    await tagRepo.ensure(name, true);
  }

  const materialIds = new Map<string, string>();
  for (const seedMaterial of MATERIALS) {
    const created = await repos.materials.create({
      name: seedMaterial.name,
      category: seedMaterial.category,
      unit: seedMaterial.unit,
      provider: seedMaterial.provider,
      description: seedMaterial.description,
      reorderLevel: seedMaterial.reorderLevel,
    });
    materialIds.set(seedMaterial.key, created.id);

    for (const batch of seedMaterial.batches) {
      await repos.materials.addBatch({ materialId: created.id, ...batch });
    }
  }

  const patternIds = new Map<string, string>();
  for (const seedPattern of PATTERNS) {
    const saved = await repos.patterns.save({
      name: seedPattern.name,
      description: seedPattern.description,
      estimatedMinutes: seedPattern.estimatedMinutes,
      salePriceCents: seedPattern.salePriceCents,
      tagNames: seedPattern.tagNames,
      bom: seedPattern.bom.map((line) => ({
        materialId: materialIds.get(line.material)!,
        qty: line.qty,
      })),
    });
    patternIds.set(seedPattern.key, saved.id);
  }

  for (const craft of CRAFTS) {
    const patternKey = craft.pattern;
    const patternId = patternIds.get(patternKey)!;
    const definition = PATTERNS.find((p) => p.key === patternKey)!;

    const usage = definition.bom.map((line) => ({
      materialId: materialIds.get(line.material)!,
      qtyPerUnit: craft.overrides?.[line.material] ?? line.qty,
    }));

    const result = await completeCraft(repos, {
      patternId,
      qty: craft.qty,
      usage,
      craftedAt: craft.craftedAt,
      note: craft.note ?? null,
    });

    console.log(
      `  crafted ${craft.qty} × ${definition.name} @ $${(result.session.unitCostCents / 100).toFixed(2)}/unit` +
        (result.extras.length ? "  (extra material recorded)" : ""),
    );
  }

  // --- Planner ------------------------------------------------------------
  // Dated relative to today so the calendar always has something in view.
  const today = todayISO();
  const inDays = (n: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  const EVENTS: Array<{
    title: string;
    kind: EventKind;
    inDays: number;
    time?: string;
    notes?: string;
    pattern?: string;
    qty?: number;
    doneCount?: number;
  }> = [
    {
      title: "Restock yarn order",
      kind: "restock",
      inDays: 1,
      notes: "Yellow chenille is nearly out — order before the market batch.",
      doneCount: 1,
    },
    {
      title: "Watch invisible-decrease tutorial",
      kind: "learn",
      inDays: 2,
      time: "20:00",
      notes: "For cleaner faces on the toads.",
    },
    {
      // Deliberately under-stocked: 6 Lumas needs far more chenille than is left,
      // so this event demonstrates the missing-materials warning.
      title: "Make Lumas for the market",
      kind: "craft",
      inDays: 4,
      pattern: "luma",
      qty: 6,
      notes: "Craft fair on the 15th.",
      doneCount: 1,
    },
    {
      title: "Pattern release post — Garden Toad",
      kind: "content",
      inDays: 6,
      time: "10:00",
    },
    {
      title: "Flower charm batch",
      kind: "craft",
      inDays: 9,
      pattern: "flower",
      qty: 8,
    },
  ];

  for (const seedEvent of EVENTS) {
    const saved = await repos.events.save({
      title: seedEvent.title,
      kind: seedEvent.kind,
      scheduledFor: inDays(seedEvent.inDays),
      scheduledTime: seedEvent.time ?? null,
      notes: seedEvent.notes ?? null,
      patternId: seedEvent.pattern ? patternIds.get(seedEvent.pattern) ?? null : null,
      plannedQty: seedEvent.qty ?? null,
      taskTitles: TASK_TEMPLATES[seedEvent.kind],
    });

    // Tick off the first few steps so progress bars aren't all at zero.
    for (const task of saved.tasks.slice(0, seedEvent.doneCount ?? 0)) {
      await repos.events.setTaskDone(task.id, true);
    }
  }

  console.log(
    `\nSeeded ${MATERIALS.length} materials, ${PATTERNS.length} patterns, ${CRAFTS.length} craft sessions and ${EVENTS.length} calendar events.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
