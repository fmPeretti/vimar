"use client";

import {
  EVENT_KIND_LABELS,
  formatQty,
  relativeDayLabel,
  taskProgress,
  type EventReadiness,
  type EventWithTasks,
} from "@vimar/core";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Input,
  PageHeader,
  Panel,
  StockMeter,
  TableWrap,
} from "@vimar/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addTaskAction,
  deleteEventAction,
  removeTaskAction,
  setEventStatusAction,
  toggleTaskAction,
} from "@/lib/actions/event-actions";
import { useAction } from "@/lib/use-action";

export function EventFocusScreen({
  event,
  pattern,
  readiness,
  today,
}: {
  event: EventWithTasks;
  pattern: { id: string; name: string } | null;
  readiness: EventReadiness;
  today: string;
}) {
  const router = useRouter();
  const action = useAction();
  const [newTask, setNewTask] = useState("");

  const progress = taskProgress(event.tasks);
  const isDone = event.status === "done";

  const addTask = () => {
    if (!newTask.trim()) return;
    action.run(() => addTaskAction(event.id, newTask), () => setNewTask(""));
  };

  return (
    <>
      <PageHeader
        title={event.title}
        note={`${EVENT_KIND_LABELS[event.kind]} · ${relativeDayLabel(event.scheduledFor, today)}`}
      >
        <Link href="/calendar" className="vm-btn vm-btn--ghost vm-btn--sm">
          ← Calendar
        </Link>
        {isDone ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={action.pending}
            onClick={() => action.run(() => setEventStatusAction(event.id, "planned"))}
          >
            Reopen
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={action.pending}
            onClick={() => action.run(() => setEventStatusAction(event.id, "done"))}
          >
            Mark done
          </Button>
        )}
      </PageHeader>

      {action.error ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="error">{action.error}</Alert>
        </div>
      ) : null}

      <div className="vm-row" style={{ marginBottom: 20 }}>
        <Badge tone={isDone ? "cream" : event.status === "cancelled" ? "burgundy" : "pink"}>
          {event.status}
        </Badge>
        <span className="vm-small vm-muted">
          {event.scheduledFor}
          {event.scheduledTime ? ` at ${event.scheduledTime}` : ""}
          {pattern ? ` · ${pattern.name}` : ""}
          {event.plannedQty ? ` ×${formatQty(event.plannedQty)}` : ""}
        </span>
      </div>

      {event.notes ? (
        <div style={{ marginBottom: 20 }}>
          <Alert tone="info">{event.notes}</Alert>
        </div>
      ) : null}

      {readiness.applicable ? (
        <div style={{ marginBottom: 24 }}>
          <Panel
            title={readiness.ready ? "Materials — all in stock" : "Materials — you're short"}
            tone={readiness.ready ? undefined : "sticker"}
            footer={
              pattern ? (
                <>
                  <Link
                    href={`/craft?pattern=${pattern.id}&qty=${event.plannedQty ?? 1}&event=${event.id}`}
                    className="vm-btn vm-btn--primary vm-btn--sm"
                  >
                    Complete this craft
                  </Link>
                  {readiness.ready ? null : (
                    <Link href="/materials" className="vm-btn vm-btn--ghost vm-btn--sm">
                      Record a purchase
                    </Link>
                  )}
                </>
              ) : null
            }
          >
            {readiness.ready ? null : (
              <div style={{ marginBottom: 16 }}>
                <Alert tone="warn" title="Restock before this one">
                  {readiness.missing
                    .map((m) => `${m.materialName}: short by ${formatQty(m.shortBy, m.unit)}`)
                    .join(" · ")}
                </Alert>
              </div>
            )}

            <TableWrap>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Needed</th>
                  <th>On hand</th>
                  <th>Coverage</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {readiness.lines.map((line) => (
                  <tr key={line.materialId}>
                    <td className="vm-strong">{line.materialName}</td>
                    <td className="vm-num">{formatQty(line.qtyNeeded, line.unit)}</td>
                    <td className="vm-num">{formatQty(line.qtyOnHand, line.unit)}</td>
                    <td style={{ minWidth: 120 }}>
                      <StockMeter value={line.qtyOnHand} max={line.qtyNeeded} />
                    </td>
                    <td>
                      {line.shortBy > 0 ? (
                        <Badge tone="burgundy">short {formatQty(line.shortBy, line.unit)}</Badge>
                      ) : (
                        <Badge tone="cream">ok</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Panel>
        </div>
      ) : null}

      <Panel
        title={
          progress.total > 0
            ? `Checklist — ${progress.done} of ${progress.total} done`
            : "Checklist"
        }
      >
        {progress.total > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <StockMeter value={progress.done} max={progress.total} />
          </div>
        ) : null}

        {event.tasks.length === 0 ? (
          <EmptyState title="no steps yet">
            <p className="vm-small">Break the job down — tick each step off as you go.</p>
          </EmptyState>
        ) : (
          <div className="vm-checklist">
            {event.tasks.map((task) => (
              <div key={task.id} className="vm-checklist__item">
                <Checkbox
                  checked={task.done}
                  disabled={action.pending}
                  label={task.title}
                  onChange={(next) => action.run(() => toggleTaskAction(task.id, next))}
                />
                <Button
                  variant="danger"
                  size="sm"
                  disabled={action.pending}
                  onClick={() => action.run(() => removeTaskAction(task.id))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="vm-row" style={{ marginTop: 16 }}>
          <Input
            value={newTask}
            placeholder="Add a step…"
            style={{ maxWidth: 320 }}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTask();
              }
            }}
          />
          <Button variant="ghost" size="sm" onClick={addTask} disabled={action.pending}>
            + Add step
          </Button>
        </div>
      </Panel>

      <div className="vm-row" style={{ marginTop: 24 }}>
        <Button
          variant="ghost"
          size="sm"
          disabled={action.pending}
          onClick={() => action.run(() => setEventStatusAction(event.id, "cancelled"))}
        >
          Cancel event
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={action.pending}
          onClick={() =>
            action.run(
              () => deleteEventAction(event.id),
              () => router.push("/calendar"),
            )
          }
        >
          Delete
        </Button>
      </div>
    </>
  );
}
