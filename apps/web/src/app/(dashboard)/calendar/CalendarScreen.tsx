"use client";

import {
  buildMonthGrid,
  EVENT_KIND_LABELS,
  EVENT_KINDS,
  monthLabel,
  numberFromInput,
  relativeDayLabel,
  TASK_TEMPLATES,
  taskProgress,
  type EventKind,
  type EventReadiness,
  type EventWithTasks,
} from "@vimar/core";
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  Textarea,
  cx,
} from "@vimar/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { saveEventAction } from "@/lib/actions/event-actions";
import { useAction } from "@/lib/use-action";

export interface PlannerItem {
  event: EventWithTasks;
  pattern: { id: string; name: string } | null;
  readiness: EventReadiness;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

export function CalendarScreen({
  year,
  month,
  today,
  items,
  patterns,
}: {
  year: number;
  month: number;
  today: string;
  items: PlannerItem[];
  patterns: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [presetDate, setPresetDate] = useState(today);

  const grid = useMemo(() => buildMonthGrid(year, month, today), [year, month, today]);

  const byDate = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    for (const item of items) {
      const list = map.get(item.event.scheduledFor);
      if (list) list.push(item);
      else map.set(item.event.scheduledFor, [item]);
    }
    return map;
  }, [items]);

  const goMonth = (delta: number) => {
    const target = new Date(Date.UTC(year, month + delta, 1));
    router.push(`/calendar?m=${target.toISOString().slice(0, 7)}`);
  };

  const upcoming = items
    .filter((item) => item.event.status === "planned" && item.event.scheduledFor >= today)
    .slice(0, 8);

  const blocked = upcoming.filter((item) => item.readiness.applicable && !item.readiness.ready);

  return (
    <>
      <PageHeader title="Calendar" note="what's coming up next">
        <Button variant="ghost" size="sm" onClick={() => goMonth(-1)}>
          ← Prev
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push("/calendar")}>
          Today
        </Button>
        <Button variant="ghost" size="sm" onClick={() => goMonth(1)}>
          Next →
        </Button>
        <Button
          variant={creating ? "ghost" : "primary"}
          size="sm"
          onClick={() => setCreating(!creating)}
        >
          {creating ? "Cancel" : "+ New event"}
        </Button>
      </PageHeader>

