import { todayISO } from "@vimar/core";
import { getPlannerData } from "@/lib/queries";
import { CalendarScreen } from "./CalendarScreen";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const today = todayISO();
  const params = await searchParams;

  // `m` is `YYYY-MM`; anything unparseable falls back to the current month.
  const parsed = /^(\d{4})-(\d{2})$/.exec(params.m ?? "");
  const year = parsed ? Number(parsed[1]) : Number(today.slice(0, 4));
  const month = parsed ? Number(parsed[2]) - 1 : Number(today.slice(5, 7)) - 1;

  // Pull a generous window so the grid's leading/trailing days show their events.
  const from = new Date(Date.UTC(year, month, -7)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month + 1, 14)).toISOString().slice(0, 10);

  const { events, patterns } = await getPlannerData(from, to);

  return (
    <CalendarScreen
      year={year}
      month={month}
      today={today}
      items={events}
      patterns={patterns.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
