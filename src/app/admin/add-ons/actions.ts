"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ADD_ON_BY_KEY, formatRand, isFeatureKey } from "@/lib/features";
import { isEmailConfigured, sendEmail } from "@/lib/email/brevo";

/** Switches a paid add-on on for a client, and tells them it's live. */
export async function activateFeature(clientId: string, featureKey: string) {
  const admin = await requireAdmin();
  if (!isFeatureKey(featureKey)) throw new Error("Unknown add-on.");
  const addOn = ADD_ON_BY_KEY[featureKey];
  const supabase = await createClient();

  const { error } = await supabase
    .from("client_features")
    .update({
      status: "active",
      activated_at: new Date().toISOString(),
      activated_by: admin.id,
    })
    .eq("client_id", clientId)
    .eq("feature_key", featureKey);
  if (error) throw new Error(error.message);

  const { data: clientRow } = await supabase
    .from("clients")
    .select("name, contact_email")
    .eq("id", clientId)
    .maybeSingle();
  const client = clientRow as { name: string; contact_email: string | null } | null;

  // Courtesy only — the add-on is already live, so a mail failure must not
  // roll it back or look like the activation failed.
  if (client?.contact_email && isEmailConfigured()) {
    try {
      await sendEmail({
        to: client.contact_email,
        subject: `${addOn.name} is now on your dashboard`,
        html: `
          <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;max-width:560px;">
            <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#58a93b;">Add-on activated</p>
            <h1 style="margin:0 0 10px;font-size:20px;">${addOn.name}</h1>
            <p style="margin:0 0 14px;">${addOn.tagline}. It's on your dashboard now — just sign in to see it.</p>
            <p style="margin:0;color:#64748b;font-size:13px;">Billed at ${formatRand(addOn.priceRand)} per month.</p>
          </div>`,
      });
    } catch {
      // Swallowed deliberately — see comment above.
    }
  }

  revalidatePath("/admin/add-ons");
  revalidatePath("/client");
}

/** Turns an add-on off, or declines a request that isn't going ahead. */
export async function setFeatureStatus(
  clientId: string,
  featureKey: string,
  status: "declined" | "cancelled"
) {
  await requireAdmin();
  if (!isFeatureKey(featureKey)) throw new Error("Unknown add-on.");
  const supabase = await createClient();

  const { error } = await supabase
    .from("client_features")
    .update({ status, activated_at: null })
    .eq("client_id", clientId)
    .eq("feature_key", featureKey);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/add-ons");
  revalidatePath("/client");
}
