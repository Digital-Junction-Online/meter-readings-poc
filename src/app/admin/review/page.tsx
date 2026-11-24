import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ReviewQueueList, type ReviewItem } from "@/components/ReviewQueueList";
import { trailingAverageUsage } from "@/lib/flagging";
import { BottomNav } from "@/components/BottomNav";
import { AdminPage } from "@/components/AdminPage";
import type { Meter, MeterReading, Property, Unit } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/admin/review");
  if (profile.role !== "admin") redirect("/client");

  const supabase = await createClient();

  const [{ data: propertyRows }, { data: meterRows }, { data: unitRows }] = await Promise.all([
    supabase.from("properties").select("*"),
    supabase.from("meters").select("*").is("retired_at", null),
    supabase.from("units").select("*"),
  ]);

  const propertyById = new Map(((propertyRows ?? []) as Property[]).map((p) => [p.id, p]));
  const meters = (meterRows ?? []) as Meter[];
  const unitById = new Map(((unitRows ?? []) as Unit[]).map((u) => [u.id, u]));
  const meterIds = meters.map((m) => m.id);

  const { data: readingRows } = meterIds.length
    ? await supabase
        .from("meter_readings")
        .select("*")
        .in("meter_id", meterIds)
        .order("captured_at", { ascending: false })
    : { data: [] };

  // Every reading for each meter, newest first. The queue used to keep only
  // the newest one per meter, so a flagged reading vanished from here the
  // moment the next month's round landed — still wrong, still skewing every
  // report, but no longer visible anywhere in the app.
  const readingsByMeter = new Map<string, MeterReading[]>();
  for (const r of (readingRows ?? []) as MeterReading[]) {
    const list = readingsByMeter.get(r.meter_id) ?? [];
    list.push(r);
    readingsByMeter.set(r.meter_id, list);
  }

  const items: ReviewItem[] = [];
  for (const m of meters) {
    const history = readingsByMeter.get(m.id) ?? [];
    const property = propertyById.get(m.property_id);
    const unitNumber = m.unit_id ? (unitById.get(m.unit_id)?.unit_number ?? m.label) : m.label;

    history.forEach((reading, i) => {
      if (reading.flag_status === "ok" || reading.reviewed_at) return;
      const previous = history[i + 1] ?? null;
      // Judge each reading against the history it had at the time, not the
      // meter's whole life, so a later spike doesn't excuse an earlier one.
      const trailingAverage = trailingAverageUsage(history.slice(i + 1).map((r) => r.reading_value));

      items.push({
        readingId: reading.id,
        propertyName: property?.name ?? "—",
        unitNumber,
        service: m.service,
        flagStatus: reading.flag_status,
        readingValue: reading.reading_value,
        previousValue: previous?.reading_value ?? null,
        previousReadingId: previous?.id ?? null,
        usage: previous ? reading.reading_value - previous.reading_value : null,
        trailingAverage,
        capturedAt: reading.captured_at,
        photoUrl: reading.photo_url,
        notes: reading.notes,
      });
    });
  }

  return (
    <AdminPage width="wide">
      <header className="border-b border-border bg-surface px-5 pb-4 pt-[calc(env(safe-area-inset-top)+20px)] lg:mx-4 lg:rounded-2xl lg:border lg:pt-5">
        <h1 className="text-2xl font-extrabold text-navy-900">Review</h1>
        <p className="mt-1 text-sm text-[#5d6c80]">
          {items.length === 0
            ? "Nothing waiting"
            : `${items.length} reading${items.length === 1 ? "" : "s"} need a decision. Each is compared with its own meter's history.`}
        </p>
      </header>

      <ReviewQueueList items={items} />
      <BottomNav />
    </AdminPage>
  );
}
