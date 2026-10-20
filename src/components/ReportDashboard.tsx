"use client";

import Link from "next/link";
import { UsageTrendChart } from "@/components/charts/UsageTrendChart";
import { StatusArc } from "@/components/charts/StatusArc";
import { BoltIcon, DropletIcon } from "@/components/icons";
import { ADMIN_FLAG_LABEL as FLAG_LABEL } from "@/lib/flagDisplay";
import { formatNumber, monthLabel, monthKey, monthShort, unitTitle } from "@/lib/clientReport";
import type { ReadingRow } from "@/components/ReadingsTable";
import type { FlagStatus, Service } from "@/lib/types";

const FLAG_COLOR: Record<FlagStatus, string> = {
  ok: "#22c55e",
  below_prev: "#ef4444",
  above_2x_avg: "#f97316",
  possible_partial: "#2fb6de",
};

const SERVICE_META: Record<
  Service,
  { label: string; color: string; softBg: string; unit: string; Icon: typeof BoltIcon }
> = {
  electricity: { label: "Electricity", color: "#9a6712", softBg: "bg-amber-50", unit: "kWh", Icon: BoltIcon },
  water: { label: "Water", color: "#1f6bb8", softBg: "bg-blue-50", unit: "kL", Icon: DropletIcon },
};

/**
 * Readings whose usage is wildly out of line with the median for this
 * service — the signature of a reading typed with an extra digit, which
 * inflates a whole month's total on its own. Compared against the median
 * rather than the mean so the outliers don't drag the yardstick up with them.
 */
function implausibleReadings(rows: ReadingRow[]): ReadingRow[] {
  const usages = rows
    .map((r) => r.usage)
    .filter((u): u is number => u !== null && u > 0)
    .sort((a, b) => a - b);
  if (usages.length < 6) return [];
  const median = usages[Math.floor(usages.length / 2)];
  if (median <= 0) return [];
  return rows
    .filter((r) => r.usage !== null && r.usage > median * 50)
    .sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0));
}

/**
 * Works out why the latest month moved, rather than leaving the reader to
 * eyeball two bars. Names the units that actually drove it, since on a
 * 50-unit property a 20% jump is usually two or three meters, not everyone.
 */
