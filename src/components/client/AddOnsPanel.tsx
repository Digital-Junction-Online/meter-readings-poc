"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestFeature } from "@/app/client/actions";
import { ADD_ONS, formatRand, type FeatureStatus } from "@/lib/features";
import { haptic } from "@/lib/haptics";

const STATUS_PILL: Record<FeatureStatus, { label: string; className: string }> = {
  active: { label: "Switched on", className: "bg-[#e6f2df] text-[#2e6b1d]" },
  requested: { label: "Requested", className: "bg-amber-50 text-amber-800" },
  declined: { label: "Not approved", className: "bg-divider text-text-body" },
  cancelled: { label: "Cancelled", className: "bg-divider text-text-body" },
};

export function AddOnsPanel({
  clientId,
  statuses,
  canRequest,
}: {
  clientId: string | null;
  /** Current status per feature key; absent means never requested. */
  statuses: Record<string, FeatureStatus>;
  /** False in the fixture preview, where there's no real client to write to. */
  canRequest: boolean;
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function request(key: string) {
    if (!clientId || !canRequest) return;
    haptic("tap");
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      try {
        await requestFeature(clientId, key);
        router.refresh();
      } catch (err) {
        haptic("error");
        setError(err instanceof Error ? err.message : "Couldn't send that request. Please try again.");
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Add-ons">
      <div>
        <h2 className="text-lg font-extrabold text-navy-900">Add-ons</h2>
        <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-text-body">
          Extras you can add to your dashboard. Ask for one and Wayne will invoice you — it switches on once
          payment comes through, and you can stop it any time.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ADD_ONS.map((addOn) => {
          const status = statuses[addOn.key];
          const pill = status ? STATUS_PILL[status] : null;
          const busy = pendingKey === addOn.key;
          const canAsk = canRequest && status !== "active" && status !== "requested";

          return (
            <li
              key={addOn.key}
              className={`flex flex-col gap-3 rounded-2xl border bg-surface p-4 ${
                status === "active" ? "border-[#2e6b1d]/30" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-navy-900">{addOn.name}</h3>
                  <p className="mt-0.5 text-sm text-text-body">{addOn.tagline}</p>
                </div>
                {pill && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${pill.className}`}>
                    {pill.label}
                  </span>
                )}
              </div>

              <ul className="flex flex-col gap-1.5">
                {addOn.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2 text-sm text-text-body">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-[#2e6b1d]">
                      <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {bullet}
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3">
                <p className="text-[15px] font-extrabold text-navy-900">
                  {formatRand(addOn.priceRand)}
                  <span className="ml-1 text-sm font-semibold text-[#5d6c80]">/ month</span>
                </p>

                {status === "active" ? (
                  <span className="text-sm font-semibold text-[#2e6b1d]">Already on your dashboard</span>
                ) : status === "requested" ? (
                  <span className="text-sm font-semibold text-amber-800">Waiting on Wayne</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => request(addOn.key)}
                    disabled={!canAsk || busy}
                    className="min-h-11 rounded-xl bg-navy-700 px-4 text-sm font-bold text-white hover:bg-navy-900 disabled:opacity-50"
                  >
                    {busy ? "Sending…" : "Request this"}
                  </button>
                )}
              </div>

              {!addOn.available && status !== "active" && (
                <p className="text-[13px] text-[#5d6c80]">
                  Still being built — asking for it tells Wayne you want it, and puts you first in line.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {!canRequest && (
        <p className="text-sm text-[#5d6c80]">Requests are disabled in preview mode.</p>
      )}
    </section>
  );
}
