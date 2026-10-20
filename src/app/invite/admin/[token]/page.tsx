"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { use as usePromise } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function AdminInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("get_admin_invite_preview", { p_token: token })
      .then(({ data, error: rpcError }) => {
        setValid(!rpcError && !!data && data.length > 0 && data[0].valid);
        setLoading(false);
      });
  }, [token]);

  async function redeemAndRedirect() {
    const supabase = createClient();
    const { error: redeemError } = await supabase.rpc("redeem_admin_invite", { p_token: token });
    if (redeemError) {
      throw new Error("This invite link is no longer valid. Please ask for a new one.");
    }
    router.push("/admin");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || null } },
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      await redeemAndRedirect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-3 bg-white px-5 py-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-navy-700" />
      </main>
    );
  }

  if (!valid) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-3 bg-white px-5 py-6 text-center">
        <p className="rounded-lg border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This invite link is no longer valid. Please ask for a new one.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-white px-5 py-6">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image src="/icons/source-icon.png" alt="Wayne's Meter Readings logo" width={72} height={72} className="rounded-[18px]" priority />
        <h1 className="mt-4 text-[26px] font-extrabold text-navy-900">You&apos;ve been invited as an admin</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-text-body">
          Create an account to get full admin access — readings, clients, reports, everything.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-divider p-1">
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`min-h-11 rounded-[9px] text-sm ${
            mode === "signup" ? "bg-surface font-bold text-navy-900 shadow-[0_1px_3px_rgba(12,31,61,0.12)]" : "font-semibold text-[#5d6c80]"
          }`}
        >
          Sign up
        </button>
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`min-h-11 rounded-[9px] text-sm ${
            mode === "signin" ? "bg-surface font-bold text-navy-900 shadow-[0_1px_3px_rgba(12,31,61,0.12)]" : "font-semibold text-[#5d6c80]"
          }`}
        >
          Log in instead
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "signup" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy-900">Full name</span>
            <input
              type="text"
              className="h-[52px] w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 text-base font-medium text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-navy-900">Email</span>
          <input
            type="email"
            required
            className="h-[52px] w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 text-base font-medium text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-navy-900">Password</span>
          <input
            type="password"
            required
            minLength={6}
            className="h-[52px] w-full rounded-xl border-[1.5px] border-border-strong bg-white px-3.5 text-base font-medium text-navy-900 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 min-h-[54px] w-full rounded-2xl bg-navy-700 text-base font-bold text-white hover:bg-navy-900 disabled:opacity-60"
        >
          {submitting ? "Please wait..." : mode === "signup" ? "Sign up" : "Log in"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-600/30 bg-red-600/[0.06] px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </main>
  );
}
