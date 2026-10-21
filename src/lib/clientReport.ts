import type { ReadingRow } from "@/components/ReadingsTable";
import type { Service } from "@/lib/types";
import type { StatusTone } from "@/lib/flagDisplay";

// ---------------------------------------------------------------- dates
// Everything a client sees is in South African time, formatted explicitly.
// The dashboard renders on the server (UTC) and again in the browser (SAST);
// relying on the runtime's local zone would make those two disagree.

const SA_TZ = "Africa/Johannesburg";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: SA_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

function saParts(iso: string) {
  const p: Record<string, string> = {};
  for (const part of partsFormat.formatToParts(new Date(iso))) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "12 Sep 2026" */
export function formatDay(iso: string): string {
  const { day, month, year } = saParts(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "12 Sep 2026, 13:54" */
export function formatDayTime(iso: string): string {
  const { hour, minute } = saParts(iso);
  return `${formatDay(iso)}, ${pad2(hour)}:${pad2(minute)}`;
}

/** "2026-09" */
export function monthKey(iso: string): string {
  const { year, month } = saParts(iso);
  return `${year}-${pad2(month)}`;
}

/** "September 2026" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "September" */
export function monthName(key: string): string {
  return MONTHS_LONG[Number(key.slice(5, 7)) - 1];
}

/** "Sep" */
export function monthShort(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1];
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

/** Today's date in South African time, "2026-09-21". */
export function todaySA(): string {
  const { year, month, day } = saParts(new Date().toISOString());
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// -------------------------------------------------------------- services

export const SERVICE_UNIT: Record<Service, string> = { electricity: "kWh", water: "kL" };
export const SERVICE_LABEL: Record<Service, string> = { electricity: "Electricity", water: "Water" };
export const SERVICE_COLOR: Record<Service, string> = { electricity: "#b45309", water: "#1f6bb8" };

export function isService(value: string): value is Service {
  return value === "electricity" || value === "water";
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** "Unit 101" for numbered units, the meter's own name ("Main Water Meter") otherwise. */
export function unitTitle(unitNumber: string): string {
  return /^\d/.test(unitNumber) ? `Unit ${unitNumber}` : unitNumber;
}

// --------------------------------------------------------------- status

export interface ClientStatus {
  label: string;
  tone: StatusTone;
  /** A full sentence for the detail view; absent for a normal reading. */
  detail?: string;
}

const OPEN_DETAIL = {
  below_prev:
    "This reading is lower than the previous one. We're checking it against the meter photo and will confirm it.",
  above_2x_avg:
    "This reading is higher than usual for this meter. We're checking it against the meter photo and will confirm it.",
  possible_partial: "This reading may not have been captured in full. We're confirming it.",
} as const;

const PAST_LABEL = {
  below_prev: "Lower than previous",
  above_2x_avg: "Higher than usual",
  possible_partial: "Partial entry",
} as const;

/**
 * Plain-language status for a client. `openIssue` is true only for a meter's
 * latest reading that is still flagged and hasn't been checked yet — those are
 * the ones we are actively looking at; older flags are history.
 */
export function clientStatus(
  row: Pick<ReadingRow, "flag_status" | "reviewed">,
  openIssue: boolean
): ClientStatus {
  if (row.flag_status === "ok") return { label: "Normal", tone: "good" };
  if (row.reviewed) {
    return {
      label: "Verified",
      tone: "good",
      detail: "This reading looked unusual when it was captured and has since been checked.",
    };
  }
  if (openIssue) {
    return { label: "Being checked", tone: "watch", detail: OPEN_DETAIL[row.flag_status] };
  }
  return {
    label: PAST_LABEL[row.flag_status],
    tone: "neutral",
    detail: "This reading looked unusual compared with this meter's history.",
  };
}

/** Ids of each meter's latest reading that is still flagged and unchecked. */
export function openIssueIds(rows: ReadingRow[]): Set<string> {
  const newestFirst = [...rows].sort((a, b) => b.captured_at.localeCompare(a.captured_at));
  const seen = new Set<string>();
  const open = new Set<string>();
  for (const r of newestFirst) {
    if (r.kind === "replacement" || seen.has(r.meter_id)) continue;
    seen.add(r.meter_id);
    if (r.flag_status !== "ok" && !r.reviewed) open.add(r.id);
  }
  return open;
}

// -------------------------------------------------------------- summaries

/** Usage this many times a meter's own history is a mistyped digit, not real. */
const SUSPECT_MULTIPLE = 20;

export interface MonthTotal {
  key: string;
  usage: number;
  readings: number;
}

/**
 * Readings so far beyond their own meter's history that they can't be real
 * consumption — the signature of a reading typed with an extra digit. One of
 * these turns a property's month into millions of kL on its own, so every
 * total, average and chart here is computed without them.
 *
 * Each meter is judged against its own median rather than against the whole
 * property: meters are read at wildly different scales, and the median keeps
 * the bad readings from dragging up the yardstick that catches them.
 */
export function suspectReadingIds(rows: ReadingRow[], service?: Service): Set<string> {
  const byMeter = new Map<string, number[]>();
  for (const r of rows) {
    if (r.kind === "replacement") continue;
    if (service && r.service !== service) continue;
    if (r.usage === null || r.usage <= 0) continue;
    const list = byMeter.get(r.meter_id) ?? [];
    list.push(r.usage);
    byMeter.set(r.meter_id, list);
  }

  const ceiling = new Map<string, number>();
  for (const [meterId, usages] of byMeter) {
    // Two readings can't tell a typo from a genuinely heavy month.
    if (usages.length < 3) continue;
    usages.sort((a, b) => a - b);
    const median = usages[Math.floor((usages.length - 1) / 2)];
    if (median > 0) ceiling.set(meterId, median * SUSPECT_MULTIPLE);
  }

  const ids = new Set<string>();
  for (const r of rows) {
    if (r.kind === "replacement" || r.usage === null) continue;
    if (service && r.service !== service) continue;
    const limit = ceiling.get(r.meter_id);
    if (limit !== undefined && r.usage > limit) ids.add(r.id);
  }
  return ids;
}

/**
 * Usage per reading, with the readings a mistyped one makes unmeasurable
 * left out entirely.
 *
 * A mistyped reading ruins TWO months, because usage is the step up from the
 * reading before: its own month, and the next one, which is measured against
 * an inflated previous and comes out negative.
 *
 * It's tempting to recover the next month by measuring it from the last
 * trustworthy reading instead. Don't: that reading spans the gap, so it
 * carries two months of consumption and lands all of it in one month. The
 * total survives, but the client sees a spike that never happened and may go
 * chasing a leak that isn't there.
 *
 * What the true split was is genuinely unknown until someone reads the photo
 * and corrects the number. So neither month is counted, and both are named.
 * Short and admittedly so beats confident and wrong on figures a client may
 * recover costs against.
 */
function resolveUsage(
  rows: ReadingRow[],
  service: Service
): { usageById: Map<string, number>; suspectIds: Set<string>; affectedIds: Set<string> } {
  const suspectIds = suspectReadingIds(rows, service);
  const byMeter = new Map<string, ReadingRow[]>();
  for (const r of rows) {
    if (r.kind === "replacement" || r.service !== service) continue;
    const list = byMeter.get(r.meter_id) ?? [];
    list.push(r);
    byMeter.set(r.meter_id, list);
  }

  const usageById = new Map<string, number>();
  const affectedIds = new Set<string>();
  for (const list of byMeter.values()) {
    list.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    let afterSuspect = false;
    for (const r of list) {
      if (suspectIds.has(r.id)) {
        afterSuspect = true;
        continue;
      }
      if (afterSuspect) {
        // Measured against a reading we don't trust, so it can't be used.
        affectedIds.add(r.id);
        afterSuspect = false;
        continue;
      }
      // A first reading has no usage yet, and a meter that was replaced or
      // rolled over reads lower than before — neither is real consumption.
      if (r.usage !== null && r.usage >= 0) usageById.set(r.id, r.usage);
    }
  }
  return { usageById, suspectIds, affectedIds };
}

export interface ServiceSummary {
  service: Service;
  months: MonthTotal[];
  latest: MonthTotal | null;
  previous: MonthTotal | null;
  /** Whole-number % change vs the previous month; null when it can't be compared fairly. */
  changePct: number | null;
  /** The latest month has far fewer readings than the one before — a round still under way. */
  inProgress: boolean;
  /** Mean usage of the completed months before the latest one — a "usual" month. */
  typical: number | null;
  /** Latest ÷ typical. 1 means a completely ordinary month. */
  ratio: number | null;
  /** Readings left out of everything above, named so the figures are seen to
   *  be short of something rather than quietly wrong. `typo` is the mistyped
   *  reading itself; the rest are months it made unmeasurable. */
  suspect: { id: string; unitLabel: string; monthKey: string; typo: boolean }[];
}

export function buildServiceSummary(rows: ReadingRow[], service: Service): ServiceSummary {
  const { usageById, suspectIds, affectedIds } = resolveUsage(rows, service);
  const suspect: ServiceSummary["suspect"] = [];

  const byMonth = new Map<string, MonthTotal>();
  for (const r of rows) {
    if (r.kind === "replacement" || r.service !== service) continue;
    if (suspectIds.has(r.id) || affectedIds.has(r.id)) {
      suspect.push({
        id: r.id,
        unitLabel: unitTitle(r.unit_number),
        monthKey: monthKey(r.captured_at),
        typo: suspectIds.has(r.id),
      });
      continue;
    }
    const usage = usageById.get(r.id);
    if (usage === undefined) continue;
    const key = monthKey(r.captured_at);
    const entry = byMonth.get(key) ?? { key, usage: 0, readings: 0 };
    entry.usage += usage;
    entry.readings += 1;
    byMonth.set(key, entry);
  }
  const months = [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
  const latest = months.length > 0 ? months[months.length - 1] : null;
  const previous = latest ? (byMonth.get(shiftMonthKey(latest.key, -1)) ?? null) : null;

  // Comparing a half-read month with a fully read one would look like a collapse in usage.
  const inProgress = !!(latest && previous && latest.readings < previous.readings * 0.8);
  const changePct =
    latest && previous && !inProgress && previous.usage > 0
      ? Math.round(((latest.usage - previous.usage) / previous.usage) * 100)
      : null;

  // A usual month, averaged over the six before this one. Comparing against a
  // run of months rather than just last month stops one odd month (a leak, a
  // cold snap) from redefining what "normal" looks like.
  const priorMonths = months.slice(0, -1).slice(-6);
  const typical =
    priorMonths.length > 0 ? priorMonths.reduce((sum, m) => sum + m.usage, 0) / priorMonths.length : null;
  const ratio = latest && typical && typical > 0 && !inProgress ? latest.usage / typical : null;

  return { service, months, latest, previous, changePct, inProgress, typical, ratio, suspect };
}

// --------------------------------------------------------------- filtering

export type PeriodKey = "latest" | "3m" | "6m" | "all";

/** What the list is ordered by, and which way. */
export type SortKey = "unit-asc" | "unit-desc" | "reading-asc" | "reading-desc";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "unit-asc", label: "Unit number (low to high)" },
  { key: "unit-desc", label: "Unit number (high to low)" },
  { key: "reading-asc", label: "Reading (low to high)" },
  { key: "reading-desc", label: "Reading (high to low)" },
];

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "latest", label: "Latest month" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "all", label: "All readings" },
];

/** The most recent month that has a reading, across every service. */
export function latestMonthKey(rows: ReadingRow[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    if (r.kind === "replacement") continue;
    const key = monthKey(r.captured_at);
    if (latest === null || key > latest) latest = key;
  }
  return latest;
}

export function periodLabel(period: PeriodKey, latestKey: string | null): string {
  if (!latestKey || period === "all") return "All readings";
  if (period === "latest") return monthLabel(latestKey);
  const span = period === "3m" ? 2 : 5;
  const start = shiftMonthKey(latestKey, -span);
  return `${monthShort(start)} ${start.slice(0, 4)} to ${monthShort(latestKey)} ${latestKey.slice(0, 4)}`;
}

function periodStart(period: PeriodKey, latestKey: string | null): string | null {
  if (!latestKey) return null;
  if (period === "latest") return latestKey;
  if (period === "3m") return shiftMonthKey(latestKey, -2);
  if (period === "6m") return shiftMonthKey(latestKey, -5);
  return null;
}

function compareUnits(a: string, b: string): number {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

export function filterReadings(
  rows: ReadingRow[],
  opts: {
    query: string;
    service: Service | "all";
    period: PeriodKey;
    sort: SortKey;
    latestKey: string | null;
  }
): ReadingRow[] {
  const query = opts.query.trim().toLowerCase();
  const start = periodStart(opts.period, opts.latestKey);

  const matches = rows.filter((r) => {
    if (r.kind === "replacement") return false;
    if (opts.service !== "all" && r.service !== opts.service) return false;
    if (start && monthKey(r.captured_at) < start) return false;
    if (query && !r.unit_number.toLowerCase().includes(query) && !r.meter_label.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  const descending = opts.sort.endsWith("-desc");
  const byReading = opts.sort.startsWith("reading");

  matches.sort((a, b) => {
    const primary = byReading
      ? a.reading_value - b.reading_value
      : compareUnits(a.unit_number, b.unit_number);
    if (primary !== 0) return descending ? -primary : primary;
    // Same unit (its electricity and water meters, or several months of one
    // meter) stays newest-first, so a tie never looks randomly ordered.
    return b.captured_at.localeCompare(a.captured_at);
  });
  return matches;
}

// --------------------------------------------------- per-unit insight
//
// Everything below works off the rows already on the page, which are one
// property's readings. A "unit" here is a unit of that property — these
// figures never reach across to another client's property.

/** How far off its own usual a unit has to be before it counts as a mover. */
const MOVER_RATIO_UP = 1.4;
const MOVER_RATIO_DOWN = 0.6;
/** A sustained rise this far above usual is worth someone walking the pipes. */
const LEAK_RATIO = 1.5;

export interface UnitInsight {
  unitNumber: string;
  /** "Unit 14", or the meter's own name for communal meters. */
  label: string;
  months: { key: string; usage: number }[];
  /** Usage in the month being reported on; null if this unit wasn't read. */
  latest: number | null;
  /** This unit's own usual month, averaged over up to six months before. */
  typical: number | null;
  /** latest ÷ typical. 1 is an ordinary month for this unit. */
  ratio: number | null;
  /** latest − typical, in kWh or kL — how much of the change this unit is. */
  delta: number | null;
  /** This unit's share of the property's total for the month, 0–1. */
  share: number;
  /** Beyond anything this unit has ever done, so almost certainly a typo.
   *  Left out of the rankings rather than shown as a real number. */
  suspect: boolean;
}

/**
 * Per-unit usage for one service, for the month given. Built from the same
 * rows the dashboard already holds, so it adds no new data — it just stops
 * throwing the per-unit detail away when totalling the property.
 */
export function buildUnitInsights(
  rows: ReadingRow[],
  service: Service,
  latestKey: string
): UnitInsight[] {
  // Exactly the figures the cards above use, so the per-unit breakdown can
  // never disagree with the property total it sits under.
  const { usageById, suspectIds, affectedIds } = resolveUsage(rows, service);

  const byUnit = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.kind === "replacement" || r.service !== service) continue;
    if (suspectIds.has(r.id) || affectedIds.has(r.id)) continue;
    const usage = usageById.get(r.id);
    if (usage === undefined) continue;
    const key = monthKey(r.captured_at);
    if (key > latestKey) continue;
    const months = byUnit.get(r.unit_number) ?? new Map<string, number>();
    months.set(key, (months.get(key) ?? 0) + usage);
    byUnit.set(r.unit_number, months);
  }

  const insights: UnitInsight[] = [];
  for (const [unitNumber, monthMap] of byUnit) {
    const months = [...monthMap.entries()]
      .map(([key, usage]) => ({ key, usage }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const latest = monthMap.get(latestKey) ?? null;

    // The unit's own baseline — its six months before this one. Comparing a
    // unit against itself rather than against the property average is what
    // makes this fair: a four-bedroom unit is meant to use more.
    const prior = months.filter((m) => m.key < latestKey).slice(-6);
    const typical = prior.length > 0 ? prior.reduce((sum, m) => sum + m.usage, 0) / prior.length : null;
    const ratio = latest !== null && typical && typical > 0 ? latest / typical : null;

    insights.push({
      unitNumber,
      label: unitTitle(unitNumber),
      months,
      latest,
      typical,
      ratio,
      delta: latest !== null && typical !== null ? latest - typical : null,
      share: 0,
      suspect: ratio !== null && ratio >= SUSPECT_MULTIPLE,
    });
  }

  // Share is of the believable total, so one mistyped reading can't make every
  // other unit look like it used nothing.
  const total = insights
    .filter((u) => !u.suspect)
    .reduce((sum, u) => sum + (u.latest ?? 0), 0);
  if (total > 0) {
    for (const u of insights) {
      if (!u.suspect && u.latest !== null) u.share = u.latest / total;
    }
  }

  return insights.sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0));
}

/** The heaviest users this month, largest first. */
export function topUsers(insights: UnitInsight[], limit = 6): UnitInsight[] {
  return insights.filter((u) => !u.suspect && u.latest !== null && u.latest > 0).slice(0, limit);
}

/**
 * Units furthest from their own usual, ranked by how much of the property's
 * change they actually account for — on a 50-unit property a 20% jump is
 * normally two or three meters, not everyone.
 */
export function biggestMovers(insights: UnitInsight[], limit = 4): UnitInsight[] {
  return insights
    .filter(
      (u) =>
        !u.suspect &&
        u.ratio !== null &&
        u.delta !== null &&
        (u.ratio >= MOVER_RATIO_UP || u.ratio <= MOVER_RATIO_DOWN)
    )
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    .slice(0, limit);
}

/**
 * Units worth physically checking: usage well above their own usual, and
 * still up the month before, which is what a running toilet or a leaking
 * pipe looks like on monthly readings. A single high month is just a busy
 * month, so it deliberately doesn't qualify.
 */
export function possibleLeaks(insights: UnitInsight[], latestKey: string): UnitInsight[] {
  return insights
    .filter((u) => {
      if (u.suspect || u.ratio === null || u.ratio < LEAK_RATIO || u.typical === null) return false;
      const prevKey = shiftMonthKey(latestKey, -1);
      const prev = u.months.find((m) => m.key === prevKey);
      // Needs the month before to be raised too — one month is not a pattern.
      return !!prev && u.typical > 0 && prev.usage / u.typical >= LEAK_RATIO;
    })
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
}

/** "uses about a fifth of the property's water" — share as plain words. */
export function sharePct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** "2.3× its usual" / "a third of its usual" */
export function ratioPhrase(ratio: number): string {
  if (ratio >= 1) return `${ratio.toFixed(1).replace(/\.0$/, "")}× its usual`;
  return `${Math.round(ratio * 100)}% of its usual`;
}
