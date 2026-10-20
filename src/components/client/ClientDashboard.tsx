"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { AlertsFeed } from "@/components/AlertsFeed";
import { AddOnsPanel } from "@/components/client/AddOnsPanel";
import { ReadingsExplorer } from "@/components/client/ReadingsExplorer";
import { UnitInsights } from "@/components/client/UnitInsights";
import { UsageCard } from "@/components/client/UsageCard";
import type { ReadingRow } from "@/components/ReadingsTable";
import { buildServiceSummary, formatDay, openIssueIds, unitTitle } from "@/lib/clientReport";
import { HISTORY_FEATURE, type FeatureStatus } from "@/lib/features";

export interface ClientDashboardProps {
  propertyName: string;
  properties: { id: string; name: string }[];
  activePropertyId: string;
  /** Where the property switcher links to: "/client", or the preview route. */
  basePath: string;
  settingsHref?: string;
  greetingName: string | null;
  /** The client company, for "Prepared for" on the downloaded report. */
  clientName?: string | null;
  /** Every reading (and meter-replacement marker) for this property, newest first. */
  rows: ReadingRow[];
  /** The client record add-ons are requested against; null in preview. */
  clientId?: string | null;
  /** Current add-on status per feature key. Absent means never requested. */
  featureStatuses?: Record<string, FeatureStatus>;
}

type Tab = "readings" | "notices" | "insights" | "addons";

const InsightsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const AddOnsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const ReadingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 5h14M5 10h14M5 15h9M5 20h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const NoticesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z M10 20h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

