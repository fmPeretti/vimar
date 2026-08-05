import type {
  CalendarEvent,
  EventKind,
  EventListFilter,
  EventRepository,
  EventStatus,
  EventTask,
  EventWithTasks,
  ID,
  SaveEventInput,
} from "@vimar/core";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { DrizzleDb } from "../client";
import { createId } from "../id";
import { eventTasks, events } from "../schema";

type EventRow = typeof events.$inferSelect;
type TaskRow = typeof eventTasks.$inferSelect;

function toEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    // `kind` and `status` are stored as free text (SQLite has no enums); the
    // save path is the only writer and it validates, so a cast is safe here.
    kind: row.kind as EventKind,
    scheduledFor: row.scheduledFor,
    scheduledTime: row.scheduledTime,
    durationMinutes: row.durationMinutes,
    notes: row.notes,
    status: row.status as EventStatus,
    patternId: row.patternId,
    plannedQty: row.plannedQty,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function toTask(row: TaskRow): EventTask {
  return {
    id: row.id,
    eventId: row.eventId,
    title: row.title,
    done: row.done,
    sortOrder: row.sortOrder,
    doneAt: row.doneAt,
  };
}

export class DrizzleEventRepository implements EventRepository {
  constructor(private readonly db: DrizzleDb) {}

  async list(filter?: EventListFilter): Promise<EventWithTasks[]> {
    const conditions: SQL[] = [];
    if (filter?.from) conditions.push(gte(events.scheduledFor, filter.from));
    if (filter?.to) conditions.push(lte(events.scheduledFor, filter.to));
    if (filter?.status) conditions.push(eq(events.status, filter.status));

    const rows = await this.db
      .select()
      .from(events)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(events.scheduledFor), asc(events.scheduledTime), asc(events.createdAt));

    if (rows.length === 0) return [];

    const taskRows = await this.db
      .select()
      .from(eventTasks)
      .orderBy(asc(eventTasks.sortOrder));

    const byEvent = new Map<ID, EventTask[]>();
    for (const row of taskRows) {
      const list = byEvent.get(row.eventId);
      if (list) list.push(toTask(row));
      else byEvent.set(row.eventId, [toTask(row)]);
    }

    return rows.map((row) => ({ ...toEvent(row), tasks: byEvent.get(row.id) ?? [] }));
  }

  async findById(id: ID): Promise<EventWithTasks | null> {
    const [row] = await this.db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!row) return null;

    const taskRows = await this.db
      .select()
      .from(eventTasks)
      .where(eq(eventTasks.eventId, id))
      .orderBy(asc(eventTasks.sortOrder));

    return { ...toEvent(row), tasks: taskRows.map(toTask) };
  }

  async save(input: SaveEventInput): Promise<EventWithTasks> {
    const id = input.id ?? createId("evt");
    const isUpdate = Boolean(input.id);

    const values = {
      title: input.title.trim(),
      kind: input.kind,
      scheduledFor: input.scheduledFor,
      scheduledTime: input.scheduledTime?.trim() || null,
      durationMinutes: input.durationMinutes ?? null,
      notes: input.notes?.trim() || null,
      patternId: input.patternId || null,
      plannedQty: input.plannedQty ?? null,
    };

    if (isUpdate) {
      await this.db.update(events).set(values).where(eq(events.id, id));
    } else {
      const titles = (input.taskTitles ?? []).map((t) => t.trim()).filter(Boolean);

      this.db.transaction((tx) => {
        tx.insert(events)
          .values({ ...values, id, status: "planned", createdAt: new Date().toISOString() })
          .run();

        if (titles.length > 0) {
          tx.insert(eventTasks)
            .values(
              titles.map((title, index) => ({
                id: createId("tsk"),
                eventId: id,
                title,
                done: false,
                sortOrder: index,
              })),
            )
            .run();
        }
      });
    }

    const saved = await this.findById(id);
    if (!saved) throw new Error("Event disappeared right after saving.");
    return saved;
  }

  async setStatus(id: ID, status: EventStatus): Promise<void> {
    await this.db
      .update(events)
      .set({ status, completedAt: status === "done" ? new Date().toISOString() : null })
      .where(eq(events.id, id));
  }

  async remove(id: ID): Promise<void> {
    // Tasks go with it via ON DELETE CASCADE.
    await this.db.delete(events).where(eq(events.id, id));
  }

  async addTask(eventId: ID, title: string): Promise<EventTask> {
    const existing = await this.db
      .select({ sortOrder: eventTasks.sortOrder })
      .from(eventTasks)
      .where(eq(eventTasks.eventId, eventId));

    const nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);

    const row = {
      id: createId("tsk"),
      eventId,
      title: title.trim(),
      done: false,
      sortOrder: nextOrder,
      doneAt: null,
    };

    await this.db.insert(eventTasks).values(row);
    return toTask(row);
  }

  async setTaskDone(taskId: ID, done: boolean): Promise<void> {
    await this.db
      .update(eventTasks)
      .set({ done, doneAt: done ? new Date().toISOString() : null })
      .where(eq(eventTasks.id, taskId));
  }

  async renameTask(taskId: ID, title: string): Promise<void> {
    await this.db.update(eventTasks).set({ title: title.trim() }).where(eq(eventTasks.id, taskId));
  }

  async removeTask(taskId: ID): Promise<void> {
    await this.db.delete(eventTasks).where(eq(eventTasks.id, taskId));
  }
}
