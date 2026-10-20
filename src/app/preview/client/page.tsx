import { ClientDashboard } from "@/components/client/ClientDashboard";
import type { ReadingRow } from "@/components/ReadingsTable";
import type { FlagStatus } from "@/lib/types";

/**
 * Fixture-data-only stand-in for /client — renders the very same
 * ClientDashboard the real page uses, so the design can be reviewed in a
 * browser without a Supabase login. Not linked from any nav.
 * Safe to delete once the real page has been checked against real data.
 */

const MOCK_PROPERTIES = [
  { id: "p1", name: "Ocean View Apartments" },
  { id: "p2", name: "Harbor Heights" },
];

const MONTHS = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
const PHOTO = "/icons/icon-512.png";

interface MockMeter {
  id: string;
  label: string;
  unit: string;
  service: "electricity" | "water";
  start: number;
  base: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

function buildMockRows(propertyId: string): ReadingRow[] {
  const units = propertyId === "p1" ? ["101", "102", "103", "104", "105", "106", "107", "108"] : ["1", "2", "3", "4"];

  const meters: MockMeter[] = [];
  units.forEach((unit, i) => {
    meters.push({ id: `${propertyId}-e-${unit}`, label: `${unit} - Electricity`, unit, service: "electricity", start: 1200 + i * 310, base: 120 + i * 14 });
    meters.push({ id: `${propertyId}-w-${unit}`, label: `${unit} - Water`, unit, service: "water", start: 40 + i * 9, base: 6 + (i % 4) * 2 });
  });
  meters.push({ id: `${propertyId}-w-main`, label: "Main Water Meter", unit: "Main Water Meter", service: "water", start: 500, base: 55 });

  const rows: ReadingRow[] = [];

  meters.forEach((m, mi) => {
    let value = m.start;
    MONTHS.forEach((month, monthIdx) => {
      // The August water round is still in progress: the last two units aren't read yet.
      if (m.service === "water" && month === "2026-08" && (m.unit === "107" || m.unit === "108")) return;

      const minutes = mi * 3;
      const capturedAt = `${month}-02T${pad(8 + Math.floor(minutes / 60))}:${pad(minutes % 60)}:00Z`;
      const previous = monthIdx === 0 ? null : value;

      const winterBoost = m.service === "electricity" && (month === "2026-06" || month === "2026-07") ? 35 : 0;
      let usage = m.base + ((mi * 7 + monthIdx * 11) % 23) + winterBoost;
      let flag: FlagStatus = "ok";
      let reviewed = false;

      if (propertyId === "p1") {
        if (m.id === "p1-e-103" && month === "2026-08") {
          usage = Math.round(usage * 3.6);
          flag = "above_2x_avg";
        }
        if (m.id === "p1-w-105" && month === "2026-06") {
          usage = -4;
          flag = "below_prev";
          reviewed = true;
        }
        if (m.id === "p1-e-102" && month === "2026-07") flag = "possible_partial";
        if (m.id === "p1-w-106" && month === "2026-08") flag = "possible_partial";
      }

      value = previous === null ? m.start : value + usage;

      rows.push({
        id: `${m.id}-${month}`,
        captured_at: capturedAt,
        meter_id: m.id,
        meter_label: m.label,
        unit_number: m.unit,
        service: m.service,
        reading_value: value,
        previous_value: previous,
        usage: previous === null ? null : usage,
        flag_status: flag,
        reviewed,
        photo_url: flag !== "ok" || (mi + monthIdx) % 5 === 0 ? PHOTO : null,
        notes: flag !== "ok" ? "Internal note from the meter reader (clients never see this)." : null,
      });
    });
  });

  if (propertyId === "p1") {
    rows.push({
      id: "replacement-104-e",
      kind: "replacement",
      captured_at: "2026-06-02T09:30:00Z",
      meter_id: "p1-e-104",
      meter_label: "104 - Electricity",
      unit_number: "104",
      service: "electricity",
      reading_value: 0,
      previous_value: 9450,
      usage: null,
      flag_status: "ok",
      photo_url: null,
      notes: null,
      replacementDetail: { oldSerial: "E-88213", newSerial: "E-90417", closingValue: 9450, openingValue: 0 },
    });
  }

  return rows.sort((a, b) => b.captured_at.localeCompare(a.captured_at));
}

export default async function ClientPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const { property } = await searchParams;
  const active = MOCK_PROPERTIES.find((p) => p.id === property) ?? MOCK_PROPERTIES[0];

  return (
    <>
      <div className="bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-800">
        Preview mode — fixture data, no login required. Not linked from the app; safe to remove later.
      </div>
      <ClientDashboard
        key={active.id}
        propertyName={active.name}
        properties={MOCK_PROPERTIES}
        activePropertyId={active.id}
        basePath="/preview/client"
        greetingName="Sarah Naidoo"
        rows={buildMockRows(active.id)}
        // Insights switched on here so the paid view can be reviewed; requests
        // are disabled because there's no real client row behind this page.
        featureStatuses={{ usage_insights: "active", email_reports: "requested" }}
      />
    </>
  );
}
