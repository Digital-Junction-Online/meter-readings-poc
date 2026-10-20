import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSessionUser } from "@/lib/auth";
import { SettingsForm } from "@/components/SettingsForm";
import { HapticsToggle } from "@/components/HapticsToggle";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/client/settings");
  if (profile.role === "admin") redirect("/admin");
  const user = await getSessionUser();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-app-bg lg:max-w-xl lg:pt-8">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)] lg:rounded-2xl lg:border lg:pt-4">
        <Link
          href="/client"
          aria-label="Back to overview"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-app-bg"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="var(--navy-900)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="flex-1 text-xl font-extrabold text-navy-900">Account</h1>
        <InstallPrompt />
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4 lg:px-0">
        {user && <SettingsForm userId={user.id} email={user.email ?? ""} fullName={profile.full_name} />}

        <section className="rounded-2xl border border-border bg-surface p-4">
          <HapticsToggle />
        </section>

        <div className="rounded-2xl bg-[#e8eef7] px-4 py-3.5 text-sm leading-relaxed text-navy-700">
          <strong>Question about a reading?</strong> Contact Wayne&apos;s Meter Readings at{" "}
          <a href="mailto:support@wmfixandfinish.co.za" className="font-bold underline">
            support@wmfixandfinish.co.za
          </a>
          .
        </div>

        <LogoutButton className="mt-auto flex min-h-[50px] w-full items-center justify-center rounded-2xl border-[1.5px] border-border-strong bg-surface text-[15px] font-bold text-[#9a3412] hover:bg-app-bg" />
      </div>
    </main>
  );
}
