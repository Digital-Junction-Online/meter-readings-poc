"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/date";
import { ReadingDetailModal } from "@/components/ReadingDetailModal";
import { ADMIN_FLAG_LABEL as FLAG_LABEL, FLAG_CLASS, FLAG_DOT_CLASS } from "@/lib/flagDisplay";
import type { FlagStatus } from "@/lib/types";
import { SearchIcon } from "@/components/icons";

export interface ReadingRow {
  id: string;
  kind?: "reading" | "replacement";
  captured_at: string;
  meter_id: string;
  meter_label: string;
  /** Unit number for per-unit meters; the meter label for communal ones. */
  unit_number: string;
  service: string;
  reading_value: number;
  previous_value: number | null;
  /** The meter's reading before this one, so an admin can correct it from here. */
  previous_reading_id?: string | null;
  usage: number | null;
  flag_status: FlagStatus;
  /** An admin has looked at this reading (accepted or corrected it). */
  reviewed?: boolean;
  photo_url: string | null;
  notes: string | null;
  /** kind: "replacement" only — old/new meter identifiers for the marker copy. */
  replacementDetail?: {
    oldSerial: string | null;
    newSerial: string | null;
    closingValue: number;
    openingValue: number;
  };
}

type SortKey = "date" | "unit";
type SortDir = "asc" | "desc";

function compareUnitNumbers(a: string, b: string): number {
  const numA = Number.parseFloat(a);
  const numB = Number.parseFloat(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
    return numA - numB;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}

function SortIcon({ direction }: { direction: SortDir | null }) {
  if (!direction) return null;
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      className={`inline-block transition-transform ${direction === "asc" ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <SearchIcon className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-slate-500">{children}</p>
    </div>
  );
}

export function ReadingsTable({ rows }: { rows: ReadingRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openId, setOpenId] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp =
        sortKey === "date"
          ? a.captured_at.localeCompare(b.captured_at)
          : compareUnitNumbers(a.unit_number, b.unit_number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const openReading = openId ? (rows.find((r) => r.id === openId) ?? null) : null;

  if (rows.length === 0) {
    return <EmptyState>Use the filters above to find specific readings.</EmptyState>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {/* A <button> inside a <thead> that repeats across printed pages doesn't reliably
                    re-render past the first page — this plain-text twin is what print actually shows. */}
                <span className="hidden print:inline">Date</span>
                <button
                  type="button"
                  onClick={() => handleSort("date")}
                  className="no-print flex items-center gap-1 rounded transition-colors hover:text-navy-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
                >
                  Date
                  <SortIcon direction={sortKey === "date" ? sortDir : null} />
                </button>
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <span className="hidden print:inline">Unit</span>
                <button
                  type="button"
                  onClick={() => handleSort("unit")}
                  className="no-print flex items-center gap-1 rounded transition-colors hover:text-navy-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
                >
                  Unit
                  <SortIcon direction={sortKey === "unit" ? sortDir : null} />
                </button>
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Service
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Reading
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Previous
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Usage
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Status
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Photo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((r) =>
              r.kind === "replacement" ? (
                <tr key={r.id} className="bg-amber-50">
                  <td colSpan={8} className="px-3 py-2.5 text-xs text-amber-800">
                    <span className="font-semibold text-amber-900">Unit {r.unit_number} · {r.service}</span> —
                    meter replaced {formatDateTime(r.captured_at)}.{" "}
                    {r.replacementDetail && (
                      <>
                        {r.replacementDetail.oldSerial ? `${r.replacementDetail.oldSerial} ` : "Old meter "}
                        closed {r.replacementDetail.closingValue.toLocaleString("en-US")} →{" "}
                        {r.replacementDetail.newSerial ? `${r.replacementDetail.newSerial} ` : "new meter "}
                        opened {r.replacementDetail.openingValue.toLocaleString("en-US")}.
                      </>
                    )}
                  </td>
                </tr>
              ) : (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => setOpenId(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenId(r.id);
                  }
                }}
                className="cursor-pointer outline-none transition-colors hover:bg-slate-50 focus-visible:bg-[#e8eef7]/60"
              >
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                  {formatDateTime(r.captured_at)}
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-900">{r.unit_number}</td>
                <td className="px-3 py-2.5 text-slate-600 capitalize">{r.service}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                  {r.reading_value.toLocaleString("en-US")}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                  {r.previous_value !== null ? r.previous_value.toLocaleString("en-US") : "-"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                  {r.usage !== null ? r.usage.toLocaleString("en-US") : "-"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-2 py-1 text-xs font-medium whitespace-nowrap ${FLAG_CLASS[r.flag_status]}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${FLAG_DOT_CLASS[r.flag_status]}`}
                      aria-hidden="true"
                    />
                    {FLAG_LABEL[r.flag_status]}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {r.photo_url ? (
                    <span className="font-medium text-navy-700">View</span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
              </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {openReading && (
        <ReadingDetailModal row={openReading} onClose={() => setOpenId(null)} audience="admin" />
      )}
    </div>
  );
}
