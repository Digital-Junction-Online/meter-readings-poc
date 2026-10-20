import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { buildReportRows } from "@/lib/report";
import { ClientDashboard } from "@/components/client/ClientDashboard";
import { LogoutButton } from "@/components/LogoutButton";
import { GaugeIcon } from "@/components/icons";
import type { Property } from "@/lib/types";
import type { FeatureStatus } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/client");
  if (profile.role === "admin") redirect("/admin");

  const { property: selectedPropertyId } = await searchParams;

  // RLS scopes this to the properties of the client(s) this user was granted.
  const supabase = await createClient();
  const { data: propertyRows } = await supabase.from("properties").select("*").order("name");
  const properties = (propertyRows ?? []) as Property[];

  if (properties.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 bg-app-bg px-5 py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e8eef7] text-navy-700">
          <GaugeIcon className="h-7 w-7" />
        </div>
        <p className="text-sm text-text-body">
          You don&apos;t have access to any properties yet. Ask Wayne to send you an invite link.
        </p>
        <LogoutButton className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-[#e8eef7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700" />
      </main>
    );
  }

  const active = properties.find((p) => p.id === selectedPropertyId) ?? properties[0];
  const [rows, { data: clientRow }, { data: featureRows }] = await Promise.all([
    buildReportRows(active.id),
    // RLS lets a client user read only their own client record.
    supabase.from("clients").select("name").eq("id", active.client_id).maybeSingle(),
    supabase.from("client_features").select("feature_key, status").eq("client_id", active.client_id),
  ]);

  const featureStatuses = Object.fromEntries(
    ((featureRows ?? []) as { feature_key: string; status: FeatureStatus }[]).map((f) => [
      f.feature_key,
      f.status,
    ])
  );

  return (
    <ClientDashboard
      key={active.id}
      propertyName={active.name}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      activePropertyId={active.id}
      basePath="/client"
      settingsHref="/client/settings"
      greetingName={profile.full_name}
      clientName={(clientRow as { name: string } | null)?.name ?? null}
      rows={rows}
      clientId={active.client_id}
      featureStatuses={featureStatuses}
    />
  );
}
