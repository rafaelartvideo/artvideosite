import { supabase } from "@/lib/supabase";

export type PublicMedia = {
  bucket_id?: string | null;
  bucket_name?: string | null;
  storage_path: string;
};

export function publicMediaUrl(media: PublicMedia | null | undefined): string | null {
  const bucketName = media?.bucket_id ?? media?.bucket_name;
  if (!bucketName || !media?.storage_path) return null;
  return supabase.storage.from(bucketName).getPublicUrl(media.storage_path).data.publicUrl;
}


export async function resolvePublicMediaUrl(media: PublicMedia | null | undefined): Promise<string | null> {
  const bucketName = media?.bucket_id ?? media?.bucket_name;
  if (!bucketName || !media?.storage_path) return null;
  if (bucketName === "service-images") {
    const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(media.storage_path, 3600);
    if (error) throw error;
    return data?.signedUrl || null;
  }
  return publicMediaUrl(media);
}
