"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateFeature, setFeatureStatus } from "@/app/admin/add-ons/actions";
import { ADD_ON_BY_KEY, formatRand, type FeatureStatus } from "@/lib/features";
import { formatDate } from "@/lib/date";

export interface AddOnRow {
  clientId: string;
  clientName: string;
  featureKey: string;
  status: FeatureStatus;
  priceCents: number;
  requestedAt: string;
  activatedAt: string | null;
}

const STATUS_PILL: Record<FeatureStatus, string> = {
  requested: "bg-amber-50 text-amber-800",
  active: "bg-[#e6f2df] text-[#2e6b1d]",
  declined: "bg-divider text-text-body",
  cancelled: "bg-divider text-text-body",
};

export function AddOnAdminList({ rows }: { rows: AddOnRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(key: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(key);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(null);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-sm text-text-body">
        No add-on requests yet. Clients request these from the Add-ons tab on their dashboard.
      </p>
    );
  }

  const pending = rows.filter((r) => r.status === "requested");
  const rest = rows.filter((r) => r.status !== "requested");

  function card(row: AddOnRow) {
    const addOn = ADD_ON_BY_KEY[row.featureKey];
    const key = `${row.clientId}:${row.featureKey}`;
    const isBusy = busy === key;

    return (
      <li key={key} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-navy-900">{row.clientName}</p>
            <p className="text-sm text-text-body">{addOn?.name ?? row.featureKey}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_PILL[row.status]}`}>
            {row.status === "requested" ? "Awaiting payment" : row.status}
          </span>
        </div>

        <p className="text-sm text-[#5d6c80]">
          {formatRand(Math.round(row.priceCents / 100))} / month · requested {formatDate(row.requestedAt)}
          {row.activatedAt && ` · live since ${formatDate(row.activatedAt)}`}
        </p>

        <div className="flex flex-wrap gap-2">
          {row.status !== "active" && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => run(key, () => activateFeature(row.clientId, row.featureKey))}
              className="min-h-11 rounded-xl bg-navy-700 px-4 text-sm font-bold text-white hover:bg-navy-900 disabled:opacity-50"
            >
              {isBusy ? "Working…" : "Mark paid & switch on"}
            </button>
          )}
          {row.status === "requested" && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => run(key, () => setFeatureStatus(row.clientId, row.featureKey, "declined"))}
              className="min-h-11 rounded-xl border-[1.5px] border-border-strong px-4 text-sm font-bold text-navy-700 hover:bg-app-bg disabled:opacity-50"
            >
              Decline
            </button>
          )}
          {row.status === "active" && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => run(key, () => setFeatureStatus(row.clientId, row.featureKey, "cancelled"))}
              className="min-h-11 rounded-xl border-[1.5px] border-red-200 px-4 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Switch off
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-text-body">
            Waiting on payment ({pending.length})
          </h2>
          <ul className="flex flex-col gap-2.5">{pending.map(card)}</ul>
        </section>
      )}

      {rest.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-text-body">Everything else</h2>
          <ul className="flex flex-col gap-2.5">{rest.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
