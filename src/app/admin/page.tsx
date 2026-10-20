import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { InstallPrompt } from "@/components/InstallPrompt";
import { BottomNav } from "@/components/BottomNav";
import { AdminPage } from "@/components/AdminPage";
import type { Client, FlagStatus, Meter, MeterReading, Property } from "@/lib/types";

export const dynamic = "force-dynamic";

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

const FLAG_LABEL: Partial<Record<FlagStatus, string>> = {
  below_prev: "fell below its previous reading",
  above_2x_avg: "well above its own average",
  possible_partial: "looks like an incomplete entry",
};

export default async function AdminDashboardPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/admin");
  if (profile.role !== "admin") redirect("/client");

  const supabase = await createClient();

  const [{ data: propertyRows }, { data: clientRows }, { data: meterRows }] = await Promise.all([
    supabase.from("properties").select("*").order("name"),
    supabase.from("clients").select("*").order("name"),
    supabase.from("meters").select("*").is("retired_at", null),
  ]);

  const properties = (propertyRows ?? []) as Property[];
  const clients = (clientRows ?? []) as Client[];
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const meters = (meterRows ?? []) as Meter[];

  const metersByProperty = new Map<string, Meter[]>();
  for (const m of meters) {
    metersByProperty.set(m.property_id, [...(metersByProperty.get(m.property_id) ?? []), m]);
  }

  const meterIds = meters.map((m) => m.id);
  const { data: readingRows } = meterIds.length
    ? await supabase
        .from("meter_readings")
        .select("*")
        .in("meter_id", meterIds)
        .order("captured_at", { ascending: false })
    : { data: [] };

  // Latest reading per meter — the current state that drives both "read
  // this round" and "open flag" for every screen below.
  const latestByMeter = new Map<string, MeterReading>();
  for (const r of (readingRows ?? []) as MeterReading[]) {
    if (!latestByMeter.has(r.meter_id)) latestByMeter.set(r.meter_id, r);
  }

  const monthStart = monthStartIso();

  interface PropertySummary {
    property: Property;
    clientName: string;
    total: number;
    read: number;
    openFlags: { meter: Meter; reading: MeterReading }[];
  }

  const summaries: PropertySummary[] = properties.map((p) => {
    const propMeters = metersByProperty.get(p.id) ?? [];
    let read = 0;
    const openFlags: { meter: Meter; reading: MeterReading }[] = [];
    for (const m of propMeters) {
      const latest = latestByMeter.get(m.id);
      if (latest && latest.captured_at >= monthStart) read++;
      if (latest && latest.flag_status !== "ok" && !latest.reviewed_at) {
        openFlags.push({ meter: m, reading: latest });
      }
    }
    return {
      property: p,
      clientName: clientById.get(p.client_id)?.name ?? "—",
      total: propMeters.length,
      read,
      openFlags,
    };
  });

  const totalMeters = summaries.reduce((sum, s) => sum + s.total, 0);
  const totalRead = summaries.reduce((sum, s) => sum + s.read, 0);
  const allOpenFlags = summaries.flatMap((s) => s.openFlags.map((f) => ({ ...f, property: s.property })));
  const completeCount = summaries.filter((s) => s.total > 0 && s.read === s.total && s.openFlags.length === 0).length;
  const notStartedCount = summaries.filter((s) => s.total > 0 && s.read === 0).length;

  const inProgress = summaries
    .filter((s) => s.total > 0 && s.read < s.total)
    .sort((a, b) => b.read / (b.total || 1) - a.read / (a.total || 1));
  const continueTarget = inProgress[0];

  const name = profile.full_name?.trim().split(/\s+/)[0] || "there";
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg",
  });
  const monthLabel = today.toLocaleDateString("en-ZA", { month: "long", timeZone: "Africa/Johannesburg" });
  const roundPct = totalMeters > 0 ? Math.round((totalRead / totalMeters) * 100) : 0;
  const metersLeft = Math.max(totalMeters - totalRead, 0);

  return (
    <AdminPage width="wide">
      <header className="flex flex-col gap-5 bg-navy-900 px-5 pb-6 pt-[calc(env(safe-area-inset-top)+20px)] text-white lg:mx-4 lg:rounded-3xl lg:px-8 lg:py-8">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <div className="flex items-center gap-2.5">
            <Image src="/icons/icon-192.png" alt="" width={34} height={34} className="rounded-[10px]" />
            <span className="text-sm font-semibold text-white/85">Wayne&apos;s Meter Readings</span>
          </div>
          <div className="flex items-center gap-2">
            <InstallPrompt />
            <Link
              href="/admin/more"
              aria-label="Your account and menu"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.12] text-sm font-bold"
            >
              {name.charAt(0).toUpperCase()}
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-white/70">{dateLabel}</p>
            <h1 className="mt-1 text-[26px] font-extrabold tracking-tight lg:text-3xl">Hi {name}</h1>
          </div>

          <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.08] p-4 lg:w-[420px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-semibold">{monthLabel} round</span>
              <span className="font-mono text-[15px] font-bold tabular-nums">
                {totalRead} / {totalMeters} meters
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-white/15"
              role="progressbar"
              aria-label={`${monthLabel} round progress`}
              aria-valuenow={roundPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-[#6cc04a]" style={{ width: `${roundPct}%` }} />
            </div>
            <span className="text-[13px] text-white/75">
              {metersLeft === 0
                ? "Every meter has been read this round"
                : `${metersLeft} meter${metersLeft === 1 ? "" : "s"} left across ${properties.length} propert${properties.length === 1 ? "y" : "ies"}`}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4 py-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-8 lg:py-8">
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-text-body">Next up</h2>

          {continueTarget && (
            <Link
              href={`/capture/${continueTarget.property.id}`}
              className="flex items-center gap-3.5 rounded-2xl bg-navy-700 p-4 text-white transition-colors hover:bg-navy-900"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.14]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold">
                  {continueTarget.read === 0 ? "Start" : "Continue"} {continueTarget.property.name}
                </span>
                <span className="mt-0.5 block text-[13px] text-white/80">
                  {continueTarget.total - continueTarget.read} meter{continueTarget.total - continueTarget.read === 1 ? "" : "s"} left
                </span>
              </span>
            </Link>
          )}

          {allOpenFlags.length > 0 ? (
            <Link
              href="/admin/review"
              className="flex items-center gap-3.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900 transition-colors hover:border-amber-600"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fbe8c6]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="var(--amber-800)" strokeWidth="2" />
                  <path d="M12 7.5v5.5M12 16.5v.5" stroke="var(--amber-800)" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">
                  {allOpenFlags.length} reading{allOpenFlags.length === 1 ? "" : "s"} to review
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#7a5410]">
                  {allOpenFlags
                    .slice(0, 2)
                    .map((f) => `${f.meter.label} ${FLAG_LABEL[f.reading.flag_status] ?? "needs a second look"}`)
                    .join("; ")}
                  {allOpenFlags.length > 2 ? `, and ${allOpenFlags.length - 2} more` : ""}
                </span>
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                <path d="M9 6l6 6-6 6" stroke="var(--amber-800)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : (
            <div className="flex items-center gap-3.5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3.5 text-[15px] font-semibold text-[#2e6b1d]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Nothing waiting for review
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-border bg-surface p-3.5">
              <p className="text-[13px] font-semibold text-[#5d6c80]">Complete</p>
              <p className="mt-1 font-mono text-2xl font-bold text-navy-900 tabular-nums">{completeCount}</p>
              <p className="text-xs text-[#5d6c80]">fully read, no flags</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-3.5">
              <p className="text-[13px] font-semibold text-[#5d6c80]">Not started</p>
              <p className="mt-1 font-mono text-2xl font-bold text-navy-900 tabular-nums">{notStartedCount}</p>
              <p className="text-xs text-[#5d6c80]">no meters read yet</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-text-body">Properties this round</h2>
            <Link href="/admin/clients" className="text-sm font-semibold text-navy-700 hover:text-navy-900">
              Manage
            </Link>
          </div>

          {summaries.map((s) => {
            const pct = s.total > 0 ? Math.round((s.read / s.total) * 100) : 0;
            const complete = s.total > 0 && s.read === s.total && s.openFlags.length === 0;
            const blocked = s.openFlags.length > 0;
            const href = complete
              ? `/admin/reports?property=${s.property.id}`
              : blocked
                ? "/admin/review"
                : `/capture/${s.property.id}`;
            const chip = complete
              ? { text: "Complete", cls: "bg-[#e6f2df] text-[#2e6b1d]" }
              : blocked
                ? { text: `${s.openFlags.length} to review`, cls: "bg-amber-50 text-[#7a5410]" }
                : s.read === 0
                  ? { text: "Not started", cls: "bg-divider text-text-body" }
                  : { text: "In progress", cls: "bg-divider text-text-body" };
            return (
              <Link
                key={s.property.id}
                href={href}
                className={`flex flex-col gap-2.5 rounded-2xl border px-4 py-3.5 transition-colors hover:border-border-strong ${
                  complete ? "border-green-200 bg-green-50" : "border-border bg-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-navy-900">{s.property.name}</p>
                    <p className="mt-0.5 truncate text-[13px] text-[#5d6c80]">
                      {s.clientName} · {s.total} meter{s.total === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${chip.cls}`}>{chip.text}</span>
                </div>
                {s.total > 0 && !complete && (
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-divider">
                      <div className={`h-full rounded-full ${blocked ? "bg-amber-600" : "bg-green-700"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-[13px] font-bold text-text-body tabular-nums">
                      {s.read}/{s.total}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}

          {summaries.length === 0 && (
            <p className="rounded-2xl border border-border bg-surface px-4 py-4 text-[15px] text-text-body">
              No properties yet.{" "}
              <Link href="/admin/clients" className="font-semibold text-navy-700 underline">
                Add a client and property
              </Link>
              .
            </p>
          )}
        </section>
      </div>

      <BottomNav />
    </AdminPage>
  );
}
