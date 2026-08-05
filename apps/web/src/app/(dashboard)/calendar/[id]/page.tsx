import { todayISO } from "@vimar/core";
import { notFound } from "next/navigation";
import { getEventDetail } from "@/lib/queries";
import { EventFocusScreen } from "./EventFocusScreen";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getEventDetail(id);
  if (!detail) notFound();

  return (
    <EventFocusScreen
      event={detail.event}
      pattern={detail.pattern ? { id: detail.pattern.id, name: detail.pattern.name } : null}
      readiness={detail.readiness}
      today={todayISO()}
    />
  );
}
