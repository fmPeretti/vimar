import type { ID, Tag, TagRepository } from "@vimar/core";
import { asc, eq, sql } from "drizzle-orm";
import type { DrizzleDb } from "../client";
import { createId } from "../id";
import { tags } from "../schema";

export class DrizzleTagRepository implements TagRepository {
  constructor(private readonly db: DrizzleDb) {}

  async list(): Promise<Tag[]> {
    return this.db
      .select({ id: tags.id, name: tags.name, isPredefined: tags.isPredefined })
      .from(tags)
      .orderBy(asc(tags.isPredefined), asc(tags.name));
  }

  /** Case-insensitive get-or-create, so "seasonal" doesn't become a second "Seasonal". */
  async ensure(name: string, isPredefined = false): Promise<Tag> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Tag name can't be empty.");

    const [existing] = await this.db
      .select({ id: tags.id, name: tags.name, isPredefined: tags.isPredefined })
      .from(tags)
      .where(sql`lower(${tags.name}) = lower(${trimmed})`)
      .limit(1);
    if (existing) return existing;

    const row = { id: createId("tag"), name: trimmed, isPredefined, createdAt: new Date().toISOString() };
    await this.db.insert(tags).values(row);
    return { id: row.id, name: row.name, isPredefined: row.isPredefined };
  }

  async remove(id: ID): Promise<void> {
    await this.db.delete(tags).where(eq(tags.id, id));
  }
}
