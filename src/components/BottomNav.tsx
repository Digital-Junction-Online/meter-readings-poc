"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/browser";

type IconProps = { className?: string };

const HomeIcon = ({ className }: IconProps) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
const ReviewIcon = ({ className }: IconProps) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M5 4h14v16l-7-4-7 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
const CameraIcon = ({ className }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const ClientsIcon = ({ className }: IconProps) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M4 20V8l8-4 8 4v12M9 20v-6h6v6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
const MenuIcon = ({ className }: IconProps) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const ReportsIcon = ({ className }: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const QuotesIcon = ({ className }: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9 12h7M9 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const AddOnsIcon = ({ className }: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const UsersIcon = ({ className }: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3.2 3.2 0 0 1 0 5M17.5 19a5.5 5.5 0 0 0-2-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const SettingsIcon = ({ className }: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const MENU_PATHS = ["/admin/more", "/admin/reports", "/admin/quotes", "/admin/users", "/admin/settings"];

const isHome = (p: string) => p === "/admin";
const isReview = (p: string) => p.startsWith("/admin/review");
const isCapture = (p: string) => p.startsWith("/capture");
const isClients = (p: string) => p.startsWith("/admin/clients");
const isMenu = (p: string) => MENU_PATHS.some((m) => p.startsWith(m));

/** Open review flags, counted client-side so every page gets the badge
 * without each one having to query and pass it in. */
function useReviewCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("meter_readings")
      .select("id", { count: "exact", head: true })
      .neq("flag_status", "ok")
      .is("reviewed_at", null)
      .then(({ count: c }) => {
        if (!cancelled) setCount(c ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

/** Add-on requests waiting on payment, badged the same way as review flags so
 * a request can't sit unnoticed until the client chases it. */
function useAddOnCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("client_features")
      .select("id", { count: "exact", head: true })
      .eq("status", "requested")
      .then(({ count: c }) => {
        if (!cancelled) setCount(c ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

function Badge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`rounded-full bg-amber-600 px-1.5 font-mono text-[10px] font-bold leading-[16px] text-white tabular-nums ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Height reserved at the bottom of phone layouts for the tab bar. */
export const BOTTOMNAV_H = "84px";

export function BottomNav({ cta }: { cta?: ReactNode }) {
  const pathname = usePathname();
  const reviewCount = useReviewCount();
  const addOnCount = useAddOnCount();

  const tab = (active: boolean) =>
    `flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-xs ${
      active ? "font-bold text-navy-700" : "font-semibold text-[#5d6c80] hover:text-navy-900"
    }`;

  return (
    <>
      {/* Phone and small tablet: bottom tab bar. */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md flex-col bg-surface lg:hidden">
        {cta && <div className="border-t border-border px-4 pb-2 pt-3">{cta}</div>}
        <nav
          aria-label="Main"
          className="flex items-end border-t border-border px-2 pt-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
        >
          <Link href="/admin" aria-current={isHome(pathname) ? "page" : undefined} className={tab(isHome(pathname))}>
            <HomeIcon />
            Home
          </Link>
          <Link href="/admin/review" aria-current={isReview(pathname) ? "page" : undefined} className={tab(isReview(pathname))}>
            <span className="relative">
              <ReviewIcon />
              <Badge count={reviewCount} className="absolute -right-3 -top-1.5" />
            </span>
            Review
          </Link>
          <Link
            href="/capture"
            aria-current={isCapture(pathname) ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-1 text-xs font-bold text-navy-700"
          >
            <span className="-mt-7 flex h-14 w-14 items-center justify-center rounded-[18px] bg-navy-700 text-white shadow-[0_6px_16px_rgba(20,56,110,0.35)]">
              <CameraIcon />
            </span>
            Capture
          </Link>
          <Link href="/admin/clients" aria-current={isClients(pathname) ? "page" : undefined} className={tab(isClients(pathname))}>
            <ClientsIcon />
            Clients
          </Link>
          <Link href="/admin/more" aria-current={isMenu(pathname) ? "page" : undefined} className={tab(isMenu(pathname))}>
            <MenuIcon />
            Menu
          </Link>
        </nav>
      </div>

      {/* Desktop: the same destinations as a sidebar, with the menu's
          sections spelled out since there's room. */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 overflow-y-auto bg-navy-900 px-4 py-6 text-white lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-2">
          <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="rounded-[10px]" />
          <span className="text-[15px] font-bold">Meter Readings</span>
        </Link>
        <Link
          href="/capture"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#6cc04a] text-[15px] font-extrabold text-navy-900 hover:bg-[#7dcc5c]"
        >
          <CameraIcon className="h-5 w-5" />
          Capture readings
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          <SideGroup label="Daily work" />
          <SideLink href="/admin" active={isHome(pathname)} icon={<HomeIcon className="h-5 w-5" />}>
            Home
          </SideLink>
          <SideLink href="/admin/review" active={isReview(pathname)} icon={<ReviewIcon className="h-5 w-5" />}>
            Review
            <Badge count={reviewCount} className="ml-auto px-2 text-xs leading-5" />
          </SideLink>
          <SideLink href="/admin/reports" active={pathname.startsWith("/admin/reports")} icon={<ReportsIcon className="h-5 w-5" />}>
            Reports
          </SideLink>
          <SideGroup label="Customers" />
          <SideLink href="/admin/clients" active={isClients(pathname)} icon={<ClientsIcon className="h-5 w-5" />}>
            Clients &amp; properties
          </SideLink>
          <SideLink href="/admin/quotes" active={pathname.startsWith("/admin/quotes")} icon={<QuotesIcon className="h-5 w-5" />}>
            Quotes
          </SideLink>
          <SideLink href="/admin/add-ons" active={pathname.startsWith("/admin/add-ons")} icon={<AddOnsIcon className="h-5 w-5" />}>
            Add-ons
            <Badge count={addOnCount} className="ml-auto px-2 text-xs leading-5" />
          </SideLink>
          <SideGroup label="Admin" />
          <SideLink href="/admin/users" active={pathname.startsWith("/admin/users")} icon={<UsersIcon className="h-5 w-5" />}>
            Users &amp; access
          </SideLink>
          <SideLink href="/admin/settings" active={pathname.startsWith("/admin/settings")} icon={<SettingsIcon className="h-5 w-5" />}>
            Settings
          </SideLink>
        </nav>
      </aside>

      {/* Desktop keeps a page's main call to action, docked bottom-right. */}
      {cta && <div className="no-print fixed bottom-6 right-6 z-20 hidden w-[360px] lg:block">{cta}</div>}
    </>
  );
}

function SideGroup({ label }: { label: string }) {
  return (
    <span className="px-3 pb-1.5 pt-4 text-xs font-bold uppercase tracking-[0.08em] text-white/55 first:pt-1.5">{label}</span>
  );
}

function SideLink({ href, active, icon, children }: { href: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] ${
        active ? "bg-white/[0.12] font-bold text-white" : "font-semibold text-white/85 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
