"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { ADD_ON_BY_KEY, formatRand, isFeatureKey } from "@/lib/features";
import { isEmailConfigured, sendEmail } from "@/lib/email/brevo";

const NOTIFY = "support@wmfixandfinish.co.za";

/**
 * A client asking for a paid add-on. Writes the request and emails Wayne so
 * he can invoice; the feature stays off until he switches it on.
 *
 * The price is read from the catalogue here rather than taken from the
 * browser, so what's recorded is always what we actually quote.
 */
export async function requestFeature(
  clientId: string,
  featureKey: string
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Please sign in again." };
  if (!isFeatureKey(featureKey)) return { ok: false, error: "Unknown add-on." };

  const addOn = ADD_ON_BY_KEY[featureKey];
  const user = await getSessionUser();
  const supabase = await createClient();
  const requestedAt = new Date().toISOString();
  let emailWarning: string | undefined;

  // Deliberately not an upsert. PostgREST turns upsert into
  // INSERT ... ON CONFLICT DO UPDATE SET <every column>, and Postgres checks
  // UPDATE rights on all of them up front — including price_cents, which
  // clients are not granted, so the statement is denied even when no conflict
  // occurs. Insert first, then fall back to updating only what they may write.
  const { error: insertError } = await supabase.from("client_features").insert({
    client_id: clientId,
    feature_key: featureKey,
    status: "requested",
    price_cents: addOn.priceRand * 100,
    requested_by: user?.id ?? null,
    requested_at: requestedAt,
  });

  if (insertError) {
    // 23505 = unique violation: they've asked for this one before.
    if (insertError.code !== "23505") {
      return { ok: false, error: insertError.message };
    }
    const { error: updateError } = await supabase
      .from("client_features")
      .update({ status: "requested", requested_at: requestedAt, requested_by: user?.id ?? null })
      .eq("client_id", clientId)
      .eq("feature_key", featureKey);
    if (updateError) return { ok: false, error: updateError.message };
  }

  const { data: clientRow } = await supabase
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .maybeSingle();
  const clientName = (clientRow as { name: string } | null)?.name ?? "A client";

  // Best effort: the request is already saved, so a mail failure shouldn't
  // make the client think their request didn't go through.
  if (isEmailConfigured()) {
    try {
      await sendEmail({
        to: NOTIFY,
        subject: `Add-on request — ${clientName}: ${addOn.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;max-width:560px;">
            <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#58a93b;">Add-on request</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#64748b;width:120px;">Client</td><td style="padding:6px 0;font-weight:600;">${clientName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Add-on</td><td style="padding:6px 0;font-weight:600;">${addOn.name}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Quoted</td><td style="padding:6px 0;font-weight:600;">${formatRand(addOn.priceRand)} / month</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Requested by</td><td style="padding:6px 0;font-weight:600;">${profile.full_name ?? user?.email ?? "—"}</td></tr>
            </table>
            <p style="margin:18px 0 0;padding:12px 14px;background:#f7f8fa;border-radius:8px;">
              Invoice them, then switch it on under <strong>Admin &rarr; Add-ons</strong>. It stays off until you do.
            </p>
          </div>`,
      });
    } catch (err) {
      // The request is saved either way, so this must not fail the action —
      // but it must not vanish either: a silent failure here means Wayne
      // never hears about a request the client thinks he received.
      emailWarning =
        err instanceof Error && /unrecognised ip|unauthorized/i.test(err.message)
          ? "Saved, but the notification email was blocked by Brevo's IP allowlist. Wayne can still see this under Admin → Add-ons."
          : "Saved, but we couldn't send the notification email. Wayne can still see this under Admin → Add-ons.";
      console.error("Add-on request notification failed:", err);
    }
  } else {
    // No key on this deployment. The request is saved, but nobody is told, so
    // say so rather than promising "Wayne will be in touch".
    emailWarning =
      "Saved, but email isn't set up on the server, so Wayne wasn't notified. He can still see this under Admin → Add-ons.";
  }

  revalidatePath("/client");
  revalidatePath("/admin/add-ons");
  return { ok: true, warning: emailWarning };
}