function explainTrend(
  rows: ReadingRow[],
  trend: { month: string; usage: number }[],
  unit: string
): { headline: string; detail: string | null } | null {
  if (trend.length < 2) return null;
  const latest = trend[trend.length - 1];
  const previous = trend[trend.length - 2];

  const perUnit = new Map<string, { latest: number; previous: number }>();
  let latestCount = 0;
  let previousCount = 0;
  for (const r of rows) {
    if (r.usage === null || r.usage < 0) continue;
    const key = monthKey(r.captured_at);
    if (key !== latest.month && key !== previous.month) continue;
    const entry = perUnit.get(r.unit_number) ?? { latest: 0, previous: 0 };
    if (key === latest.month) {
      entry.latest += r.usage;
      latestCount++;
    } else {
      entry.previous += r.usage;
      previousCount++;
    }
    perUnit.set(r.unit_number, entry);
  }

  const delta = latest.usage - previous.usage;
  const pct = previous.usage > 0 ? Math.round((delta / previous.usage) * 100) : null;
  const prevName = monthLabel(previous.month).split(" ")[0];
  const direction = delta >= 0 ? "more" : "less";

  // A half-captured round looks like a collapse in usage, so say that instead.
  if (latestCount < previousCount * 0.8) {
    return {
      headline: `${latestCount} of ${previousCount} meters read so far this month, so the last bar is still filling up.`,
      detail: null,
    };
  }

  const movers = [...perUnit.entries()]
    .map(([name, v]) => ({ name, change: v.latest - v.previous }))
    .filter((m) => Math.abs(m.change) > 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3);

  const headline =
    pct === null
      ? `${formatNumber(Math.abs(Math.round(delta)))} ${unit} ${direction} than ${prevName}.`
      : `${Math.abs(pct)}% ${direction} than ${prevName} (${formatNumber(Math.abs(Math.round(delta)))} ${unit}).`;

  const detail =
    movers.length > 0
      ? `Mostly ${movers
          .map((m) => `${unitTitle(m.name)} ${m.change >= 0 ? "+" : "−"}${formatNumber(Math.abs(Math.round(m.change)))}`)
          .join(", ")}.`
      : null;

  return { headline, detail };
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-4">
      <p className="mb-2 text-[15px] font-bold text-navy-900">{title}</p>
      {/* Grid rows stretch to the tallest panel, so centre the contents rather
          than leaving the shorter one top-heavy with dead space beneath. */}
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

function UtilityDashboard({ service, rows }: { service: Service; rows: ReadingRow[] }) {
  const meta = SERVICE_META[service];
  const Icon = meta.Icon;

  const flagCounts: Record<FlagStatus, number> = { ok: 0, below_prev: 0, above_2x_avg: 0, possible_partial: 0 };
  for (const r of rows) flagCounts[r.flag_status]++;

  const pieData = (Object.keys(flagCounts) as FlagStatus[])
    .filter((status) => flagCounts[status] > 0)
    .map((status) => ({ name: FLAG_LABEL[status], value: flagCounts[status], status }));

  const monthlyUsage = new Map<string, { month: string; label: string; usage: number }>();
  for (const r of rows) {
    if (r.usage === null || r.usage < 0) continue;
    const month = monthKey(r.captured_at);
    const entry = monthlyUsage.get(month) ?? { month, label: monthShort(month), usage: 0 };
    entry.usage += r.usage;
    monthlyUsage.set(month, entry);
  }
  const trendData = [...monthlyUsage.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((d) => ({ ...d, usage: Math.round(d.usage) }));

  if (rows.length === 0) return null;

  const flagged = rows.length - flagCounts.ok;
  const okPct = rows.length > 0 ? Math.round((flagCounts.ok / rows.length) * 100) : 0;
  const suspect = implausibleReadings(rows);
  const trendExplanation = explainTrend(rows, trendData, meta.unit);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.softBg}`}
          style={{ color: meta.color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-base font-bold" style={{ color: meta.color }}>
          {meta.label}
        </p>
        <span className="text-[13px] text-[#5d6c80]">
          {rows.length} reading{rows.length === 1 ? "" : "s"}
          {flagged > 0 && ` · ${flagged} flagged`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel title="Reading status breakdown">
          <div className="flex items-center gap-3">
            <StatusArc
              segments={pieData.map((entry) => ({
                key: entry.status,
                label: entry.name,
                value: entry.value,
                color: FLAG_COLOR[entry.status],
              }))}
              centerValue={`${okPct}%`}
              centerLabel="OK"
              ariaLabel={`${okPct}% of ${meta.label.toLowerCase()} readings are OK. ${pieData
                .map((e) => `${e.name}: ${e.value}`)
                .join(". ")}.`}
            />

            <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
              {pieData.map((entry) => (
                <li key={entry.status} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: FLAG_COLOR[entry.status] }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-text-body">{entry.name}</span>
                  <span className="font-mono font-bold tabular-nums text-navy-900">{entry.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 border-t border-divider pt-3 text-[13px] leading-relaxed text-text-body">
            {okPct}% of {meta.label.toLowerCase()} readings looked normal against the meter&apos;s own history.
            A flag isn&apos;t proof of a wrong reading — it just means the number was worth a second look
            before it reaches a client.
          </p>
        </Panel>

        <div className="flex flex-col gap-2 rounded-2xl bg-navy-900 p-4 text-white sm:col-span-2 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[15px] font-bold">{meta.label} per month</p>
            <span className="text-xs font-semibold text-white/60">{meta.unit}</span>
          </div>
          <UsageTrendChart
            service={service}
            data={trendData.slice(-12)}
            variant="dark"
            height={200}
            showAxis
          />
          {trendExplanation ? (
            <div className="mt-1 rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-[13px] leading-relaxed">
              <p className="font-bold">{trendExplanation.headline}</p>
              {trendExplanation.detail && <p className="mt-0.5 text-white/70">{trendExplanation.detail}</p>}
              <p className="mt-1.5 text-white/55">
                The dashed line is the average month across the period shown. Bars above it used more than
                usual, below it less.
              </p>
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-white/55">
              Each bar is total {meta.label.toLowerCase()} used across every meter that month. A second month
              of readings will let this compare.
            </p>
          )}
          {suspect.length > 0 && (
            <div className="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-900">
              <p>
                <b className="font-bold">
                  {suspect.length} reading{suspect.length === 1 ? "" : "s"} look
                  {suspect.length === 1 ? "s" : ""} mistyped
                </b>{" "}
                — far larger than this property&apos;s usual usage, which is what inflates the months above.
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {suspect.slice(0, 3).map((r) => (
                  <li key={r.id} className="font-mono tabular-nums">
                    Unit {r.unit_number} · {monthLabel(monthKey(r.captured_at))} ·{" "}
                    {Number(r.usage).toLocaleString("en-US")} {meta.unit}
                  </li>
                ))}
                {suspect.length > 3 && <li>+{suspect.length - 3} more</li>}
              </ul>
              <Link href="/admin/review" className="mt-1 inline-block font-semibold underline">
                Correct them in the review queue
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReportDashboard({ rows }: { rows: ReadingRow[] }) {
  // Replacement marker rows aren't real readings — exclude them from every
  // summary/aggregate here (see report.ts's ReadingRow.kind).
  const readingRows = rows.filter((r) => r.kind !== "replacement");
  if (readingRows.length === 0) return null;

  return (
    <div className="no-print flex flex-col gap-6">
      <UtilityDashboard service="electricity" rows={readingRows.filter((r) => r.service === "electricity")} />
      <UtilityDashboard service="water" rows={readingRows.filter((r) => r.service === "water")} />
    </div>
  );
}
