import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { buildReportRows } from "@/lib/report";
import { latestMonthKey } from "@/lib/clientReport";
import { isEmailConfigured } from "@/lib/email/brevo";
import { ReadingsTable } from "@/components/ReadingsTable";
import { ReportControls } from "@/components/ReportControls";
import { ReportDashboard } from "@/components/ReportDashboard";
import { EmailReportButton } from "@/components/EmailReportButton";
import { ComingSoon } from "@/components/ComingSoon";
import { BottomNav } from "@/components/BottomNav";
import { AdminPage } from "@/components/AdminPage";
import { AdminReportDownload } from "@/components/AdminReportDownload";
import type { Client, Property, Service } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    property?: string;
    all?: string;
    from?: string;
    to?: string;
    unit?: string;
    service?: string;
  }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/admin/reports");
  if (profile.role !== "admin") redirect("/client");

  const { property: selectedPropertyId, from, to, unit, service, all } = await searchParams;
  const hasFilters = !!(from || to || unit || service || all);

  const supabase = await createClient();
  const { data: propertyRows } = await supabase.from("properties").select("*").order("name");
  const properties = (propertyRows ?? []) as Property[];

  const { data: clientRows } = await supabase.from("clients").select("*").order("name");
  const clients = (clientRows ?? []) as Client[];
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const activePropertyId = selectedPropertyId || properties[0]?.id;
  const activeProperty = properties.find((p) => p.id === activePropertyId);
  const activeClient = activeProperty ? clientById.get(activeProperty.client_id) : undefined;

  // The table only shows something once at least one filter is set — the
  // KPI cards/charts below still use the full unfiltered history regardless.
  const dashboardRows = activePropertyId ? await buildReportRows(activePropertyId) : [];
  const rows =
    activePropertyId && hasFilters
      ? await buildReportRows(activePropertyId, {
          from,
          to,
          unitNumber: unit,
          service: service as Service | undefined,
        })
      : [];

  const latestMonthWithReadings = latestMonthKey(dashboardRows);
  const readingRows = dashboardRows.filter((r) => r.kind !== "replacement");
  const flaggedRows = readingRows.filter((r) => r.flag_status !== "ok");

  return (
    <AdminPage width="wide">
      <header className="no-print flex flex-col gap-3.5 border-b border-border bg-surface px-5 pb-4 pt-[calc(env(safe-area-inset-top)+20px)] lg:mx-4 lg:rounded-2xl lg:border lg:pt-5">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">Reports</h1>
          {activeClient && (
            <p className="mt-1 text-sm text-[#5d6c80]">
              {activeProperty?.name} · {activeClient.name}
            </p>
          )}
        </div>
        {properties.length > 1 && (
          <nav aria-label="Property" className="flex gap-2 overflow-x-auto pb-1">
            {properties.map((p) => (
              <Link
                key={p.id}
                href={`/admin/reports?property=${p.id}`}
                aria-current={p.id === activePropertyId ? "page" : undefined}
                className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border-[1.5px] px-4 py-2.5 text-sm ${
                  p.id === activePropertyId
                    ? "border-navy-700 bg-navy-700 font-bold text-white"
                    : "border-border-strong bg-surface font-semibold text-navy-900 hover:border-navy-700"
                }`}
              >
                {p.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <h1 className="hidden text-lg font-bold text-navy-900 print:block">{activeProperty?.name} · meter readings</h1>

      <div className="flex flex-col gap-5 px-4 py-5">
        {properties.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-4 text-[15px] text-text-body">
            No properties yet.{" "}
            <Link href="/admin/clients" className="font-semibold text-navy-700 underline">
              Add a client and property
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
            <aside className="no-print flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
              <h2 className="text-base font-bold text-navy-900">Share this report</h2>
              {activeProperty && (
                <AdminReportDownload
                  propertyId={activeProperty.id}
                  propertyName={activeProperty.name}
                  clientName={activeClient?.name ?? null}
                  filters={{ from, to, unit, service }}
                />
              )}
              {activeProperty && activeClient && (
                <div className="border-t border-divider pt-4">
                  {isEmailConfigured() ? (
                    <EmailReportButton
                      propertyId={activeProperty.id}
                      clientName={activeClient.name}
                      contactEmail={activeClient.contact_email}
                      filters={{ from, to, unit, service }}
                    />
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
                      <p className="font-bold">Email isn&apos;t connected</p>
                      <p className="mt-1">
                        Set <code className="font-mono text-xs">BREVO_API_KEY</code> to email reports from
                        support@wmfixandfinish.co.za.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {flaggedRows.length > 0 && (
                <Link
                  href="/admin/review"
                  className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-[#7a5410] hover:border-amber-600"
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-amber-900">
                      {flaggedRows.length} reading{flaggedRows.length === 1 ? "" : "s"} flagged
                    </strong>
                    Check them in Review before sending.
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              )}
              <ComingSoon label="Cost & tariffs" />
            </aside>

            <ReportDashboard rows={dashboardRows} />
          </div>
        )}

        {activeProperty && (
          <section className="flex flex-col gap-3">
            <h2 className="no-print text-lg font-extrabold text-navy-900">Find readings</h2>
            <ReportControls hasResults={rows.length > 0} latestMonth={latestMonthWithReadings} />
            <ReadingsTable rows={rows} />
          </section>
        )}
      </div>

      <BottomNav />
    </AdminPage>
  );
}