export function ClientDashboard({
  propertyName,
  properties,
  activePropertyId,
  basePath,
  settingsHref,
  greetingName,
  clientName,
  rows,
  clientId = null,
  featureStatuses = {},
}: ClientDashboardProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("readings");
  /** Set when a unit is tapped in Insights, to pre-filter the readings list. */
  const [unitFilter, setUnitFilter] = useState("");
  const hasInsights = featureStatuses.usage_insights === "active";
  const hasHistory = featureStatuses[HISTORY_FEATURE] === "active";
  const openIds = useMemo(() => openIssueIds(rows), [rows]);
  const summaries = useMemo(
    () => (["electricity", "water"] as const).map((s) => buildServiceSummary(rows, s)).filter((s) => s.latest),
    [rows]
  );
  const noticeRows = useMemo(
    () => rows.filter((r) => r.kind === "replacement" || openIds.has(r.id)),
    [rows, openIds]
  );
  const latestTaken = useMemo(() => {
    let latest: string | null = null;
    for (const r of rows) {
      if (r.kind === "replacement") continue;
      if (latest === null || r.captured_at > latest) latest = r.captured_at;
    }
    return latest;
  }, [rows]);
  const firstOpen = useMemo(() => rows.find((r) => openIds.has(r.id)) ?? null, [rows, openIds]);

  const firstName = greetingName?.trim().split(/\s+/)[0];
  const tabs: { key: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { key: "readings", label: "Readings", icon: <ReadingsIcon /> },
    { key: "notices", label: "Notices", icon: <NoticesIcon />, badge: openIds.size },
    // Only on the dashboard once it has been paid for and switched on.
    ...(hasInsights ? [{ key: "insights" as const, label: "Insights", icon: <InsightsIcon /> }] : []),
    { key: "addons", label: "Add-ons", icon: <AddOnsIcon /> },
  ];

  /** Nav taps clear a unit filter set from Insights, so the readings list
   *  never opens silently narrowed to one unit. */
  function goTo(next: Tab) {
    setUnitFilter("");
    show(next);
  }

  function show(next: Tab) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen w-full bg-app-bg pb-28 lg:pb-16">
      <header className="bg-navy-900 text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+18px)] lg:px-8 lg:pt-5">
          <div className="flex items-center gap-3">
            <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="hidden rounded-[10px] lg:block" />
            <nav aria-label="Dashboard sections" className="hidden flex-1 gap-1 lg:flex">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => goTo(t.key)}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-[10px] px-3.5 text-[15px] ${
                    tab === t.key ? "bg-white/[0.12] font-bold text-white" : "font-semibold text-white/80 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {t.label}
                  {!!t.badge && (
                    <span className="rounded-full bg-amber-600 px-1.5 font-mono text-xs font-bold leading-5 text-white">{t.badge}</span>
                  )}
                </button>
              ))}
            </nav>

            {properties.length > 1 ? (
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/10 px-3 lg:max-w-xs lg:flex-none">
                <span className="sr-only">Property</span>
                <select
                  value={activePropertyId}
                  onChange={(e) => router.push(`${basePath}?property=${e.target.value}`)}
                  className="min-w-0 flex-1 appearance-none bg-transparent text-[15px] font-bold text-white outline-none [&>option]:text-navy-900"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>
            ) : (
              <p className="min-w-0 flex-1 truncate text-[15px] font-bold lg:flex-none">{propertyName}</p>
            )}

            {settingsHref && (
              <Link
                href={settingsHref}
                aria-label="Account and settings"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-sm font-bold hover:bg-white/20"
              >
                {(firstName ?? "?").charAt(0).toUpperCase()}
              </Link>
            )}
          </div>

          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight lg:text-3xl">{firstName ? `Hi ${firstName}` : "Welcome"}</h1>
            <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-white/80">
              {latestTaken
                ? `${propertyName}: the latest readings were taken on ${formatDay(latestTaken)}.`
                : `Your electricity and water readings for ${propertyName} will appear here.`}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4 px-4 py-5 lg:px-8 lg:py-8">
        {tab === "readings" && (
          <>
            {firstOpen && (
              <button
                type="button"
                onClick={() => show("notices")}
                className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-left text-[#5e3f0a] hover:border-amber-600"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-amber-800">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 7.5v5.5M12 16.5v.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                <span className="min-w-0 flex-1 text-[15px] leading-snug">
                  <strong>
                    {openIds.size === 1
                      ? `${unitTitle(firstOpen.unit_number)} ${firstOpen.service} is being checked.`
                      : `${openIds.size} readings are being checked.`}
                  </strong>{" "}
                  See notices
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <ReadingsExplorer
              // Remounting is how a unit tapped in Insights pre-fills the
              // search, without an effect syncing two copies of the query.
              key={`readings-${unitFilter}`}
              propertyName={propertyName}
              clientName={clientName}
              rows={rows}
              openIds={openIds}
              canSeeHistory={hasHistory}
              onAskForHistory={() => show("addons")}
              initialQuery={unitFilter}
            />
          </>
        )}

        {tab === "insights" && (
          <section className="flex flex-col gap-4" aria-label="Usage insights">
            <div>
              <h2 className="text-lg font-extrabold text-navy-900">Usage insights</h2>
              <p className="text-sm text-[#5d6c80]">How {propertyName} is using electricity and water</p>
            </div>
            {summaries.length > 0 ? (
              <>
                <div className={`grid grid-cols-1 gap-4 ${summaries.length > 1 ? "md:grid-cols-2" : ""}`}>
                  {summaries.map((s) => (
                    <UsageCard key={s.service} summary={s} />
                  ))}
                </div>
                <div className={`grid grid-cols-1 gap-4 ${summaries.length > 1 ? "md:grid-cols-2" : ""}`}>
                  {summaries.map((s) => (
                    <UnitInsights
                      key={s.service}
                      rows={rows}
                      summary={s}
                      onOpenUnit={(unitNumber) => {
                        setUnitFilter(unitNumber);
                        show("readings");
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-center text-[15px] text-text-body">
                Your usage will show here after the first two meter rounds.
              </p>
            )}
          </section>
        )}

        {tab === "addons" && (
          <AddOnsPanel clientId={clientId} statuses={featureStatuses} canRequest={!!clientId} />
        )}

        {tab === "notices" && (
          <section className="flex flex-col gap-3" aria-label="Notices">
            <div>
              <h2 className="text-lg font-extrabold text-navy-900">Notices</h2>
              <p className="text-sm text-[#5d6c80]">Things worth knowing about {propertyName}</p>
            </div>
            <AlertsFeed rows={noticeRows} />
          </section>
        )}
      </div>

      <nav
        aria-label="Dashboard sections"
        className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-surface px-2 pt-2 lg:hidden"
        style={{
          // Tab count varies: Insights only appears once it's been paid for.
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => goTo(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs ${
              tab === t.key ? "font-bold text-navy-700" : "font-semibold text-[#5d6c80]"
            }`}
          >
            <span className="relative">
              {t.icon}
              {!!t.badge && (
                <span className="absolute -right-3 -top-1.5 rounded-full bg-amber-600 px-1.5 font-mono text-[10px] font-bold leading-4 text-white">
                  {t.badge}
                </span>
              )}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
