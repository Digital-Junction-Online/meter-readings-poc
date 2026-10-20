"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Service } from "@/lib/types";
import { DownloadIcon, SearchIcon, XIcon } from "@/components/icons";

const inputClass =
  "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-navy-700 focus:bg-white focus:ring-2 focus:ring-navy-700/20";

export function ReportControls({
  hasResults,
  latestMonth,
}: {
  hasResults: boolean;
  /** "2026-10" — the newest month with readings, for the period shortcuts. */
  latestMonth?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [unit, setUnit] = useState(searchParams.get("unit") ?? "");
  const [service, setService] = useState<Service | "">(
    (searchParams.get("service") as Service | null) ?? ""
  );

  /**
   * One-tap equivalents of the date boxes. `latestMonth` is passed in from the
   * server so "latest month" means the last month that actually has readings,
   * not whatever month it happens to be today — a round captured on the 2nd
   * would otherwise show an empty "this month".
   */
  function applyPeriod(months: number | "all") {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");

    if (months !== "all" && latestMonth) {
      const [y, m] = latestMonth.split("-").map(Number);
      const startIndex = y * 12 + (m - 1) - (months - 1);
      const start = `${Math.floor(startIndex / 12)}-${String((startIndex % 12) + 1).padStart(2, "0")}-01`;
      // End of the latest month, without tripping over month lengths.
      const endIndex = y * 12 + m;
      const end = `${Math.floor(endIndex / 12)}-${String((endIndex % 12) + 1).padStart(2, "0")}-01`;
      params.set("from", start);
      params.set("to", end);
      setFrom(start);
      setTo(end);
    } else {
      setFrom("");
      setTo("");
      // "All readings" still needs a filter present or the table stays hidden.
      params.set("all", "1");
    }

    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());

    const setOrDelete = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    setOrDelete("from", from);
    setOrDelete("to", to);
    setOrDelete("unit", unit);
    setOrDelete("service", service);

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function handleClear() {
    setFrom("");
    setTo("");
    setUnit("");
    setService("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    params.delete("unit");
    params.delete("service");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const hasAnyFilter = !!(from || to || unit || service);

  return (
    <form
      onSubmit={handleApply}
      className="no-print flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Period</span>
        {(
          [
            { label: "Latest month", months: 1 as const },
            { label: "Last 3 months", months: 3 as const },
            { label: "Last 6 months", months: 6 as const },
            { label: "All readings", months: "all" as const },
          ]
        ).map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPeriod(p.months)}
            disabled={isPending}
            className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-navy-700 hover:border-navy-700 disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">Unit number</span>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. 101"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">Service</span>
          <select
            value={service}
            onChange={(e) => setService(e.target.value as Service | "")}
            className={inputClass}
          >
            <option value="">Any</option>
            <option value="electricity">Electricity</option>
            <option value="water">Water</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-navy-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-700/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <SearchIcon className="h-4 w-4" />
          {isPending ? "Applying…" : "Apply filters"}
        </button>

        {hasAnyFilter && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <XIcon className="h-4 w-4" />
            Clear
          </button>
        )}

        {hasResults && (
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-navy-700 px-4 py-2 text-sm font-semibold text-navy-700 transition-colors hover:bg-[#e8eef7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
          >
            <DownloadIcon className="h-4 w-4" />
            Download PDF
          </button>
        )}
      </div>
    </form>
  );
}
