import {
  InUseError,
  type BomLine,
  type ID,
  type Pattern,
  type PatternDetail,
  type PatternRepository,
  type SavePatternInput,
  type Tag,
} from "@vimar/core";
import { asc, eq } from "drizzle-orm";
import type { DrizzleDb } from "../client";
import { createId } from "../id";
import { craftSessions, patternMaterials, patternTags, patterns, tags } from "../schema";
import type { DrizzleTagRepository } from "./tag-repository";

type PatternRow = typeof patterns.$inferSelect;

function toPattern(row: PatternRow): Pattern {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    estimatedMinutes: row.estimatedMinutes,
    salePriceCents: row.salePriceCents,
    imageUrl: row.imageUrl,
    archived: row.archived,
    createdAt: row.createdAt,
  };
}

export class DrizzlePatternRepository implements PatternRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly tagRepo: DrizzleTagRepository,
  ) {}

  async list(options?: { includeArchived?: boolean }): Promise<PatternDetail[]> {
    const rows = await this.db
      .select()
      .from(patterns)
      .where(options?.includeArchived ? undefined : eq(patterns.archived, false))
      .orderBy(asc(patterns.name));

    if (rows.length === 0) return [];

    const bomRows = await this.db
      .select()
      .from(patternMaterials)
      .orderBy(asc(patternMaterials.sortOrder));

    const tagRows = await this.db
      .select({
        patternId: patternTags.patternId,
        id: tags.id,
        name: tags.name,
        isPredefined: tags.isPredefined,
      })
      .from(patternTags)
      .innerJoin(tags, eq(patternTags.tagId, tags.id))
      .orderBy(asc(tags.name));

    const bomByPattern = new Map<ID, BomLine[]>();
    for (const row of bomRows) {
      const line = { materialId: row.materialId, qty: row.qty };
      const list = bomByPattern.get(row.patternId);
      if (list) list.push(line);
      else bomByPattern.set(row.patternId, [line]);
    }

    const tagsByPattern = new Map<ID, Tag[]>();
    for (const row of tagRows) {
      const tag = { id: row.id, name: row.name, isPredefined: row.isPredefined };
      const list = tagsByPattern.get(row.patternId);
      if (list) list.push(tag);
      else tagsByPattern.set(row.patternId, [tag]);
    }

    return rows.map((row) => ({
      ...toPattern(row),
      bom: bomByPattern.get(row.id) ?? [],
      tags: tagsByPattern.get(row.id) ?? [],
    }));
  }

  async findById(id: ID): Promise<PatternDetail | null> {
    const [row] = await this.db.select().from(patterns).where(eq(patterns.id, id)).limit(1);
    if (!row) return null;

    const bomRows = await this.db
      .select()
      .from(patternMaterials)
      .where(eq(patternMaterials.patternId, id))
      .orderBy(asc(patternMaterials.sortOrder));

    const tagRows = await this.db
      .select({ id: tags.id, name: tags.name, isPredefined: tags.isPredefined })
      .from(patternTags)
      .innerJoin(tags, eq(patternTags.tagId, tags.id))
      .where(eq(patternTags.patternId, id))
      .orderBy(asc(tags.name));

    return {
      ...toPattern(row),
      bom: bomRows.map((b) => ({ materialId: b.materialId, qty: b.qty })),
      tags: tagRows,
    };
  }

  async save(input: SavePatternInput): Promise<PatternDetail> {
    // Tags are resolved before the transaction because `ensure` may insert, and
    // better-sqlite3 transactions have to run synchronously.
    const resolvedTags: Tag[] = [];
    for (const name of dedupe(input.tagNames)) {
      resolvedTags.push(await this.tagRepo.ensure(name));
    }

    const id = input.id ?? createId("pat");
    const isUpdate = Boolean(input.id);

    const values = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      estimatedMinutes: Math.max(0, Math.round(input.estimatedMinutes || 0)),
      salePriceCents: Math.max(0, Math.round(input.salePriceCents || 0)),
      imageUrl: input.imageUrl?.trim() || null,
    };

    // Deduplicate BOM lines: the unique index on (pattern, material) would
    // reject a form that listed the same yarn twice, so fold them together.
    const bom = foldBom(input.bom);

    this.db.transaction((tx) => {
      if (isUpdate) {
        tx.update(patterns).set(values).where(eq(patterns.id, id)).run();
        tx.delete(patternMaterials).where(eq(patternMaterials.patternId, id)).run();
        tx.delete(patternTags).where(eq(patternTags.patternId, id)).run();
      } else {
        tx.insert(patterns).values({ ...values, archived: false }).run();
      }

      if (bom.length > 0) {
        tx.insert(patternMaterials)
          .values(
            bom.map((line, index) => ({
              id: createId("bom"),
              patternId: id,
              materialId: line.materialId,
              qty: line.qty,
              sortOrder: index,
            })),
          )
          .run();
      }

      if (resolvedTags.length > 0) {
        tx.insert(patternTags)
          .values(resolvedTags.map((tag) => ({ patternId: id, tagId: tag.id })))
          .run();
      }
    });

    const saved = await this.findById(id);
    if (!saved) throw new Error("Pattern disappeared right after saving.");
    return saved;
  }

  async archive(id: ID, archived: boolean): Promise<void> {
    await this.db.update(patterns).set({ archived }).where(eq(patterns.id, id));
  }

  async remove(id: ID): Promise<void> {
    const [crafted] = await this.db
      .select({ id: craftSessions.id })
      .from(craftSessions)
      .where(eq(craftSessions.patternId, id))
      .limit(1);
    if (crafted) {
      throw new InUseError("This pattern has craft history and can't be deleted. Archive it instead.");
    }

    await this.db.delete(patterns).where(eq(patterns.id, id));
  }
}

function dedupe(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function foldBom(bom: readonly BomLine[]): BomLine[] {
  const totals = new Map<ID, number>();
  for (const line of bom) {
    if (!line.materialId || !(line.qty > 0)) continue;
    totals.set(line.materialId, (totals.get(line.materialId) ?? 0) + line.qty);
  }
  return [...totals].map(([materialId, qty]) => ({ materialId, qty }));
}
