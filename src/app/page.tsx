import Image from "next/image";
import Link from "next/link";
import { ExitGuard } from "@/components/ExitGuard";
import { getProfile } from "@/lib/auth";

const FEATURES = [
  {
    text: "Every reading backed by a photo",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke="#6cc04a" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="12" cy="13" r="3.5" stroke="#6cc04a" strokeWidth="2" />
      </svg>
    ),
  },
  {
    text: "Leaks and unusual use flagged early",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3s7 7.5 7 12a7 7 0 1 1-14 0c0-4.5 7-12 7-12Z" stroke="#7fb4ea" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    text: "Monthly reports you can download",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6z" stroke="#f0b35c" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 12h7M9 16h5" stroke="#f0b35c" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

const ARROW = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PRIMARY =
  "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#6cc04a] px-5 text-[17px] font-extrabold text-navy-900 transition-colors hover:bg-[#7dcc5c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const SECONDARY =
  "flex min-h-14 w-full items-center justify-center rounded-2xl border border-white/25 px-5 text-base font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export default async function Home() {
  const profile = await getProfile();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <main className="relative flex min-h-screen w-full flex-col overflow-hidden bg-navy-900 text-white">
      <ExitGuard />
      <svg
        width="420"
        height="420"
        viewBox="0 0 420 420"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-28 opacity-20 lg:-right-10 lg:top-10 lg:h-[640px] lg:w-[640px]"
      >
        <circle cx="210" cy="210" r="200" stroke="#6cc04a" strokeWidth="2" />
        <circle cx="210" cy="210" r="150" stroke="#4b8fd6" strokeWidth="2" />
        <circle cx="210" cy="210" r="100" stroke="#6cc04a" strokeWidth="2" strokeDasharray="6 10" />
      </svg>

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-12 lg:max-w-xl lg:justify-center">
        <Image
          src="/icons/source-icon.png"
          alt="Wayne's Meter Readings logo"
          width={96}
          height={96}
          priority
          className="rounded-3xl shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        />

        <div className="mt-7">
          <p className="text-sm font-bold uppercase tracking-[0.08em]">
            <span className="text-white">Wayne&apos;s</span> <span className="text-[#6cc04a]">Meter Readings</span>
          </p>
          <h1 className="mt-2.5 text-[34px] font-extrabold leading-[1.1] tracking-tight lg:text-5xl">
            {firstName ? (
              <>Welcome back, {firstName}.</>
            ) : (
              <>
                Meter readings,
                <br />
                made simple.
              </>
            )}
          </h1>
          <p className="mt-3.5 text-base leading-relaxed text-white/80">
            See your property&apos;s electricity and water use each month, with a photo of every meter.
          </p>
        </div>

        <ul className="mt-7 flex flex-col gap-3.5">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-3 text-[15px]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08]">{f.icon}</span>
              {f.text}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-col gap-3 pt-10 lg:mt-10">
          {!profile && (
            <>
              <Link href="/login" className={PRIMARY}>
                Sign in {ARROW}
              </Link>
              <p className="text-center text-sm leading-relaxed text-white/75">
                Got an invite? Open the link in your email to set up your account.
              </p>
            </>
          )}

          {profile?.role === "admin" && (
            <>
              <Link href="/admin" className={PRIMARY}>
                Go to dashboard {ARROW}
              </Link>
              <Link href="/capture" className={SECONDARY}>
                Capture readings
              </Link>
            </>
          )}

          {profile?.role === "client" && (
            <Link href="/client" className={PRIMARY}>
              View my readings {ARROW}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
