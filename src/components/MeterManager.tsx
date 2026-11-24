"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMeter, deleteMeter, setMeterWholeNumbers } from "@/app/admin/clients/actions";
import type { Meter, Service } from "@/lib/types";

const SERVICE_COLOR: Record<Service, string> = {
  electricity: "text-amber-600 border-amber-200",
  water: "text-blue-600 border-blue-200",
};

export interface MeterRow extends Meter {
  unit_number: string | null;
  reading_count: number;
}

export function MeterManager({
  propertyId,
  meters,
}: {
  propertyId: string;
  meters: MeterRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<Service>("electricity");
  const [unitNumber, setUnitNumber] = useState("");
  const [label, setLabel] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [isCommunal, setIsCommunal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Default the label from unit + service so Wayne rarely has to type it.
  const effectiveLabel =
    label.trim() ||
    (isCommunal
      ? ""
      : unitNumber.trim()
        ? `${unitNumber.trim()} - ${service === "electricity" ? "Electricity" : "Water"}`
        : "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createMeter({
          propertyId,
          service,
          label: effectiveLabel,
          unitNumber: isCommunal ? null : unitNumber || null,
          locationNote: locationNote || null,
          isCommunal,
        });
        setUnitNumber("");
        setLabel("");
        setLocationNote("");
        setIsCommunal(false);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add meter");
      }
    });
  }

  // Every reading for one meter, in Reports. The unit filter matches the unit
  // number (or a communal meter's label), and `all` lists the whole history.
  function readingsHref(m: MeterRow): string {
    const qs = new URLSearchParams({
      property: propertyId,
      unit: m.unit_number ?? m.label,
      service: m.service,
      all: "1",
    });
    return `/admin/reports?${qs.toString()}`;
  }

  function handleWholeNumbers(meterId: string, wholeNumbers: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await setMeterWholeNumbers(meterId, wholeNumbers);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update meter");
      }
    });
  }

  function handleDelete(meterId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteMeter(meterId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete meter");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-navy-900">
          Meters ({meters.length})
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 rounded-xl border-[1.5px] border-border-strong px-3.5 text-sm font-bold text-navy-700 hover:bg-app-bg"
        >
          {open ? "Cancel" : "+ Add meter"}
        </button>
      </div>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-xl border border-border bg-app-bg p-3.5"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy-900">Service</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-divider p-1">
              {(["electricity", "water"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setService(s)}
                  className={`min-h-11 rounded-[9px] text-sm capitalize ${
                    service === s
                      ? "bg-surface font-bold text-navy-900 shadow-[0_1px_3px_rgba(12,31,61,0.12)]"
                      : "font-semibold text-[#5d6c80]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isCommunal}
              onChange={(e) => setIsCommunal(e.target.checked)}
              className="h-5 w-5 accent-navy-700"
            />
            <span className="text-sm font-medium text-text-body">
              Communal meter (not tied to a unit)
            </span>
          </label>

          {!isCommunal && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy-900">Unit number</span>
              <input
                type="text"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="e.g. 101"
                className="min-h-12 w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 py-2.5 text-base text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy-900">
              Label {!isCommunal && <span className="font-normal text-[#5d6c80]">(auto)</span>}
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required={isCommunal}
              placeholder={isCommunal ? "e.g. Main Water Meter" : effectiveLabel || "e.g. 101 - Electricity"}
              className="min-h-12 w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 py-2.5 text-base text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy-900">Location note (optional)</span>
            <input
              type="text"
              value={locationNote}
              onChange={(e) => setLocationNote(e.target.value)}
              placeholder="e.g. Basement meter room, left wall"
              className="min-h-12 w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 py-2.5 text-base text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15"
            />
          </label>

          <button
            type="submit"
            disabled={isPending || !effectiveLabel}
            className="w-fit min-h-12 rounded-xl bg-navy-700 px-5 text-[15px] font-bold text-white hover:bg-navy-900 disabled:opacity-50"
          >
            {isPending ? "Adding..." : "Add meter"}
          </button>
        </form>
      )}

      {error && (
        <p className="rounded-xl border border-red-600/30 bg-red-600/[0.06] px-3.5 py-2.5 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {meters.length > 0 &&
        (["electricity", "water"] as const).map((s) => {
          const group = meters.filter((m) => m.service === s);
          if (group.length === 0) return null;
          return (
            <details key={s} className="group overflow-hidden rounded-xl border border-border" open={group.length <= 12}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 bg-app-bg px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#5d6c80] transition-transform group-open:rotate-90" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span
                  className={`text-sm font-bold capitalize ${s === "water" ? "text-blue-500" : "text-amber-800"}`}
                >
                  {s} ({group.length})
                </span>
              </summary>
              <div className="flex flex-col gap-1.5 p-2.5">
              {group.map((m) => (
                <div
                  key={m.id}
                  className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-[13px]"
                >
                  <Link
                    href={readingsHref(m)}
                    title="See this meter's readings"
                    className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-700"
                  >
                    <span
                      className={`shrink-0 rounded-full border-2 bg-white px-2 py-0.5 font-medium capitalize ${SERVICE_COLOR[m.service]}`}
                    >
                      {m.unit_number ?? m.service}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-navy-900">
                      {m.label}
                      {m.is_communal && (
                        <span className="ml-1.5 font-normal text-[#5d6c80]">communal</span>
                      )}
                    </span>
                  </Link>
                  <label
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[#5d6c80]"
                    title="Tick if this meter's dial has no decimal point"
                  >
                    <input
                      type="checkbox"
                      checked={!!m.whole_numbers}
                      disabled={isPending}
                      onChange={(e) => handleWholeNumbers(m.id, e.target.checked)}
                      className="h-4 w-4 accent-navy-700"
                    />
                    No decimal
                  </label>
                  <span className="shrink-0 text-[#5d6c80]">
                    {m.reading_count} reading{m.reading_count === 1 ? "" : "s"}
                  </span>
                  {m.reading_count === 0 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      disabled={isPending}
                      className="min-h-9 shrink-0 rounded-lg px-2 font-bold text-red-600 hover:bg-red-600/[0.06] disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
              </div>
            </details>
          );
        })}
    </div>
  );
}
