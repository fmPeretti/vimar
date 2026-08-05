"use server";

import type { EventKind, EventStatus } from "@vimar/core";
import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { repositories } from "@/lib/repos";

function revalidateAll() {
  revalidatePath("/", "layout");
}

export interface EventFormValues {
  id?: string;
  title: string;
  kind: EventKind;
  scheduledFor: string;
  scheduledTime: string;
  durationMinutes: number | null;
  notes: string;
  patternId: string | null;
  plannedQty: number | null;
  /** Only used when creating — seeds the checklist. */
  taskTitles?: string[];
}

export async function saveEventAction(values: EventFormValues): Promise<ActionResult> {
  try {
    if (!values.title.trim()) return { ok: false, error: "Give the event a title." };
    if (!values.scheduledFor) return { ok: false, error: "Pick a date." };

    const saved = await repositories.events.save({
      id: values.id,
      title: values.title,
      kind: values.kind,
      scheduledFor: values.scheduledFor,
      scheduledTime: values.scheduledTime,
      durationMinutes: values.durationMinutes,
      notes: values.notes,
      // Only craft events carry a pattern; anything else would make the
      // readiness check meaningless.
      patternId: values.kind === "craft" ? values.patternId : null,
      plannedQty: values.kind === "craft" ? values.plannedQty : null,
      taskTitles: values.taskTitles,
    });

    revalidateAll();
    return { ok: true, message: `${saved.title} saved.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setEventStatusAction(id: string, status: EventStatus): Promise<ActionResult> {
  try {
    await repositories.events.setStatus(id, status);
    revalidateAll();
    return {
      ok: true,
      message: status === "done" ? "Marked done." : status === "cancelled" ? "Cancelled." : "Reopened.",
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  try {
    await repositories.events.remove(id);
    revalidateAll();
    return { ok: true, message: "Event deleted." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addTaskAction(eventId: string, title: string): Promise<ActionResult> {
  try {
    if (!title.trim()) return { ok: false, error: "Task needs a title." };
    await repositories.events.addTask(eventId, title);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleTaskAction(taskId: string, done: boolean): Promise<ActionResult> {
  try {
    await repositories.events.setTaskDone(taskId, done);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeTaskAction(taskId: string): Promise<ActionResult> {
  try {
    await repositories.events.removeTask(taskId);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
