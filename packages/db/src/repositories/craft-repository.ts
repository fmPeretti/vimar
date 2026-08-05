import {
  InsufficientStockError,
  InUseError,
  QTY_EPSILON,
  roundQty,
  type CraftRepository,
  type CraftSession,
  type CraftSessionDetail,
  type ID,
  type RecordCraftInput,
} from "@vimar/core";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { DrizzleDb } from "../client";
import { createId } from "../id";
import {
  craftConsumptions,
  craftSessionLines,
  craftSessions,
  materialBatches,
  materials,
} from "../schema";

type SessionRow = typeof craftSessions.$inferSelect;

function toSession(row: SessionRow): CraftSession {
  return {
    id: row.id,
    patternId: row.patternId,
    qty: row.qty,
    qtyRemaining: row.qtyRemaining,
    unitCostCents: row.unitCostCents,
    totalCostCents: row.totalCostCents,
    craftedAt: row.craftedAt,
    actualMinutes: row.actualMinutes,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export class DrizzleCraftRepository implements CraftRepository {
  constructor(private readonly db: DrizzleDb) {}

  async listSessions(options?: { patternId?: ID }): Promise<CraftSession[]> {
    const rows = await this.db
      .select()
      .from(craftSessions)
      .where(options?.patternId ? eq(craftSessions.patternId, options.patternId) : undefined)
      .orderBy(desc(craftSessions.craftedAt), desc(craftSessions.createdAt));
    return rows.map(toSession);
  }

  async findSession(id: ID): Promise<CraftSessionDetail | null> {
    const [row] = await this.db.select().from(craftSessions).where(eq(craftSessions.id, id)).limit(1);
    if (!row) return null;

    const [lines, consumptions] = await Promise.all([
      this.db.select().from(craftSessionLines).where(eq(craftSessionLines.sessionId, id)),
      this.db.select().from(craftConsumptions).where(eq(craftConsumptions.sessionId, id)),
    ]);

    return { ...toSession(row), lines, consumptions };
  }

  /**
   * Writes the session, its usage lines and its lot draw-downs in a single
   * transaction, re-checking each lot's remaining quantity at write time so two
   * concurrent crafts can't both spend the same skein.
   */
  async record(input: RecordCraftInput): Promise<CraftSession> {
    const sessionId = createId("crf");
    const createdAt = new Date().toISOString();

    const session: SessionRow = {
      id: sessionId,
      patternId: input.patternId,
      qty: input.qty,
      qtyRemaining: input.qty,
      unitCostCents: input.unitCostCents,
      totalCostCents: input.totalCostCents,
      craftedAt: input.craftedAt,
      actualMinutes: input.actualMinutes,
      note: input.note,
      createdAt,
    };

    this.db.transaction((tx) => {
      const shortfalls: string[] = [];

      for (const consumption of input.consumptions) {
        const [batch] = tx
          .select({ qtyRemaining: materialBatches.qtyRemaining })
          .from(materialBatches)
          .where(eq(materialBatches.id, consumption.batchId))
          .limit(1)
          .all();

        const available = batch?.qtyRemaining ?? 0;
        if (available + QTY_EPSILON < consumption.qty) {
          const [material] = tx
            .select({ name: materials.name, unit: materials.unit })
            .from(materials)
            .where(eq(materials.id, consumption.materialId))
            .limit(1)
            .all();
          shortfalls.push(
            `${material?.name ?? consumption.materialId}: only ${roundQty(available)} ${material?.unit ?? ""} left in that purchase`.trim(),
          );
          if (!input.allowNegativeStock) continue;
        }

        tx.update(materialBatches)
          .set({ qtyRemaining: sql`max(0, ${materialBatches.qtyRemaining} - ${consumption.qty})` })
          .where(eq(materialBatches.id, consumption.batchId))
          .run();
      }

      // Stock moved between planning and writing — abort so nothing is
      // half-applied, and let the caller re-plan against current stock.
      if (shortfalls.length > 0 && !input.allowNegativeStock) {
        throw new InsufficientStockError(shortfalls);
      }

      tx.insert(craftSessions).values(session).run();

      if (input.lines.length > 0) {
        tx.insert(craftSessionLines)
          .values(input.lines.map((line) => ({ ...line, id: createId("csl"), sessionId })))
          .run();
      }

      if (input.consumptions.length > 0) {
        tx.insert(craftConsumptions)
          .values(input.consumptions.map((c) => ({ ...c, id: createId("ccn"), sessionId })))
          .run();
      }
    });

    return toSession(session);
  }

  /** Draw finished units out of stock oldest-session-first, so cost basis leaves in the order it arrived. */
  async removeUnits(patternId: ID, qty: number): Promise<void> {
    if (qty <= 0) return;

    this.db.transaction((tx) => {
      const sessions = tx
        .select()
        .from(craftSessions)
        .where(eq(craftSessions.patternId, patternId))
        .orderBy(asc(craftSessions.craftedAt), asc(craftSessions.createdAt))
        .all();

      let remaining = qty;
      for (const session of sessions) {
        if (remaining <= 0) break;
        if (session.qtyRemaining <= 0) continue;
        const take = Math.min(session.qtyRemaining, remaining);
        tx.update(craftSessions)
          .set({ qtyRemaining: session.qtyRemaining - take })
          .where(eq(craftSessions.id, session.id))
          .run();
        remaining -= take;
      }

      if (remaining > QTY_EPSILON) {
        throw new InsufficientStockError([`only ${qty - remaining} finished units in stock`]);
      }
    });
  }

  /** Undo a craft: hand the materials back to the lots they came from, then drop the session. */
  async deleteSession(id: ID): Promise<void> {
    this.db.transaction((tx) => {
      const [session] = tx.select().from(craftSessions).where(eq(craftSessions.id, id)).limit(1).all();
      if (!session) return;

      if (session.qtyRemaining < session.qty - QTY_EPSILON) {
        throw new InUseError(
          "Some units from this craft have already left stock, so it can't be undone. Adjust the stock count instead.",
        );
      }

      const consumptions = tx
        .select()
        .from(craftConsumptions)
        .where(eq(craftConsumptions.sessionId, id))
        .all();

      for (const c of consumptions) {
        tx.update(materialBatches)
          .set({ qtyRemaining: sql`min(${materialBatches.qty}, ${materialBatches.qtyRemaining} + ${c.qty})` })
          .where(eq(materialBatches.id, c.batchId))
          .run();
      }

      // Lines and consumptions go with it via ON DELETE CASCADE.
      tx.delete(craftSessions).where(eq(craftSessions.id, id)).run();
    });
  }
}
