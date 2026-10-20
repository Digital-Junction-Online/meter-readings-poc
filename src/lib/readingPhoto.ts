import { createClient } from "@/lib/supabase/browser";

/**
 * Uploads a replacement meter photo and returns its public URL. Module-level
 * rather than a component closure: Date.now() here belongs to an event
 * callback, but the purity lint can't tell that once a function is nested
 * inside a component.
 */
export async function uploadReadingPhoto(readingId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `review-edits/${readingId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("meter-photos").upload(path, file);
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return supabase.storage.from("meter-photos").getPublicUrl(path).data.publicUrl;
}
