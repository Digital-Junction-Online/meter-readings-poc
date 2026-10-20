"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptReading, editReading } from "@/app/admin/review/actions";
import { uploadReadingPhoto } from "@/lib/readingPhoto";
import { formatDateTime } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { BAND_META, BAND_ORDER, triageReading, type TriageBand } from "@/lib/triage";
import type { FlagStatus, Service } from "@/lib/types";

const FLAG_CHIP: Partial<Record<FlagStatus, string>> = {
  below_prev: "Lower than last month",
  above_2x_avg: "Much higher than usual",
  possible_partial: "Looks incomplete",
};

export interface ReviewItem {
  readingId: string;
  propertyName: string;
  unitNumber: string;
  service: Service;
  flagStatus: FlagStatus;
  readingValue: number;
  previousValue: number | null;
  /** Consumption since the previous reading; null for a meter's first. */
  usage: number | null;
  /** This meter's own average consumption before this reading. */
  trailingAverage: number | null;
  capturedAt: string;
  photoUrl: string | null;
  notes: string | null;
}

export function ReviewQueueList({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openBands, setOpenBands] = useState<Record<TriageBand, boolean>>({
    fix: BAND_META.fix.defaultOpen,
    look: BAND_META.look.defaultOpen,
    low: BAND_META.low.defaultOpen,
  });

  // The buzz fires on tap, not on completion: the action is a server round
  // trip, and by the time it resolves the gesture that authorised vibration
  // has expired on Android, so a success buzz would be silently dropped.
  function handle(action: (id: string) => Promise<void>, id: string, feedback: "success" | "warning") {
    haptic(feedback);
    setBusyId(id);
    startTransition(async () => {
      try {
        await action(id);
        router.refresh();
      } catch (err) {
        haptic("error");
        throw err; // still surfaces to the error boundary as before
      } finally {
        setBusyId(null);
      }
    });
  }

  function startEdit(item: ReviewItem) {
    haptic("tap");
    setEditingId(item.readingId);
    setEditValue(String(item.readingValue));
    setEditNotes(item.notes ?? "");
    setEditPhoto(null);
    setEditPhotoPreview(null);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPhoto(null);
    setEditPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function handleRetake(file: File | null) {
    setEditPhoto(file);
    setEditPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function saveEdit(readingId: string) {
    setEditError(null);
    const value = Number.parseFloat(editValue);
    if (!editValue.trim() || Number.isNaN(value)) {
      setEditError("Enter a numeric reading.");
      return;
    }
    haptic("success");
    setSavingEdit(true);
    try {
      const photoUrl = editPhoto ? await uploadReadingPhoto(readingId, editPhoto) : undefined;
      await editReading({ readingId, rawValue: editValue, notes: editNotes.trim() || null, photoUrl });
      cancelEdit();
      router.refresh();
    } catch (err) {
      haptic("error");
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  // Grouped by how much each reading actually matters, then by how badly it
  // distorts totals within its group — so the numbers corrupting reports sit
  // at the top rather than wherever their capture date happens to put them.
  const banded = useMemo(() => {
    const out: Record<TriageBand, { item: ReviewItem; triage: ReturnType<typeof triageReading> }[]> = {
      fix: [],
      look: [],
      low: [],
    };
    for (const item of items) {
      const triage = triageReading({
        flagStatus: item.flagStatus,
        usage: item.usage,
        trailingAverage: item.trailingAverage,
      });
      out[triage.band].push({ item, triage });
    }
    for (const band of BAND_ORDER) {
      out[band].sort(
        (a, b) => b.triage.weight - a.triage.weight || b.item.capturedAt.localeCompare(a.item.capturedAt)
      );
    }
    return out;
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="mx-4 my-4 flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-surface px-5 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e6f2df] text-[#2e6b1d]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="text-lg font-extrabold text-navy-900">All caught up</h2>
        <p className="text-sm text-[#5d6c80]">Nothing is waiting on you.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-4">
      {BAND_ORDER.map((band) => {
        const entries = banded[band];
        if (entries.length === 0) return null;
        const meta = BAND_META[band];
        const isOpen = openBands[band];
        return (
          <section key={band} className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setOpenBands((o) => ({ ...o, [band]: !o[band] }))}
              aria-expanded={isOpen}
              className="flex min-h-11 w-full items-center gap-2.5 text-left"
            >
              <h2 className="text-base font-extrabold text-navy-900">{meta.title}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.pill}`}>{entries.length}</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={`ml-auto text-text-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <>
                <p className="-mt-1.5 text-[13px] leading-relaxed text-[#5d6c80]">{meta.blurb}</p>
                <div className="grid gap-3 lg:grid-cols-2">
                  {entries.map(({ item, triage }) => renderCard(item, triage.reason))}
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );

  function renderCard(item: ReviewItem, reason: string) {
    const busy = busyId === item.readingId;
    const unitWord = item.service === "water" ? "kL" : "kWh";
    const editing = editingId === item.readingId;
    const photoSrc = editing ? (editPhotoPreview ?? item.photoUrl) : item.photoUrl;

    return (
      <article key={item.readingId} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="relative h-40 bg-[#2a3e5c]">
          {photoSrc ? (
            <a href={photoSrc} target="_blank" rel="noreferrer" aria-label="Open the meter photo full size" className="block h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc} alt="Meter photo" className="h-full w-full object-cover" />
            </a>
          ) : (
            <span className="flex h-full items-center justify-center text-sm text-white/60">No photo</span>
          )}
          <span className="absolute left-3 top-3 max-w-[calc(100%-24px)] rounded-full bg-[#fbe8c6] px-2.5 py-1 text-xs font-bold text-[#5e3f0a]">
            {FLAG_CHIP[item.flagStatus] ?? "Needs a look"}
          </span>
        </div>

        <div className="flex flex-col gap-3.5 p-4">
          <div>
            <h3 className="text-lg font-extrabold text-navy-900">
              {/^\d/.test(item.unitNumber) ? `Unit ${item.unitNumber}` : item.unitNumber} ·{" "}
              {item.service === "water" ? "Water" : "Electricity"}
            </h3>
            <p className="mt-0.5 text-[13px] text-[#5d6c80]">
              {item.propertyName} · {formatDateTime(item.capturedAt)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-app-bg p-2.5">
              <p className="text-xs text-[#5d6c80]">Last reading</p>
              <p className="mt-1 truncate font-mono text-[15px] font-bold text-navy-900 tabular-nums">
                {item.previousValue !== null ? item.previousValue.toLocaleString("en-US") : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-xs text-[#7a5410]">This reading</p>
              <p className="mt-1 truncate font-mono text-[15px] font-bold text-navy-900 tabular-nums">
                {item.readingValue.toLocaleString("en-US")}
              </p>
            </div>
            <div className="rounded-xl bg-app-bg p-2.5">
              <p className="text-xs text-[#5d6c80]">Used</p>
              <p
                className={`mt-1 truncate font-mono text-[15px] font-bold tabular-nums ${
                  item.usage !== null && item.usage < 0 ? "text-red-600" : "text-[#9a3412]"
                }`}
              >
                {item.usage !== null ? `${item.usage >= 0 ? "+" : ""}${item.usage.toLocaleString("en-US")}` : "—"}
              </p>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-text-body">
            {reason}
            {item.trailingAverage !== null && item.trailingAverage > 0 && (
              <> Usually about {Math.round(item.trailingAverage).toLocaleString("en-US")} {unitWord} a month.</>
            )}
          </p>

          {editing ? (
            <div className="flex flex-col gap-3 border-t border-divider pt-3.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleRetake(e.target.files?.[0] ?? null)}
              />
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy-900">
                Corrected reading
                <input
                  type="text"
                  inputMode="decimal"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-[50px] w-full rounded-xl border-[1.5px] border-border-strong bg-surface px-3.5 font-mono text-lg font-bold text-navy-900 outline-none tabular-nums focus:border-navy-700"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy-900">
                Note (optional)
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  placeholder="Why it changed"
                  className="w-full rounded-xl border-[1.5px] border-border-strong bg-surface px-3.5 py-2.5 text-[15px] font-normal text-navy-900 outline-none placeholder:text-text-faint focus:border-navy-700"
                />
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-11 rounded-xl border border-border-strong bg-surface text-sm font-bold text-navy-700 hover:bg-app-bg"
              >
                {editPhoto ? "New photo attached · retake" : "Retake photo (optional)"}
              </button>
              {editError && (
                <p role="alert" className="text-sm font-medium text-red-600">
                  {editError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={savingEdit}
                  className="min-h-[52px] rounded-2xl border-[1.5px] border-border-strong bg-surface text-[15px] font-bold text-navy-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveEdit(item.readingId)}
                  disabled={savingEdit}
                  className="min-h-[52px] rounded-2xl bg-navy-700 text-[15px] font-bold text-white hover:bg-navy-900 disabled:opacity-50"
                >
                  {savingEdit ? "Saving…" : "Save & mark reviewed"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {item.notes && <p className="rounded-xl bg-app-bg px-3.5 py-2.5 text-sm text-text-body">Note: {item.notes}</p>}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startEdit(item)}
                  className="min-h-[52px] rounded-2xl border-[1.5px] border-border-strong bg-surface text-[15px] font-bold text-navy-700 hover:bg-app-bg disabled:opacity-50"
                >
                  Fix reading
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handle(acceptReading, item.readingId, "success")}
                  className="min-h-[52px] rounded-2xl bg-navy-700 text-[15px] font-bold text-white hover:bg-navy-900 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Looks right"}
                </button>
              </div>
            </>
          )}
        </div>
      </article>
    );
  }
}
