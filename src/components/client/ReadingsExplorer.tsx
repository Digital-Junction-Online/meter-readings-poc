"use client";

import { useMemo, useState } from "react";
import type { ReadingRow } from "@/components/ReadingsTable";
import { ReadingDetailModal } from "@/components/ReadingDetailModal";
import { BoltIcon, DownloadIcon, DropletIcon, SearchIcon, XIcon } from "@/components/icons";
import { TONE_CLASS } from "@/lib/flagDisplay";
import { downloadReadingsPdf } from "@/lib/readingsPdf";
import {
  clientStatus,
  filterReadings,
  formatDay,
  formatNumber,
  isService,
  latestMonthKey,
  PERIOD_OPTIONS,
  periodLabel,
  SERVICE_COLOR,
  SERVICE_LABEL,
  SERVICE_UNIT,
  unitTitle,
  type PeriodKey,
  SORT_OPTIONS,
  type SortKey,
} from "@/lib/clientReport";
import type { Service } from "@/lib/types";

const PAGE_SIZE = 25;

const controlClass =
  "rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-navy-900 outline-none transition-colors focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

export function ReadingsExplorer({
  propertyName,
  clientName,
  rows,
  openIds,
  canSeeHistory = true,
  onAskForHistory,
}: {
  propertyName: string;
  /** Who the downloaded report is prepared for; the property name if unknown. */
  clientName?: string | null;
  rows: ReadingRow[];
  openIds: Set<string>;
  /** False locks the period picker to the latest month (past-readings add-on). */
  canSeeHistory?: boolean;
  onAskForHistory?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [service, setService] = useState<Service | "all">("all");
  const [period, setPeriod] = useState<PeriodKey>("latest");
  const effectivePeriod: PeriodKey = canSeeHistory ? period : "latest";
  const [sort, setSort] = useState<SortKey>("unit-asc");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // The list stays hidden until the client asks for something — a full
  // property's readings is a long scroll that buries what they came for.
  const [showList, setShowList] = useState(false);

  const latestKey = useMemo(() => latestMonthKey(rows), [rows]);
  const results = useMemo(
    // Pinned server-side-of-the-UI rather than trusting the select: without
    // the add-on the only period that can be in effect is the latest month.
    () => filterReadings(rows, { query, service, period: effectivePeriod, sort, latestKey }),
    [rows, query, service, effectivePeriod, sort, latestKey]
  );

  const openRow = openId ? (results.find((r) => r.id === openId) ?? rows.find((r) => r.id === openId) ?? null) : null;
  const period_ = periodLabel(effectivePeriod, latestKey);
  const hasFilters = query.trim() !== "" || service !== "all";

  function change(update: () => void) {
    update();
    setVisible(PAGE_SIZE);
    setShowList(true);
  }

  async function handleDownload() {
    setPdfError(null);
    setPreparing(true);
    try {
      const filterParts: string[] = [];
      if (query.trim()) filterParts.push(`Unit "${query.trim()}"`);
      if (service !== "all") filterParts.push(SERVICE_LABEL[service]);
      await downloadReadingsPdf({
        preparedFor: clientName || propertyName,
        scopeLabel: propertyName,
        periodText: period_,
        filterText: filterParts.length > 0 ? filterParts.join(" · ") : null,
        sections: [{ propertyName, rows: results, chartRows: rows, openIssueIds: openIds }],
      });
    } catch {
      setPdfError("We couldn't create the report. Please try again.");
    } finally {
      setPreparing(false);
    }
  }

  if (!latestKey) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-white px-4 py-12 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-divider text-[#5d6c80]">
          <SearchIcon className="h-5 w-5" />
        </div>
        <p className="text-sm font-semibold text-text-body">No readings yet</p>
        <p className="max-w-sm text-sm text-[#5d6c80]">
          Your readings will appear here after the next meter round.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Meter readings">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy-900">Meter readings</h2>
          <p className="text-sm text-[#5d6c80]" aria-live="polite">
            {formatNumber(results.length)} reading{results.length === 1 ? "" : "s"} · {period_}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={preparing || results.length === 0}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-navy-700 px-5 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-navy-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <DownloadIcon className="h-4 w-4" />
          {preparing ? "Preparing report…" : "Download report"}
        </button>
      </div>
      {pdfError && <p className="text-sm text-red-700">{pdfError}</p>}

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Find a unit</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#5d6c80]" />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => change(() => setQuery(e.target.value))}
            placeholder="Find a unit, e.g. 101"
            className={`${controlClass} w-full pl-9`}
          />
        </label>

        <div className="flex rounded-xl border border-border bg-app-bg p-0.5" role="group" aria-label="Service">
          {(["all", "electricity", "water"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={service === s}
              onClick={() => change(() => setService(s))}
              className={`min-h-10 flex-1 rounded-[10px] px-3 text-sm font-semibold transition-colors sm:flex-none ${
                service === s ? "bg-white text-navy-900" : "text-[#5d6c80] hover:text-navy-900"
              }`}
            >
              {s === "all" ? "All" : SERVICE_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <label className="flex-1 sm:flex-none">
            <span className="sr-only">Period</span>
            <select
              value={period}
              onChange={(e) => change(() => setPeriod(e.target.value as PeriodKey))}
              disabled={!canSeeHistory}
              title={canSeeHistory ? undefined : "Past readings is an add-on"}
              className={`${controlClass} w-full disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} disabled={!canSeeHistory && o.key !== "latest"}>
                  {o.label}
                  {!canSeeHistory && o.key !== "latest" ? " — add-on" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 sm:flex-none">
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => change(() => setSort(e.target.value as SortKey))}
              className={`${controlClass} w-full`}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!canSeeHistory && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <p className="min-w-0 text-sm text-text-body">
            You&rsquo;re seeing {period_}. <strong className="text-navy-900">Past readings</strong> opens up the
            last 3 months, 6 months, or everything.
          </p>
          {onAskForHistory && (
            <button
              type="button"
              onClick={onAskForHistory}
              className="min-h-11 shrink-0 rounded-xl border-[1.5px] border-border-strong px-4 text-sm font-bold text-navy-700 hover:bg-app-bg"
            >
              See add-ons
            </button>
          )}
        </div>
      )}

      {!showList ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-divider text-[#5d6c80]">
            <SearchIcon className="h-5 w-5" />
          </span>
          <p className="max-w-sm text-[15px] text-text-body">Use the filters above to find specific readings.</p>
          <button
            type="button"
            onClick={() => setShowList(true)}
            className="min-h-11 rounded-xl border-[1.5px] border-border-strong bg-surface px-4 text-sm font-bold text-navy-700 hover:bg-app-bg"
          >
            Show all {formatNumber(results.length)} reading{results.length === 1 ? "" : "s"} for {period_}
          </button>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-white px-4 py-10 text-center">
          <p className="max-w-sm text-sm text-[#5d6c80]">
            No readings match{hasFilters ? " those filters" : " this period"}. Try a different unit, service or period.
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() =>
                change(() => {
                  setQuery("");
                  setService("all");
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-text-body hover:border-border-strong"
            >
              <XIcon className="h-4 w-4" />
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.slice(0, visible).map((r) => {
            const known = isService(r.service);
            const svc = known ? (r.service as Service) : "electricity";
            const unit = SERVICE_UNIT[svc];
            const status = clientStatus(r, openIds.has(r.id));
            const Icon = svc === "electricity" ? BoltIcon : DropletIcon;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-3 text-left transition-colors hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700 sm:gap-4 sm:px-4"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${SERVICE_COLOR[svc]}1a`, color: SERVICE_COLOR[svc] }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-navy-900">
                      {unitTitle(r.unit_number)}
                    </span>
                    <span className="block truncate text-xs text-[#5d6c80]">
                      {SERVICE_LABEL[svc]} · {formatDay(r.captured_at)}
                    </span>
                    {r.flag_status !== "ok" && (
                      <span
                        className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[status.tone].pill}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${TONE_CLASS[status.tone].dot}`} aria-hidden="true" />
                        {status.label}
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[15px] font-bold tabular-nums text-navy-900">
                      {formatNumber(r.reading_value)}
                      <span className="ml-1 font-sans text-xs font-semibold text-[#5d6c80]">{unit}</span>
                    </span>
                    <span className="block text-xs text-[#5d6c80]">
                      {r.usage !== null && r.usage >= 0 ? `Used ${formatNumber(r.usage)} ${unit}` : "First reading"}
                    </span>
                  </span>

                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="hidden shrink-0 text-text-faint transition-colors group-hover:text-[#5d6c80] sm:block"
                  >
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {results.length > visible && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="mx-auto min-h-11 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-semibold text-text-body hover:border-border-strong"
        >
          Show {Math.min(PAGE_SIZE, results.length - visible)} more ({formatNumber(results.length - visible)} remaining)
        </button>
      )}

      {openRow && (
        <ReadingDetailModal
          row={openRow}
          onClose={() => setOpenId(null)}
          audience="client"
          openIssue={openIds.has(openRow.id)}
        />
      )}
    </section>
  );
}
