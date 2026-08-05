/**
 * Calendar events and their checklists.
 *
 * An event is a plan: "make three Lumas on Saturday", "watch the magic-ring
 * tutorial", "shoot the pattern-release post". Events that name a pattern get
 * a materials readiness check, so a craft that can't actually happen is flagged
 * before the day arrives rather than when the yarn runs out.
 */

import { QTY_EPSILON, roundQty } from "./money";
import type { BomLine, DateOnly, ID, MaterialWithBatches, Pattern } from "./types";

export const EVENT_KINDS = ["craft", "learn", "content", "restock", "admin", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  craft: "Build a pattern",
  learn: "Learn / tutorial",
  content: "Social media post",
  restock: "Restock / shopping",
  admin: "Admin",
  other: "Other",
};

export type EventStatus = "planned" | "done" | "cancelled";

export interface EventTask {
  id: ID;
  eventId: ID;
  title: string;
  done: boolean;
  sortOrder: number;
  doneAt: string | null;
}

export interface CalendarEvent {
  id: ID;
  title: string;
  kind: EventKind;
  scheduledFor: DateOnly;
  /** `HH:MM`, or null for an all-day plan. */
  scheduledTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  status: EventStatus;
  /** Set for craft events — this is what enables the readiness check. */
  patternId: ID | null;
  plannedQty: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface EventWithTasks extends CalendarEvent {
  tasks: EventTask[];
}

// ---------------------------------------------------------------------------
// Checklist templates
// ---------------------------------------------------------------------------

/** Starter checklists offered when creating an event, all editable afterwards. */
export const TASK_TEMPLATES: Record<EventKind, string[]> = {
  craft: [
    "Check I have every material",
    "Crochet the body",
    "Crochet the limbs and details",
    "Stuff and assemble",
    "Embroider the face",
    "Weave in ends",
    "Photograph for the shop",
  ],
  learn: ["Find the tutorial", "Watch it through once", "Take notes", "Try a practice swatch"],
  content: [
    "Pick the photos",
    "Write the caption",
    "Design the graphic",
    "Schedule the post",
  ],
  restock: ["List what's running low", "Compare supplier prices", "Place the order", "Log the purchase"],
  admin: ["Gather receipts", "Update the numbers", "File it away"],
  other: [],
};

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface ReadinessLine {
  materialId: ID;
  materialName: string;
  unit: string;
  /** Total needed for the whole planned quantity. */
  qtyNeeded: number;
  qtyOnHand: number;
  /** How much is missing; 0 when covered. */
  shortBy: number;
}

export interface EventReadiness {
  /** False when this event doesn't name a pattern, so there's nothing to check. */
  applicable: boolean;
  ready: boolean;
  lines: ReadinessLine[];
  missing: ReadinessLine[];
  /** One-line summary suitable for a badge or notification. */
  summary: string;
}

const NOT_APPLICABLE: EventReadiness = {
  applicable: false,
  ready: true,
  lines: [],
  missing: [],
  summary: "",
};

/**
 * Can this planned craft actually be made with what's on the shelf?
 *
 * Deliberately checks against *current* stock only — it does not try to reserve
 * material across several planned events, because a plan is not a commitment
 * and double-counting reservations would produce more false alarms than it
 * prevents.
 */
export function eventReadiness(
  event: Pick<CalendarEvent, "patternId" | "plannedQty">,
  bom: readonly BomLine[] | undefined,
  materials: readonly MaterialWithBatches[],
): EventReadiness {
  if (!event.patternId || !bom || bom.length === 0) return NOT_APPLICABLE;

  const qty = event.plannedQty && event.plannedQty > 0 ? event.plannedQty : 1;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const lines: ReadinessLine[] = [];

  for (const line of bom) {
    const material = byId.get(line.materialId);
    if (!material) continue;

    const qtyOnHand = roundQty(
      material.batches.reduce((sum, batch) => sum + batch.qtyRemaining, 0),
    );
    const qtyNeeded = roundQty(line.qty * qty);
    const shortBy = qtyNeeded - qtyOnHand;

    lines.push({
      materialId: material.id,
      materialName: material.name,
      unit: material.unit,
      qtyNeeded,
      qtyOnHand,
      shortBy: shortBy > QTY_EPSILON ? roundQty(shortBy) : 0,
    });
  }

  const missing = lines.filter((line) => line.shortBy > 0);

  return {
    applicable: true,
    ready: missing.length === 0,
    lines,
    missing,
    summary: missing.length
      ? `Short on ${missing.map((m) => m.materialName).join(", ")}`
      : "All materials in stock",
  };
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

export interface CalendarDay {
  date: DateOnly;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Build a Monday-first 6×7 grid covering `month`, padded with the neighbouring
 * months' days so every row is full.
 */
export function buildMonthGrid(year: number, month: number, today: DateOnly): CalendarDay[] {
  const first = new Date(Date.UTC(year, month, 1));
  // getUTCDay is Sunday-first; shift so Monday is column 0.
  const leading = (first.getUTCDay() + 6) % 7;

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(Date.UTC(year, month, 1 - leading + i));
    const iso = date.toISOString().slice(0, 10);
    days.push({
      date: iso,
      dayOfMonth: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === month,
      isToday: iso === today,
    });
  }
  return days;
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whole days from `today` to `date`; negative when the date has passed. */
export function daysUntil(date: DateOnly, today: DateOnly): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function relativeDayLabel(date: DateOnly, today: DateOnly): string {
  const delta = daysUntil(date, today);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta < 0) return `${Math.abs(delta)} days ago`;
  if (delta < 7) return `In ${delta} days`;
  return date;
}

export function taskProgress(tasks: readonly EventTask[]): { done: number; total: number; pct: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, pct: total ? (done / total) * 100 : 0 };
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface SaveEventInput {
  id?: ID;
  title: string;
  kind: EventKind;
  scheduledFor: DateOnly;
  scheduledTime?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  patternId?: ID | null;
  plannedQty?: number | null;
  /** Only used on create — seeds the checklist. */
  taskTitles?: string[];
}

export interface EventListFilter {
  /** Inclusive ISO date bounds. */
  from?: DateOnly;
  to?: DateOnly;
  status?: EventStatus;
}

/** Convenience shape for the dashboard's "coming up" strip. */
export interface UpcomingEvent {
  event: EventWithTasks;
  pattern: Pattern | null;
  readiness: EventReadiness;
  daysAway: number;
}
