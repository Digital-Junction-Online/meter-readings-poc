"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const FIELD =
  "h-[52px] w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 text-base font-medium text-navy-900 outline-none transition-colors placeholder:text-text-faint focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redirectByRole() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "client";
    const isAllowedNext =
      !!next && (role === "admin" ? next.startsWith("/admin") || next.startsWith("/capture") : next.startsWith("/client"));
    const destination = isAllowedNext ? next! : role === "admin" ? "/admin" : "/client";
    router.push(destination);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || null } },
        });
        if (signUpError) throw signUpError;
      }
      await redirectByRole();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full flex-col bg-white lg:items-center lg:justify-center lg:bg-app-bg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-6 lg:flex-none lg:rounded-3xl lg:border lg:border-border lg:bg-white lg:px-10 lg:py-10 lg:shadow-sm">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-navy-700 hover:text-navy-900"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </Link>

        <div className="mt-6 flex flex-col items-center gap-3.5 text-center">
          <Image src="/icons/source-icon.png" alt="Wayne's Meter Readings logo" width={80} height={80} className="rounded-[20px]" priority />
          <div>
            <h1 className="text-[26px] font-extrabold text-navy-900">
              {mode === "signin" ? "Meter Readings" : "Create an admin account"}
            </h1>
            <p className="mt-1.5 text-[15px] text-text-muted">Wayne&apos;s Meter Readings</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-4">
          {mode === "signup" && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy-900">
              Full name
              <input type="text" className={FIELD} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy-900">
            Email
            <input
              type="email"
              required
              className={FIELD}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy-900">
            Password
            <input
              type="password"
              required
              minLength={6}
              className={FIELD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl border border-red-600/30 bg-red-600/[0.06] px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 min-h-[54px] w-full rounded-2xl bg-navy-700 text-base font-bold text-white transition-colors hover:bg-navy-900 disabled:opacity-60"
          >
            {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            className="min-h-11 text-center text-sm font-medium text-text-muted underline-offset-2 hover:text-navy-900 hover:underline"
          >
            {mode === "signin" ? "Need an admin account? Sign up" : "Already have an account? Sign in"}
          </button>
        </form>

        <div className="mt-auto rounded-2xl bg-app-bg px-4 py-3.5 text-sm leading-relaxed text-text-body lg:mt-8">
          <strong className="text-navy-900">First time here?</strong> Open the invite link in your email to set your password.
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
