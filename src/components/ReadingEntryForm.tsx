"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { formatDate } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { queueReading } from "@/lib/offlineQueue";
import { hasDecimalOnWholeMeter, WHOLE_NUMBER_MESSAGE } from "@/lib/flagging";
import type { Service } from "@/lib/types";

function looksOffline(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /network|fetch|offline/i.test(message);
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function ReadingEntryForm({
  propertyId,
  propertyName,
  meterId,
  unitNumber,
  service,
  locationNote,
  meterLabel,
  meterPosition,
  meterTotal,
  previousValue,
  previousCapturedAt,
  trailingAverage,
  wholeNumbers = false,
}: {
  propertyId: string;
  propertyName: string;
  meterId: string;
  unitNumber: string | null;
  service: Service;
  locationNote: string | null;
  meterLabel: string;
  meterPosition: number;
  meterTotal: number;
  previousValue: number | null;
  previousCapturedAt: string | null;
  trailingAverage: number | null;
  /** The dial has no decimal point: the "." key is taken away. */
  wholeNumbers?: boolean;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function press(ch: string) {
    haptic("tap");
    setRaw((s) => {
      if (ch === "back") return s.slice(0, -1);
      if (ch === "." && (wholeNumbers || s.includes("."))) return s;
      if (s.replace(".", "").length >= 9) return s;
      return s + ch;
    });
  }

  const { display, delta, deltaTone, hint } = useMemo(() => {
    if (raw === "") {
      return {
        display: "0",
        delta: "—",
        deltaTone: "muted" as const,
        hint: "Type the dials left to right. Leading zeros are fine.",
      };
    }
    const [intPart, frac] = raw.split(".");
    const displayValue = groupThousands(intPart || "") + (raw.includes(".") ? "." + (frac || "") : "");
    const num = Number.parseFloat(raw);
    if (Number.isNaN(num) || previousValue === null) {
      return {
        display: displayValue,
        delta: "—",
        deltaTone: "muted" as const,
        hint:
          previousValue === null
            ? "No previous reading — this will be the first for this meter."
            : "Type the dials left to right. Leading zeros are fine.",
      };
    }
    const d = num - previousValue;
    if (d < 0) {
      return {
        display: displayValue,
        delta: d.toFixed(1),
        deltaTone: "negative" as const,
        hint: "Lower than last month. Check you read the right dial before saving.",
      };
    }
    const isHigh = trailingAverage !== null && trailingAverage > 0 && d > trailingAverage * 3;
    return {
      display: displayValue,
      delta: `+${d.toFixed(1)}`,
      deltaTone: isHigh ? ("high" as const) : ("normal" as const),
      hint: isHigh
        ? "Well above this meter's usual month. Worth a second look."
        : "In line with this meter's recent history.",
    };
  }, [raw, previousValue, trailingAverage]);

  function handlePhotoChange(file: File | null) {
    setPhoto(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function saveOffline(capturedAt: string): Promise<boolean> {
    if (!photo) return false;
    try {
      await queueReading({
        propertyId,
        meterId,
        meterLabel,
        unitNumber,
        service,
        rawValue: raw,
        notes: note || null,
        capturedAt,
        photo,
        photoName: photo.name,
      });
      router.push(`/capture/${propertyId}`);
      router.refresh();
      return true;
    } catch {
      // IndexedDB itself failed (private mode, storage disabled) — nothing
      // left to fall back to, the caller shows the original error instead.
      return false;
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!raw || !photo) {
      haptic("error");
      setError("Enter a reading and attach a photo before saving.");
      return;
    }
    if (hasDecimalOnWholeMeter(raw, wholeNumbers)) {
      haptic("error");
      setError(WHOLE_NUMBER_MESSAGE);
      return;
    }
    // Fires on the tap rather than after the upload: Android drops vibrate()
    // once the user activation that authorised it has expired, and a photo
    // upload is easily long enough for that to happen.
    haptic("success");
    setSubmitting(true);
    const capturedAt = new Date().toISOString();

    // No signal at all — skip straight to the local queue rather than
    // waiting out a network timeout first.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (await saveOffline(capturedAt)) return;
      haptic("error");
      setError("You're offline and this device couldn't save the reading locally either.");
      setSubmitting(false);
      return;
    }

    try {
      const supabase = createClient();
      const ext = photo.name.split(".").pop() || "jpg";
      const path = `${propertyId}/${meterId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("meter-photos").upload(path, photo);
      if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

      const { data: publicUrlData } = supabase.storage.from("meter-photos").getPublicUrl(path);

      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meter_id: meterId,
          raw_value: raw,
          photo_url: publicUrlData.publicUrl,
          notes: note || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save reading");

      router.push(`/capture/${propertyId}`);
      router.refresh();
    } catch (err) {
      // Connection dropped mid-upload (patchy signal on site, not a clean
      // offline start) — same local-queue fallback as the offline fast path.
      if (looksOffline(err) && (await saveOffline(capturedAt))) return;
      haptic("error");
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  }

  const serviceName = service === "water" ? "Water" : "Electricity";
  const title = unitNumber ? `Unit ${unitNumber} · ${serviceName}` : meterLabel;
  const unitLabel = service === "water" ? "kL" : "kWh";
  const ready = raw !== "" && photo !== null;

  const hintClass =
    deltaTone === "negative"
      ? "font-semibold text-red-600"
      : deltaTone === "high"
        ? "font-semibold text-[#7a5410]"
        : deltaTone === "normal"
          ? "font-semibold text-[#2e6b1d]"
          : "text-[#5d6c80]";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-app-bg">
      <header className="flex-none border-b border-border bg-surface px-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center gap-3">
          <Link
            href={`/capture/${propertyId}`}
            aria-label="Back to meter list"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-app-bg"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="var(--navy-900)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-[#5d6c80]">
              {propertyName} · {meterPosition} of {meterTotal}
            </p>
            <h1 className="truncate text-xl font-extrabold text-navy-900">{title}</h1>
          </div>
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              service === "water" ? "bg-[#e7f0fa] text-blue-500" : "bg-[#fdf3e2] text-amber-800"
            }`}
            aria-hidden="true"
          >
            {service === "water" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 3s7 7.5 7 12a7 7 0 1 1-14 0c0-4.5 7-12 7-12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
        />
        {photoPreview ? (
          <section className="flex items-center gap-3.5 rounded-2xl border border-green-200 bg-surface p-3.5">
            <a
              href={photoPreview}
              target="_blank"
              rel="noreferrer"
              aria-label="View the photo full size"
              className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-navy-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Meter photo" className="h-full w-full object-cover" />
            </a>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-[#2e6b1d]">Photo attached</span>
              <span className="block text-[13px] text-[#5d6c80]">Step 1 of 2 done</span>
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-11 rounded-xl border border-border-strong bg-surface px-3.5 text-sm font-bold text-navy-700 hover:bg-app-bg"
            >
              Retake
            </button>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-3.5 rounded-2xl border-2 border-dashed border-[#9fb3cc] bg-surface p-3.5 text-left hover:border-navy-700"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-700 text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="2" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-navy-700">Step 1: Take a photo of the meter</span>
              <span className="mt-0.5 block text-[13px] text-[#5d6c80]">{locationNote || "Required before saving"}</span>
            </span>
          </button>
        )}

        <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px] text-[#5d6c80]">
            <span>Step 2: Type the reading</span>
            <span>
              {previousValue !== null ? (
                <>
                  Last:{" "}
                  <strong className="font-mono font-bold text-navy-900 tabular-nums">
                    {previousValue.toLocaleString("en-US")}
                  </strong>
                  {previousCapturedAt ? ` on ${formatDate(previousCapturedAt)}` : ""}
                </>
              ) : (
                "No previous reading"
              )}
            </span>
          </div>
          <div
            aria-live="polite"
            className="flex h-16 items-center justify-end gap-2 rounded-xl bg-navy-900 px-4 text-white"
          >
            <span className="font-mono text-[34px] font-bold tracking-wide tabular-nums">{display}</span>
            <span className="text-[15px] text-white/60">{unitLabel}</span>
          </div>
          {wholeNumbers && (
            <p className="rounded-lg bg-app-bg px-3 py-2 text-[13px] font-semibold text-navy-900">
              No decimal point on this meter. Type every digit on the dial.
            </p>
          )}
          <div className="flex items-start justify-between gap-3">
            <p className={`text-[13px] leading-snug ${hintClass}`}>{hint}</p>
            {delta !== "—" && (
              <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${hintClass}`}>{delta}</span>
            )}
          </div>
        </section>

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) =>
            k === "." && wholeNumbers ? (
              <span key={k} aria-hidden="true" className="h-[54px] rounded-xl bg-app-bg" />
            ) : (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              aria-label={k === "back" ? "Delete last digit" : k === "." ? "Decimal point" : k}
              className={`flex h-[54px] items-center justify-center rounded-xl border border-border font-mono text-[22px] font-bold text-navy-900 transition-colors active:border-navy-700 active:bg-navy-700 active:text-white ${
                k === "." || k === "back" ? "bg-divider" : "bg-surface"
              }`}
            >
              {k === "back" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 5h11v14H9L3 12z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 9.5l5 5M17 9.5l-5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              ) : (
                k
              )}
            </button>
            )
          )}
        </div>

        {showNote ? (
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy-900">
            Note for Wayne (optional)
            <textarea
              className="w-full rounded-xl border-[1.5px] border-border-strong bg-surface px-3.5 py-2.5 text-[15px] font-normal text-navy-900 outline-none focus:border-navy-700"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="min-h-11 self-start text-sm font-semibold text-navy-700 underline-offset-2 hover:underline"
          >
            + Add a note
          </button>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-red-600/30 bg-red-600/[0.06] px-3.5 py-2.5 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex-none border-t border-border bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`min-h-14 w-full rounded-2xl text-base font-bold transition-colors disabled:opacity-60 ${
            ready ? "bg-navy-700 text-white hover:bg-navy-900" : "bg-border text-[#5d6c80]"
          }`}
        >
          {submitting ? "Saving…" : "Save & next meter"}
        </button>
      </div>
    </main>
  );
}
