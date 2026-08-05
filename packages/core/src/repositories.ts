/**
 * Repository interfaces — the only contract the app layer knows about.
 *
 * Implementations live in `@vimar/db` (Drizzle/SQLite). Swapping storage means
 * writing a new set of these, not touching `apps/web` or the costing logic.
 */

import type {
  AddBatchInput,
  CraftSession,
  CraftSessionDetail,
  CraftSessionLine,
  CreateMaterialInput,
  ID,
  Material,
  MaterialBatch,
  MaterialWithBatches,
  Pattern,
  PatternDetail,
  SavePatternInput,
  Tag,
  UpdateMaterialInput,
} from "./types";
import type {
  EventListFilter,
  EventStatus,
  EventTask,
  EventWithTasks,
  SaveEventInput,
} from "./planner";

export interface MaterialRepository {
  list(options?: { includeArchived?: boolean }): Promise<MaterialWithBatches[]>;
  findById(id: ID): Promise<MaterialWithBatches | null>;
  create(input: CreateMaterialInput): Promise<Material>;
  update(id: ID, input: UpdateMaterialInput): Promise<void>;
  /** Fails if the material is referenced by any pattern or craft session. */
  remove(id: ID): Promise<void>;
  addBatch(input: AddBatchInput): Promise<MaterialBatch>;
  removeBatch(batchId: ID): Promise<void>;
}

export interface PatternRepository {
  list(options?: { includeArchived?: boolean }): Promise<PatternDetail[]>;
  findById(id: ID): Promise<PatternDetail | null>;
  /** Creates when `input.id` is absent, otherwise replaces BOM + tags wholesale. */
  save(input: SavePatternInput): Promise<PatternDetail>;
  /** Hide/restore without touching the recipe — the safe alternative to deleting. */
  archive(id: ID, archived: boolean): Promise<void>;
  remove(id: ID): Promise<void>;
}

export interface TagRepository {
  list(): Promise<Tag[]>;
  /** Returns the existing tag with this name (case-insensitive) or creates it. */
  ensure(name: string): Promise<Tag>;
  remove(id: ID): Promise<void>;
}

/** A fully-resolved craft, ready to be written atomically. */
export interface RecordCraftInput {
  patternId: ID;
  qty: number;
  craftedAt: string;
  actualMinutes: number | null;
  note: string | null;
  unitCostCents: number;
  totalCostCents: number;
  lines: Array<Omit<CraftSessionLine, "id" | "sessionId">>;
  /** Lot draw-downs to apply. The repository re-checks each one inside the transaction. */
  consumptions: Array<{
    materialId: ID;
    batchId: ID;
    qty: number;
    unitCostCents: number;
    costCents: number;
  }>;
  allowNegativeStock: boolean;
}

export interface CraftRepository {
  listSessions(options?: { patternId?: ID }): Promise<CraftSession[]>;
  findSession(id: ID): Promise<CraftSessionDetail | null>;
  /**
   * Insert the session, its usage lines and its lot consumptions, and decrement
   * the affected lots — all in one transaction.
   */
  record(input: RecordCraftInput): Promise<CraftSession>;
  /** Draw finished units out of stock (sold, gifted, scrapped). */
  removeUnits(patternId: ID, qty: number): Promise<void>;
  /** Undo a craft: restore the consumed lots and delete the session. */
  deleteSession(id: ID): Promise<void>;
}

export interface EventRepository {
  list(filter?: EventListFilter): Promise<EventWithTasks[]>;
  findById(id: ID): Promise<EventWithTasks | null>;
  /** Creates when `input.id` is absent; on update, `taskTitles` is ignored. */
  save(input: SaveEventInput): Promise<EventWithTasks>;
  setStatus(id: ID, status: EventStatus): Promise<void>;
  remove(id: ID): Promise<void>;

  addTask(eventId: ID, title: string): Promise<EventTask>;
  setTaskDone(taskId: ID, done: boolean): Promise<void>;
  renameTask(taskId: ID, title: string): Promise<void>;
  removeTask(taskId: ID): Promise<void>;
}

/** Everything the app needs, in one injectable bundle. */
export interface Repositories {
  materials: MaterialRepository;
  patterns: PatternRepository;
  tags: TagRepository;
  crafts: CraftRepository;
  events: EventRepository;
}

/** Thrown when a craft or removal would overdraw stock. */
export class InsufficientStockError extends Error {
  readonly shortfalls: string[];

  constructor(shortfalls: string[]) {
    super(`Not enough stock: ${shortfalls.join("; ")}`);
    this.name = "InsufficientStockError";
    this.shortfalls = shortfalls;
  }
}

/** Thrown when a record can't be deleted because something still points at it. */
export class InUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InUseError";
  }
}
