import { supabase } from "@/lib/supabase";

const ORDER_IMAGE_BUCKET = "service-images";

export const uploadOrderImageFile = (path: string, file: File) =>
  supabase.storage.from(ORDER_IMAGE_BUCKET).upload(path, file, { upsert: true });

export const removeOrderImageFile = (path: string) =>
  supabase.storage.from(ORDER_IMAGE_BUCKET).remove([path]);