      {blocked.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <Alert tone="warn" title="Coming up, but you're short on materials">
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {blocked.map((item) => (
                <li key={item.event.id}>
                  <Link href={`/calendar/${item.event.id}`}>{item.event.title}</Link> (
                  {relativeDayLabel(item.event.scheduledFor, today).toLowerCase()}) —{" "}
                  {item.readiness.missing
                    .map((m) => `${m.materialName} short by ${m.shortBy} ${m.unit}`)
                    .join(", ")}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      {creating ? (
        <div style={{ marginBottom: 24 }}>
          <EventForm
            patterns={patterns}
            defaultDate={presetDate}
            onDone={() => setCreating(false)}
          />
        </div>
      ) : null}

      <h2 className="vm-section-title">{monthLabel(year, month)}</h2>

      <div className="vm-cal">
        <div className="vm-cal__head">
          {DOW.map((d) => (
            <div key={d} className="vm-cal__dow">
              {d}
            </div>
          ))}
        </div>
        <div className="vm-cal__grid">
          {grid.map((day) => {
            const dayItems = byDate.get(day.date) ?? [];
            return (
              <div
                key={day.date}
                className={cx(
                  "vm-cal__day",
                  !day.inCurrentMonth && "vm-cal__day--outside",
                  day.isToday && "vm-cal__day--today",
                )}
                onDoubleClick={() => {
                  setPresetDate(day.date);
                  setCreating(true);
                }}
              >
                <div className="vm-cal__daynum">{day.dayOfMonth}</div>
                {dayItems.slice(0, MAX_CHIPS).map((item) => (
                  <Link
                    key={item.event.id}
                    href={`/calendar/${item.event.id}`}
                    className={cx(
                      "vm-cal__chip",
                      `vm-cal__chip--${item.event.kind}`,
                      item.event.status !== "planned" && "vm-cal__chip--done",
                      item.readiness.applicable &&
                        !item.readiness.ready &&
                        item.event.status === "planned" &&
                        "vm-cal__chip--blocked",
                    )}
                    title={
                      item.readiness.applicable && !item.readiness.ready
                        ? item.readiness.summary
                        : item.event.title
                    }
                  >
                    {item.event.scheduledTime ? `${item.event.scheduledTime} ` : ""}
                    {item.event.title}
                  </Link>
                ))}
                {dayItems.length > MAX_CHIPS ? (
                  <span className="vm-cal__more">+{dayItems.length - MAX_CHIPS} more</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="vm-tiny vm-muted" style={{ marginTop: 10 }}>
        Double-click a day to plan something on it. A burgundy outline means that craft needs
        materials you don't have yet.
      </p>

      <h2 className="vm-section-title">Coming up</h2>
      {upcoming.length === 0 ? (
        <Alert tone="info">Nothing planned yet — add an event to get started.</Alert>
      ) : (
        <div className="vm-stack">
          {upcoming.map((item) => {
            const progress = taskProgress(item.event.tasks);
            return (
              <div key={item.event.id} className="vm-event">
                <div className="vm-event__when">
                  <b>{item.event.scheduledFor.slice(8)}</b>
                  <span className="vm-tiny vm-muted">
                    {relativeDayLabel(item.event.scheduledFor, today)}
                  </span>
                </div>
                <div className="vm-event__body">
                  <Link href={`/calendar/${item.event.id}`} className="vm-event__title">
                    {item.event.title}
                  </Link>
                  <div className="vm-small vm-muted">
                    {EVENT_KIND_LABELS[item.event.kind]}
                    {item.pattern ? ` · ${item.pattern.name}` : ""}
                    {item.event.plannedQty ? ` ×${item.event.plannedQty}` : ""}
                    {item.event.scheduledTime ? ` · ${item.event.scheduledTime}` : ""}
                  </div>
                  {progress.total > 0 ? (
                    <div className="vm-small vm-muted" style={{ marginTop: 4 }}>
                      {progress.done} of {progress.total} steps done
                    </div>
                  ) : null}
                </div>
                <div>
                  {item.readiness.applicable ? (
                    <Badge tone={item.readiness.ready ? "cream" : "burgundy"}>
                      {item.readiness.ready ? "Ready" : "Missing materials"}
                    </Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function EventForm({
  patterns,
  defaultDate,
  onDone,
}: {
  patterns: Array<{ id: string; name: string }>;
  defaultDate: string;
  onDone: () => void;
}) {
  const action = useAction();
  const [kind, setKind] = useState<EventKind>("craft");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [patternId, setPatternId] = useState(patterns[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [tasks, setTasks] = useState<string[]>(TASK_TEMPLATES.craft);
  const [newTask, setNewTask] = useState("");

  const changeKind = (next: EventKind) => {
    setKind(next);
    // A fresh checklist for the new kind — still fully editable below.
    setTasks(TASK_TEMPLATES[next]);
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks([...tasks, newTask.trim()]);
    setNewTask("");
  };

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const submit = () => {
    action.run(
      () =>
        saveEventAction({
          title,
          kind,
          scheduledFor: date,
          scheduledTime: time,
          durationMinutes: null,
          notes,
          patternId: patternId || null,
          plannedQty: numberFromInput(qty, 1),
          taskTitles: tasks,
        }),
      onDone,
    );
  };

  return (
    <Panel
      title="Plan something"
      footer={
        <>
          <Button size="sm" onClick={submit} disabled={action.pending}>
            {action.pending ? "Saving…" : "Add to calendar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        </>
      }
    >
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}

      <div className="vm-form-grid">
        <Field label="What is it">
          <Select value={kind} onChange={(e) => changeKind(e.target.value as EventKind)}>
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input
            value={title}
            placeholder={kind === "craft" ? "Make Lumas for the market" : "Watch magic-ring tutorial"}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time" hint="Optional">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      {kind === "craft" ? (
        <>
          <hr className="vm-divider" />
          <div className="vm-form-grid">
            <Field label="Pattern" hint="Lets the app check your materials">
              <Select value={patternId} onChange={(e) => setPatternId(e.target.value)}>
                <option value="">— none —</option>
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="How many">
              <Input
                numeric
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>
          </div>
        </>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label={`Checklist${tasks.length > 0 ? ` (${tasks.length})` : ""}`}>
          {tasks.length === 0 ? (
            <p className="vm-tiny vm-muted" style={{ margin: 0 }}>
              No steps yet — add your own below.
            </p>
          ) : (
            <ul className="vm-tiny" style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {tasks.map((t, i) => (
                <li
                  key={i}
                  className="vm-row"
                  style={{ justifyContent: "space-between", padding: "4px 0" }}
                >
                  <span>{t}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeTask(i)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <div className="vm-row" style={{ marginTop: 8 }}>
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
          <Button variant="ghost" size="sm" onClick={addTask}>
            + Add step
          </Button>
        </div>
      </div>
    </Panel>
  );
}
