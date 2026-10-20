"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { editReading } from "@/app/admin/review/actions";
import { uploadReadingPhoto } from "@/lib/readingPhoto";
import type { ReadingRow } from "@/components/ReadingsTable";
import { ADMIN_FLAG_LABEL, FLAG_CLASS, FLAG_DOT_CLASS, TONE_CLASS } from "@/lib/flagDisplay";
import {
  clientStatus,
  formatDayTime,
  formatNumber,
  isService,
  SERVICE_LABEL,
  SERVICE_UNIT,
  unitTitle,
} from "@/lib/clientReport";
import { formatDateTime } from "@/lib/date";

/**
 * One reading in full. Admins see the internal flag wording and the meter
 * reader's note; clients see plain language and never the note (it is written
 * to Wayne, not to them).
 */
export function ReadingDetailModal({
  row,
  onClose,
  audience = "admin",
  openIssue = false,
}: {
  row: ReadingRow;
  onClose: () => void;
  audience?: "admin" | "client";
  /** Client view only: this is a meter's latest reading and it is still being checked. */
  openIssue?: boolean;
}) {
  return audience === "client" ? (
    <ClientDetail row={row} onClose={onClose} openIssue={openIssue} />
  ) : (
    <AdminDetail row={row} onClose={onClose} />
  );
}

function Photo({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Meter photo"
      className="max-h-[50vh] w-full rounded-xl border border-border bg-app-bg object-contain"
    />
  ) : (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-[#5d6c80]">
      No photo attached
    </div>
  );
}

function PhotoLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="w-fit text-sm font-medium text-navy-700 underline decoration-border-strong underline-offset-2 hover:decoration-navy-700"
    >
      Open full-size photo in a new tab
    </a>
  );
}

function AdminDetail({ row, onClose }: { row: ReadingRow; onClose: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.reading_value));
  const [notes, setNotes] = useState(row.notes ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setValue(String(row.reading_value));
    setNotes(row.notes ?? "");
    setPhoto(null);
    setPhotoPreview(null);
    setError(null);
    setEditing(true);
  }

  function pickPhoto(file: File | null) {
    setPhoto(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function save() {
    setError(null);
    if (!value.trim() || Number.isNaN(Number.parseFloat(value))) {
      setError("Enter a numeric reading.");
      return;
    }
    setSaving(true);
    try {
      const photoUrl = photo ? await uploadReadingPhoto(row.id, photo) : undefined;
      await editReading({ readingId: row.id, rawValue: value, notes: notes.trim() || null, photoUrl });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Modal title={`Edit ${row.unit_number} · ${row.service}`} onClose={onClose}>
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Keep or retake photo"
              className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-navy-900"
            >
              {photoPreview || row.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview ?? row.photo_url!} alt="Meter photo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-white/50">No photo</span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              <p className="text-[13px] text-[#5d6c80]">
                {photo ? "New photo attached" : "Keeping the original photo"}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-fit rounded-xl border-[1.5px] border-border-strong px-3 py-2 text-[13px] font-bold text-navy-700 hover:bg-app-bg"
              >
                Retake photo
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy-900">Reading</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-h-12 w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 py-2.5 font-mono text-base text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy-900">Note (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 py-2.5 text-base text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15"
            />
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="min-h-12 flex-1 rounded-xl border-[1.5px] border-border-strong px-4 text-[15px] font-bold text-navy-700 hover:bg-app-bg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="min-h-12 flex-1 rounded-xl bg-navy-700 px-4 text-[15px] font-bold text-white hover:bg-navy-900 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & mark reviewed"}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${row.unit_number} · ${row.service}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Photo url={row.photo_url} />

        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs font-medium ${FLAG_CLASS[row.flag_status]}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${FLAG_DOT_CLASS[row.flag_status]}`} aria-hidden="true" />
          {ADMIN_FLAG_LABEL[row.flag_status]}
        </span>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-[#5d6c80]">Captured</dt>
            <dd className="font-medium text-navy-900">{formatDateTime(row.captured_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#5d6c80]">Reading</dt>
            <dd className="font-mono font-semibold tabular-nums text-navy-900">
              {row.reading_value.toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#5d6c80]">Previous</dt>
            <dd className="font-mono tabular-nums text-text-body">
              {row.previous_value !== null ? row.previous_value.toLocaleString("en-US") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#5d6c80]">Usage</dt>
            <dd className="font-mono tabular-nums text-text-body">
              {row.usage !== null ? row.usage.toLocaleString("en-US") : "—"}
            </dd>
          </div>
        </dl>

        {row.notes && <p className="rounded-lg bg-app-bg px-3 py-2 text-sm text-text-body">{row.notes}</p>}

        <PhotoLink url={row.photo_url} />

        <button
          type="button"
          onClick={startEdit}
          className="min-h-12 w-full rounded-xl border-[1.5px] border-border-strong text-[15px] font-bold text-navy-700 hover:bg-app-bg"
        >
          Edit this reading
        </button>
      </div>
    </Modal>
  );
}

function ClientDetail({
  row,
  onClose,
  openIssue,
}: {
  row: ReadingRow;
  onClose: () => void;
  openIssue: boolean;
}) {
  const known = isService(row.service);
  const unit = known ? SERVICE_UNIT[row.service as keyof typeof SERVICE_UNIT] : "";
  const serviceLabel = known ? SERVICE_LABEL[row.service as keyof typeof SERVICE_LABEL] : row.service;
  const status = clientStatus(row, openIssue);
  const tone = TONE_CLASS[status.tone];

  let usageLine: string;
  if (row.usage === null) usageLine = "This is the first reading recorded for this meter.";
  else if (row.usage < 0) {
    usageLine = `Lower than the previous reading${row.previous_value !== null ? ` (${formatNumber(row.previous_value)} ${unit})` : ""}.`;
  } else usageLine = `Used ${formatNumber(row.usage)} ${unit} since the previous reading.`;

  return (
    <Modal title={`${unitTitle(row.unit_number)} · ${serviceLabel}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Photo url={row.photo_url} />

        <div>
          <p className="text-xs font-semibold tracking-wide text-[#5d6c80] uppercase">Meter reading</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-navy-900">
            {formatNumber(row.reading_value)}{" "}
            <span className="font-sans text-base font-semibold text-[#5d6c80]">{unit}</span>
          </p>
          <p className="mt-1 text-sm text-text-body">{usageLine}</p>
        </div>

        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.pill}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
          {status.label}
        </span>
        {status.detail && (
          <p className="rounded-xl bg-app-bg px-3 py-2.5 text-sm text-text-body">{status.detail}</p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-[#5d6c80]">Reading taken</dt>
            <dd className="font-medium text-navy-900">{formatDayTime(row.captured_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#5d6c80]">Previous reading</dt>
            <dd className="font-mono tabular-nums text-text-body">
              {row.previous_value !== null ? `${formatNumber(row.previous_value)} ${unit}` : "None yet"}
            </dd>
          </div>
        </dl>

        <PhotoLink url={row.photo_url} />
      </div>
    </Modal>
  );
}
