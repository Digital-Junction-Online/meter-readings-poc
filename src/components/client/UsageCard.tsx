"use client";

import { ArcGauge } from "@/components/charts/ArcGauge";
import { UsageTrendChart } from "@/components/charts/UsageTrendChart";
import { RegisterDigits } from "@/components/client/RegisterDigits";
import { BoltIcon, DropletIcon } from "@/components/icons";
import {
  formatNumber,
  monthLabel,
  monthName,
  monthShort,
  SERVICE_COLOR,
  SERVICE_LABEL,
  SERVICE_UNIT,
  type ServiceSummary,
} from "@/lib/clientReport";

function changeLine(s: ServiceSummary): { text: string; className: string } | null {
  if (!s.latest) return null;
  if (s.inProgress && s.previous) {
    return {
      text: `Month still in progress: ${s.latest.readings} of ${s.previous.readings} readings so far`,
      className: "text-[#5d6c80]",
    };
  }
  if (!s.previous) {
    return s.months.length === 1 ? { text: "This is the first month of readings", className: "text-[#5d6c80]" } : null;
  }
  const prev = monthName(s.previous.key);
  if (s.changePct === null) return null;
  if (s.changePct === 0) return { text: `Same as ${prev}`, className: "text-text-body" };
  if (s.changePct > 0) return { text: `▲ ${s.changePct}% more than ${prev}`, className: "text-amber-700" };
  return { text: `▼ ${Math.abs(s.changePct)}% less than ${prev}`, className: "text-green-700" };
}

function gaugeCopy(ratio: number): string {
  const pct = Math.round((ratio - 1) * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/**
 * Says what has been left out and why. These figures are the ones a client
 * may recover costs against, so a total that is short of something has to
 * say so — a quietly smaller number is indistinguishable from a wrong one.
 */
function SuspectNote({ summary }: { summary: ServiceSummary }) {
  const typos = summary.suspect.filter((s) => s.typo);
  const units = [...new Set(summary.suspect.map((s) => s.unitLabel))];
  const months = [...new Set(summary.suspect.map((s) => s.monthKey))]
    .sort()
    .map((k) => monthName(k));

  return (
    <p className="mt-2 rounded-lg bg-app-bg px-3 py-2 text-[13px] text-[#5d6c80]">
      {typos.length === 1 ? "A reading" : `${typos.length} readings`} on{" "}
      {units.join(", ")} {typos.length === 1 ? "is" : "are"} far beyond what that meter has
      recorded before, so {typos.length === 1 ? "it is" : "they are"} being checked.{" "}
      {months.length === 1 ? months[0] : `${months.slice(0, -1).join(", ")} and ${months.at(-1)}`}{" "}
      {months.length === 1 ? "is" : "are"} left out of these figures until then
      {summary.suspect.length > typos.length &&
        " — a reading that can't be trusted also leaves the month after it unmeasurable"}
      .
    </p>
  );
}

export function UsageCard({ summary }: { summary: ServiceSummary }) {
  const { service, latest, ratio, typical } = summary;
  if (!latest) return null;

  const color = SERVICE_COLOR[service];
  const unit = SERVICE_UNIT[service];
  const Icon = service === "electricity" ? BoltIcon : DropletIcon;
  const line = changeLine(summary);

  const chartData = summary.months.slice(-6).map((m) => ({
    key: m.key,
    label: monthShort(m.key),
    usage: Math.round(m.usage),
  }));

  return (
    <section
      className="flex flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5"
      aria-label={`${SERVICE_LABEL[service]} usage`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-base font-bold" style={{ color }}>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}1a` }}
          >
            <Icon className="h-4 w-4" />
          </span>
          {SERVICE_LABEL[service]} used
        </span>
        <span className="text-[13px] font-semibold text-[#5d6c80]">{monthLabel(latest.key)}</span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-end gap-1.5 sm:gap-3">
          <RegisterDigits value={latest.usage} unit={unit} />
          <span className="pb-1 text-sm font-semibold text-[#5d6c80]">{unit}</span>
        </div>

        {ratio !== null && typical !== null && (
          <ArcGauge
            ratio={ratio}
            centerLabel={gaugeCopy(ratio)}
            caption="vs usual month"
            ariaLabel={`This month is ${gaugeCopy(ratio)} compared with a usual month of about ${formatNumber(Math.round(typical))} ${unit}.`}
          />
        )}
      </div>

      {line && <p className={`mt-3 text-sm font-medium ${line.className}`}>{line.text}</p>}

      {summary.suspect.length > 0 && <SuspectNote summary={summary} />}

      {chartData.length > 1 && (
        <div className="mt-4 border-t border-divider pt-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-navy-900">Last {chartData.length} months</p>
            {typical !== null && (
              <p className="text-[13px] text-[#5d6c80]">
                Usual {formatNumber(Math.round(typical))} {unit}
              </p>
            )}
          </div>
          <UsageTrendChart
            service={service}
            data={chartData.map((d) => ({ month: d.key, label: d.label, usage: d.usage }))}
            height={170}
          />
        </div>
      )}
    </section>
  );
}
