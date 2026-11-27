"use client";

import { useState } from "react";
import { loadReportSections } from "@/app/admin/reports/actions";
import { downloadReadingsPdf, shareReadingsPdf, type ReportPdfOptions } from "@/lib/readingsPdf";
import { haptic } from "@/lib/haptics";
import { ShareIcon } from "@/components/icons";

export type ReportFilterParams = { from?: string; to?: string; unit?: string; service?: string };

export function hasReportFilters(filters: ReportFilterParams): boolean {
  return !!(filters.from || filters.to || filters.unit || filters.service);
}

/**
 * Loads the readings and builds the options for the branded report PDF. Shared
 * by the "Share this report" panel and the "Download PDF" button under the
 * readings table, so both produce the exact same document.
 */
export async function buildAdminReportOptions({
  scope,
  propertyId,
  propertyName,
  clientName,
  filters,
}: {
  scope: "one" | "all";
  propertyId: string;
  propertyName: string;
  clientName: string | null;
  filters: ReportFilterParams;
}): Promise<ReportPdfOptions> {
  const periodText =
    filters.from && filters.to
      ? `${filters.from} to ${filters.to}`
      : filters.from
        ? `Since ${filters.from}`
        : filters.to
          ? `Up to ${filters.to}`
          : "All readings";
  const filterText = [filters.unit ? `Unit "${filters.unit}"` : null, filters.service ? filters.service : null]
    .filter(Boolean)
    .join(" · ");

  const sections = await loadReportSections(scope === "all" ? "all" : propertyId, {
    from: filters.from,
    to: filters.to,
    unitNumber: filters.unit,
    service: filters.service === "electricity" || filters.service === "water" ? filters.service : undefined,
  });

  return {
    preparedFor: scope === "all" ? "All clients" : (clientName ?? propertyName),
    scopeLabel: scope === "all" ? "All properties" : propertyName,
    periodText,
    filterText: filterText || null,
    sections,
  };
}

/**
 * Admin "Share this report": the selected property, or every property in one
 * PDF (one section per property). Filters set on the page narrow the table
 * the same way they narrow the on-screen readings. Share opens the device's
 * share sheet with the PDF attached; Download saves it.
 */
export function AdminReportDownload({
  propertyId,
  propertyName,
  clientName,
  filters,
}: {
  propertyId: string;
  propertyName: string;
  clientName: string | null;
  filters: ReportFilterParams;
}) {
  const [scope, setScope] = useState<"one" | "all">("one");
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: "share" | "download") {
    haptic("tap");
    setMessage(null);
    setBusy(action);
    try {
      const opts = await buildAdminReportOptions({ scope, propertyId, propertyName, clientName, filters });
      if (action === "download") {
        await downloadReadingsPdf(opts);
      } else {
        const result = await shareReadingsPdf(opts);
        if (result === "downloaded") {
          setMessage({ ok: true, text: "This browser can't share files, so we saved the PDF instead. Attach it to an email or WhatsApp." });
        }
      }
    } catch {
      setMessage({ ok: false, text: "We couldn't create the report. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="What to include" className="grid grid-cols-2 gap-1 rounded-xl bg-divider p-1">
        {(
          [
            ["one", propertyName],
            ["all", "All properties"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            aria-pressed={scope === key}
            className={`min-h-11 truncate rounded-[9px] px-2 text-sm ${
              scope === key ? "bg-surface font-bold text-navy-900 shadow-[0_1px_3px_rgba(12,31,61,0.12)]" : "font-semibold text-[#5d6c80]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => run("share")}
          disabled={busy !== null}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-navy-700 px-3 text-[15px] font-bold text-white hover:bg-navy-900 disabled:opacity-60"
        >
          <ShareIcon className="h-[18px] w-[18px]" />
          {busy === "share" ? "Preparing…" : "Share"}
        </button>
        <button
          type="button"
          onClick={() => run("download")}
          disabled={busy !== null}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-border-strong bg-surface px-3 text-[15px] font-bold text-navy-700 hover:bg-app-bg disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {busy === "download" ? "Preparing…" : "Download"}
        </button>
      </div>
      <p className="text-[13px] text-[#5d6c80]">
        {hasReportFilters(filters) ? "Uses the filters on Find readings for the readings table." : "Includes every reading on record."}
      </p>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm font-medium ${message.ok ? "text-[#2e6b1d]" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
