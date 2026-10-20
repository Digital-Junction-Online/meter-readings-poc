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
export async function requestFeature(clientId: string, featureKey: string) {
  const profile = await getProfile();
  if (!profile) throw new Error("Please sign in again.");
  if (!isFeatureKey(featureKey)) throw new Error("Unknown add-on.");

  const addOn = ADD_ON_BY_KEY[featureKey];
  const user = await getSessionUser();
  const supabase = await createClient();

  // RLS limits this to a client the signed-in user actually has access to,
  // and to a status of 'requested'.
  const { error } = await supabase.from("client_features").upsert(
    {
      client_id: clientId,
      feature_key: featureKey,
      status: "requested",
      price_cents: addOn.priceRand * 100,
      requested_by: user?.id ?? null,
      requested_at: new Date().toISOString(),
    },
    { onConflict: "client_id,feature_key" }
  );
  if (error) throw new Error(error.message);

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
    } catch {
      // Swallowed deliberately — see comment above.
    }
  }

  revalidatePath("/client");
  revalidatePath("/admin/add-ons");
}
