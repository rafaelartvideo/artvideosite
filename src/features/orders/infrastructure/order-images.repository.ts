import { supabase } from "@/lib/supabase";
import { createMediaRecord } from "@/shared/infrastructure/media.repository";

const ORDER_IMAGE_BUCKET = "service-images";

export const uploadOrderImageFile = (path: string, file: File) =>
  supabase.storage.from(ORDER_IMAGE_BUCKET).upload(path, file, { upsert: true });

export const removeOrderImageFile = (path: string) =>
  supabase.storage.from(ORDER_IMAGE_BUCKET).remove([path]);

export async function uploadOrderImage(file: File) {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() || "jpg";

  const path =
    `orders/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${extension}`;

  /* =====================================================
     1. Upload físico para Storage
     ===================================================== */

  const { error: uploadError } = await uploadOrderImageFile(path, file);

  if (uploadError) {
    console.error(
      "[MEDIA] Storage upload error:",
      uploadError
    );

    throw uploadError;
  }

  /* =====================================================
     2. Registrar mídia através da Edge Function
     ===================================================== */

  try {
    const mediaId =
      await createMediaRecord({
        bucket:
          "service-images",

        path,

        file,
      });

    return mediaId;
  } catch (error) {
    /*
     * O arquivo foi enviado para Storage, mas o registro
     * em public.media falhou.
     *
     * Tenta limpar o arquivo órfão para não deixar lixo
     * no bucket.
     */

    console.error(
      "[MEDIA] Media record error:",
      error
    );

    const { error: removeError } = await removeOrderImageFile(path);

    if (removeError) {
      console.warn(
        "[MEDIA] Could not remove orphan storage file:",
        removeError
      );
    }

    throw error;
  }
}

