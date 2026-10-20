import { redirect } from "next/navigation";
import { getProfile, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/SettingsForm";
import { LogoutButton } from "@/components/LogoutButton";
import { BottomNav } from "@/components/BottomNav";
import { AdminPage, AdminSubHeader } from "@/components/AdminPage";
import { AdminInviteManager } from "@/components/AdminInviteManager";
import { HapticsToggle } from "@/components/HapticsToggle";
import type { AdminInvite } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/admin/settings");
  if (profile.role !== "admin") redirect("/client");
  const user = await getSessionUser();

  const supabase = await createClient();
  const { data: inviteRows } = await supabase
    .from("admin_invites")
    .select("*")
    .order("created_at", { ascending: false });
  const adminInvites = (inviteRows ?? []) as AdminInvite[];

  return (
    <AdminPage>
      <AdminSubHeader title="Settings" description="Your profile and password, the app on this device, and admin access." />

      <div className="flex flex-col gap-5 px-4 py-4">
        {user && <SettingsForm userId={user.id} email={user.email ?? ""} fullName={profile.full_name} />}

        <div className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-base font-bold text-navy-900">On this device</h2>
          <HapticsToggle />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-base font-bold text-navy-900">Business</h2>
          <p className="mt-1 text-[15px] text-text-body">Wayne&rsquo;s Meter Readings</p>
          <p className="text-[13px] text-[#5d6c80]">Meter Readings app</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-base font-bold text-navy-900">Admin access</h2>
          <p className="mt-1 mb-3 text-[13px] text-[#5d6c80]">
            Invite another admin — they&rsquo;ll get the same full access you have.
          </p>
          <AdminInviteManager invites={adminInvites} />
        </div>

        <LogoutButton className="flex min-h-[50px] w-full items-center justify-center rounded-2xl border-[1.5px] border-border-strong bg-surface text-[15px] font-bold text-[#9a3412] hover:bg-app-bg" />
      </div>

      <BottomNav />
    </AdminPage>
  );
}
