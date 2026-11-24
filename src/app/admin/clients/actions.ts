"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  listClients,
  createRebillClient,
  type CreateRebillClientParams,
  type RebillClient,
} from "@/lib/rebill/client";
import type { Service } from "@/lib/types";

export async function createClientRecord(name: string, contactEmail: string | null) {
  await requireAdmin();
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Client name is required");

  const { data, error } = await supabase
    .from("clients")
    .insert({ name: trimmed, contact_email: contactEmail?.trim() || null })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  return data.id as string;
}

export async function updateClient(clientId: string, name: string, contactEmail: string | null) {
  await requireAdmin();
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Client name is required");

  const email = contactEmail?.trim() || null;
  // The address reports are emailed to, so a typo here fails silently later.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("That doesn't look like a valid email address");
  }

  const { error } = await supabase
    .from("clients")
    .update({ name: trimmed, contact_email: email })
    .eq("id", clientId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

export async function updateRebillClientId(clientId: string, rebillClientId: string | null) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({ rebill_client_id: rebillClientId?.trim() || null })
    .eq("id", clientId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  revalidatePath("/admin/quotes");
}

/**
 * Create the client in Rebill and link it here in one step, for a body
 * corporate that isn't in Rebill yet — previously an admin had to leave the
 * app, add them in Rebill, then come back and paste the ID.
 *
 * The Rebill call happens first: if it fails we have written nothing, so the
 * admin can fix the input and retry. If the link write failed after Rebill
 * succeeded we would orphan a Rebill client, so that case returns the new ID
 * in the error for manual pasting rather than silently losing it.
 */
export async function createAndLinkRebillClient(
  clientId: string,
  params: CreateRebillClientParams
) {
  await requireAdmin();

  const name = params.name.trim();
  if (!name) throw new Error("Name is required");

  const created = await createRebillClient({
    name,
    business_name: params.business_name?.trim() || undefined,
    email: params.email?.trim() || undefined,
    phone: params.phone?.trim() || undefined,
    vat_number: params.vat_number?.trim() || undefined,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ rebill_client_id: created.id })
    .eq("id", clientId);

  if (error) {
    throw new Error(
      `Created in Rebill (ID ${created.id}) but couldn't link it here: ${error.message}. ` +
        `Paste that ID in manually rather than creating them again.`
    );
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin/quotes");
  return created.id;
}

/**
 * Look up Rebill clients by name, so an admin can pick the right one from a
 * list instead of copying a raw ID out of the API. Rebill's API has no
 * search param (confirmed against the real GET /client response), so this
 * fetches everything and filters here — fine at the client-list sizes a
 * small business like this has.
 */
export async function searchRebillClients(query: string): Promise<RebillClient[]> {
  await requireAdmin();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const clients = await listClients();
  return clients
    .filter((c) => {
      const haystack = `${c.name} ${c.surname ?? ""} ${c.business_name ?? ""} ${c.email}`.toLowerCase();
      return haystack.includes(trimmed);
    })
    .slice(0, 8);
}

export async function createProperty(
  clientId: string,
  name: string,
  address: string | null
) {
  await requireAdmin();
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Property name is required");

  const { data, error } = await supabase
    .from("properties")
    .insert({ client_id: clientId, name: trimmed, address: address?.trim() || null })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  return data.id as string;
}

export async function updateProperty(propertyId: string, name: string, address: string | null) {
  await requireAdmin();
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Property name is required");

  const { error } = await supabase
    .from("properties")
    .update({ name: trimmed, address: address?.trim() || null })
    .eq("id", propertyId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/client");
}

export async function createMeter(params: {
  propertyId: string;
  service: Service;
  label: string;
  unitNumber: string | null;
  locationNote: string | null;
  isCommunal: boolean;
}) {
  await requireAdmin();
  const supabase = await createClient();

  const label = params.label.trim();
  if (!label) throw new Error("Meter label is required");

  // A per-unit meter needs a unit row to hang off. Units are shared across a
  // property's meters (unit 101 has both an electricity and a water meter),
  // so find-or-create rather than always inserting.
  let unitId: string | null = null;
  if (!params.isCommunal && params.unitNumber?.trim()) {
    const unitNumber = params.unitNumber.trim();

    const { data: existingUnit, error: lookupError } = await supabase
      .from("units")
      .select("id")
      .eq("property_id", params.propertyId)
      .eq("unit_number", unitNumber)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);

    if (existingUnit) {
      unitId = existingUnit.id as string;
    } else {
      const { data: newUnit, error: unitError } = await supabase
        .from("units")
        .insert({ property_id: params.propertyId, unit_number: unitNumber })
        .select("id")
        .single();
      if (unitError) throw new Error(unitError.message);
      unitId = newUnit.id as string;
    }
  }

  const { data, error } = await supabase
    .from("meters")
    .insert({
      property_id: params.propertyId,
      unit_id: unitId,
      service: params.service,
      label,
      location_note: params.locationNote?.trim() || null,
      is_communal: params.isCommunal,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  revalidatePath("/capture");
  return data.id as string;
}

export async function deleteProperty(propertyId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Meters (and their readings) cascade with the property at the DB level —
  // refuse here so that can't happen silently. Deleting the meters first
  // (each of those already guarded by its own reading count) is the
  // deliberate, visible path.
  const { count, error: countError } = await supabase
    .from("meters")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);

  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error(
      `This property has ${count} meter${count === 1 ? "" : "s"} and cannot be deleted. Delete its meters first.`
    );
  }

  const { error } = await supabase.from("properties").delete().eq("id", propertyId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  revalidatePath("/admin");
}

export async function deleteClient(clientId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // properties.client_id is ON DELETE RESTRICT, so this would fail at the DB
  // layer anyway — checked here first for a message that names the count
  // instead of a raw foreign-key error.
  const { count, error: countError } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error(
      `This client has ${count} propert${count === 1 ? "y" : "ies"} and cannot be deleted. Delete them first.`
    );
  }

  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
}

export async function deleteMeter(meterId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Readings cascade with the meter, so refuse if any exist rather than
  // silently destroying history.
  const { count, error: countError } = await supabase
    .from("meter_readings")
    .select("id", { count: "exact", head: true })
    .eq("meter_id", meterId);

  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error(
      `This meter has ${count} reading${count === 1 ? "" : "s"} against it and cannot be deleted.`
    );
  }

  const { error } = await supabase.from("meters").delete().eq("id", meterId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
}

/** Marks a meter's dial as whole units only, so a decimal point is refused at capture. */
export async function setMeterWholeNumbers(meterId: string, wholeNumbers: boolean) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("meters")
    .update({ whole_numbers: wholeNumbers })
    .eq("id", meterId);
  if (error) {
    throw new Error(
      error.message.includes("whole_numbers")
        ? "The database needs updating first (migration 008)."
        : error.message
    );
  }

  revalidatePath("/admin/clients");
  revalidatePath("/capture");
}
