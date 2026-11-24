import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ReadingEntryForm } from "@/components/ReadingEntryForm";
import type { Meter, MeterReading, Property, Unit } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReadingEntryPage({
  params,
}: {
  params: Promise<{ propertyId: string; meterId: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/capture");
  if (profile.role !== "admin") redirect("/client");

  const { propertyId, meterId } = await params;
  const supabase = await createClient();

  const [{ data: propertyRow }, { data: meterRow }, { data: siblingRows }] = await Promise.all([
    supabase.from("properties").select("*").eq("id", propertyId).single(),
    supabase.from("meters").select("*").eq("id", meterId).eq("property_id", propertyId).single(),
    supabase.from("meters").select("*").eq("property_id", propertyId).is("retired_at", null),
  ]);

  if (!propertyRow || !meterRow) notFound();
  const property = propertyRow as Property;
  const meter = meterRow as Meter;
  if (meter.retired_at) notFound();
  const siblings = ((siblingRows ?? []) as Meter[]).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  const positionIndex = siblings.findIndex((m) => m.id === meter.id);

  const [{ data: unitRow }, { data: history }] = await Promise.all([
    meter.unit_id ? supabase.from("units").select("*").eq("id", meter.unit_id).single() : Promise.resolve({ data: null }),
    supabase
      .from("meter_readings")
      .select("*")
      .eq("meter_id", meterId)
      .order("captured_at", { ascending: false })
      .limit(6),
  ]);

  const unit = unitRow as Unit | null;
  const readings = (history ?? []) as MeterReading[];
  const previous = readings[0] ?? null;

  // Trailing average of usage (delta between consecutive readings), most
  // recent deltas first — the "own meter history" comparison the redesign
  // uses instead of the cross-meter average in flagging.ts.
  const deltas: number[] = [];
  for (let i = 0; i < readings.length - 1; i++) {
    deltas.push(readings[i].reading_value - readings[i + 1].reading_value);
  }
  const positiveDeltas = deltas.filter((d) => d > 0);
  const trailingAverage =
    positiveDeltas.length > 0
      ? positiveDeltas.reduce((sum, d) => sum + d, 0) / positiveDeltas.length
      : null;

  return (
    <ReadingEntryForm
      propertyId={propertyId}
      propertyName={property.name}
      meterId={meter.id}
      unitNumber={unit?.unit_number ?? null}
      service={meter.service}
      locationNote={meter.location_note}
      meterLabel={meter.label}
      meterPosition={positionIndex >= 0 ? positionIndex + 1 : 1}
      meterTotal={siblings.length}
      previousValue={previous?.reading_value ?? null}
      previousCapturedAt={previous?.captured_at ?? null}
      trailingAverage={trailingAverage}
      wholeNumbers={!!meter.whole_numbers}
    />
  );
}
