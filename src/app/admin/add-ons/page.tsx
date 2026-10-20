import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { AddOnAdminList, type AddOnRow } from "@/components/AddOnAdminList";
import { BottomNav } from "@/components/BottomNav";
import type { FeatureStatus } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function AdminAddOnsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/admin/add-ons");
  if (profile.role !== "admin") redirect("/client");

  const supabase = await createClient();
  const [{ data: featureRows }, { data: clientRows }] = await Promise.all([
    supabase.from("client_features").select("*").order("requested_at", { ascending: false }),
    supabase.from("clients").select("id, name"),
  ]);

  const clientName = new Map(
    ((clientRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );

  const rows: AddOnRow[] = (
    (featureRows ?? []) as {
      client_id: string;
      feature_key: string;
      status: FeatureStatus;
      price_cents: number;
      requested_at: string;
      activated_at: string | null;
    }[]
  ).map((f) => ({
    clientId: f.client_id,
    clientName: clientName.get(f.client_id) ?? "Unknown client",
    featureKey: f.feature_key,
    status: f.status,
    priceCents: f.price_cents,
    requestedAt: f.requested_at,
    activatedAt: f.activated_at,
  }));

  const pending = rows.filter((r) => r.status === "requested").length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-app-bg pb-28">
      <div className="flex items-center gap-3 bg-navy-900 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] text-white">
        <Link
          href="/admin/more"
          aria-label="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">Add-ons</h1>
          <p className="text-[13px] text-white/75">
            {pending > 0 ? `${pending} waiting on payment` : "Nothing waiting on you"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-[13px] leading-relaxed text-text-body">
          Clients request add-ons from their dashboard and you get an email. Invoice them, then switch the
          add-on on here — it only appears on their dashboard once you do.
        </p>
        <AddOnAdminList rows={rows} />
      </div>

      <BottomNav />
    </main>
  );
}
