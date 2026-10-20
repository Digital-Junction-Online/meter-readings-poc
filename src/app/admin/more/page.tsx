import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { BottomNav } from "@/components/BottomNav";
import { AdminPage } from "@/components/AdminPage";

export const dynamic = "force-dynamic";

const ICON_CLASS = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8eef7] text-navy-700";

const ICONS = {
  reports: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  quotes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12h7M9 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  addOns: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3.2 3.2 0 0 1 0 5M17.5 19a5.5 5.5 0 0 0-2-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

interface MenuItem {
  href: string;
  icon: ReactNode;
  label: string;
  sub: string;
}

function MenuGroup({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[13px] font-bold uppercase tracking-[0.06em] text-text-body">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3.5 border-b border-divider px-4 py-3.5 last:border-b-0 hover:bg-app-bg"
          >
            <span className={ICON_CLASS}>{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-navy-900">{item.label}</span>
              <span className="block text-[13px] text-[#5d6c80]">{item.sub}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-text-faint" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function AdminMenuPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/admin/more");
  if (profile.role !== "admin") redirect("/client");

  const [user, supabase] = await Promise.all([getSessionUser(), createClient()]);
  const [{ count: linkedClients }, { count: pendingAddOns }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).not("rebill_client_id", "is", null),
    supabase.from("client_features").select("id", { count: "exact", head: true }).eq("status", "requested"),
  ]);

  const name = profile.full_name?.trim() || "Admin";

  return (
    <AdminPage>
      <header className="flex items-center gap-3.5 border-b border-border bg-surface px-5 pb-5 pt-[calc(env(safe-area-inset-top)+20px)] lg:mx-4 lg:rounded-2xl lg:border lg:pt-5">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-navy-900 text-lg font-extrabold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold text-navy-900">{name}</h1>
          <p className="truncate text-[13px] text-[#5d6c80]">Admin{user?.email ? ` · ${user.email}` : ""}</p>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-4 py-5">
        <MenuGroup
          title="Business"
          items={[
            { href: "/admin/reports", icon: ICONS.reports, label: "Reports", sub: "Usage charts, download and email reports" },
            {
              href: "/admin/quotes",
              icon: ICONS.quotes,
              label: "Quotes",
              sub: `Build and send quotes through Rebill${linkedClients ? ` · ${linkedClients} client${linkedClients === 1 ? "" : "s"} linked` : ""}`,
            },
            {
              href: "/admin/add-ons",
              icon: ICONS.addOns,
              label: "Add-ons",
              sub: pendingAddOns
                ? `${pendingAddOns} request${pendingAddOns === 1 ? "" : "s"} waiting on payment`
                : "Paid extras clients have asked for",
            },
          ]}
        />
        <MenuGroup
          title="Team and app"
          items={[
            { href: "/admin/users", icon: ICONS.users, label: "Users & access", sub: "Add people, admin invites, reset passwords" },
            { href: "/admin/settings", icon: ICONS.settings, label: "Settings", sub: "Profile, password, vibration, install the app" },
          ]}
        />

        <LogoutButton className="flex min-h-[50px] w-full items-center justify-center rounded-2xl border-[1.5px] border-border-strong bg-surface text-[15px] font-bold text-[#9a3412] hover:bg-app-bg" />
      </div>

      <BottomNav />
    </AdminPage>
  );
}
