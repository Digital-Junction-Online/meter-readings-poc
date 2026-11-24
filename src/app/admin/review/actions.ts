"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { computeFlagStatusForReading } from "@/lib/computeReadingFlag";
import { hasDecimalOnWholeMeter, WHOLE_NUMBER_MESSAGE } from "@/lib/flagging";
import type { Meter, MeterReading } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Re-judges the reading that comes straight after `after` on the same meter.
 * Its usage is measured against `after`, so correcting `after` can turn a
 * false "much higher than usual" or "lower than last month" into an ordinary
 * month (or the reverse). Its reviewed state is left alone: a human has not
 * looked at it just because its neighbour changed.
 */
async function reflagNextReading(supabase: Supabase, meter: Meter, after: MeterReading) {
  const { data, error } = await supabase
    .from("meter_readings")
    .select("*")
    .eq("meter_id", meter.id)
    .gt("captured_at", after.captured_at)
    .order("captured_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const next = (data?.[0] ?? null) as MeterReading | null;
  if (!next) return;

  const flag_status = await computeFlagStatusForReading({
    meter,
    rawValue: String(next.reading_value),
    value: next.reading_value,
    cutoff: next.captured_at,
    excludeReadingId: next.id,
  });
  if (flag_status === next.flag_status) return;

  const { error: updateError } = await supabase
    .from("meter_readings")
    .update({ flag_status })
    .eq("id", next.id);
  if (updateError) throw new Error(updateError.message);
}

/**
 * Corrects a reading in place — the reading value, notes, and optionally the
 * photo — instead of deleting it and waiting on a return site visit. Most
 * flags turn out to be a misread or a typo the photo already proves; this
 * lets the admin fix it from the photo directly. Always marks the reading
 * reviewed, same as Accept, since fixing it IS the review.
 *
 * `previous` corrects the meter's reading before this one in the same save.
 * A month's usage is this reading minus the last one, so a bad LAST reading
 * (a meter with no decimal point read as if it had one: 6870.5 for 68705)
 * makes this month look wrong even when this month's number is right. The
 * screen shows This / Last / Used, so that is what can be fixed from it.
 */
export async function editReading(params: {
  readingId: string;
  rawValue: string;
  notes: string | null;
  /** Only present when the photo was retaken; omitted keeps the original. */
  photoUrl?: string;
  previous?: { readingId: string; rawValue: string };
}) {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { data: readingRow, error: readingError } = await supabase
    .from("meter_readings")
    .select("*")
    .eq("id", params.readingId)
    .single();
  if (readingError || !readingRow) throw new Error("Reading not found");
  const reading = readingRow as MeterReading;

  const { data: meterRow, error: meterError } = await supabase
    .from("meters")
    .select("*")
    .eq("id", reading.meter_id)
    .single();
  if (meterError || !meterRow) throw new Error("Meter not found");
  const meter = meterRow as Meter;

  const value = Number.parseFloat(params.rawValue);
  if (Number.isNaN(value)) throw new Error("Reading value is not numeric");
  // Only a value being typed in is held to the no-decimal rule. An old value
  // left as it is must not block saving a note or a photo on that reading.
  if (value !== reading.reading_value && hasDecimalOnWholeMeter(params.rawValue, meter.whole_numbers)) {
    throw new Error(WHOLE_NUMBER_MESSAGE);
  }

  if (params.previous) {
    const previousValue = Number.parseFloat(params.previous.rawValue);
    if (Number.isNaN(previousValue)) throw new Error("Last reading is not numeric");

    // Only the reading directly before this one, on the same meter, may be
    // corrected from here; anything else is not the "last reading" on screen.
    const { data: beforeRows, error: beforeError } = await supabase
      .from("meter_readings")
      .select("*")
      .eq("meter_id", reading.meter_id)
      .lt("captured_at", reading.captured_at)
      .order("captured_at", { ascending: false })
      .limit(1);
    if (beforeError) throw new Error(beforeError.message);
    const before = (beforeRows?.[0] ?? null) as MeterReading | null;
    if (!before || before.id !== params.previous.readingId) {
      throw new Error("The last reading has changed since this page loaded. Refresh and try again.");
    }

    if (previousValue !== before.reading_value) {
      if (hasDecimalOnWholeMeter(params.previous.rawValue, meter.whole_numbers)) {
        throw new Error(`Last reading: ${WHOLE_NUMBER_MESSAGE}`);
      }
      const previousFlag = await computeFlagStatusForReading({
        meter,
        rawValue: params.previous.rawValue,
        value: previousValue,
        cutoff: before.captured_at,
        excludeReadingId: before.id,
      });
      const { error: previousError } = await supabase
        .from("meter_readings")
        .update({
          reading_value: previousValue,
          flag_status: previousFlag,
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile.id,
        })
        .eq("id", before.id);
      if (previousError) throw new Error(previousError.message);
    }
  }

  const flag_status = await computeFlagStatusForReading({
    meter,
    rawValue: params.rawValue,
    value,
    cutoff: reading.captured_at,
    excludeReadingId: reading.id,
  });

  const { error } = await supabase
    .from("meter_readings")
    .update({
      reading_value: value,
      notes: params.notes,
      ...(params.photoUrl ? { photo_url: params.photoUrl } : {}),
      flag_status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
    })
    .eq("id", params.readingId);
  if (error) throw new Error(error.message);

  await reflagNextReading(supabase, meter, { ...reading, reading_value: value });

  revalidatePath("/admin/review");
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/client");
}

export async function acceptReading(readingId: string) {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("meter_readings")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: profile.id })
    .eq("id", readingId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/review");
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
}
