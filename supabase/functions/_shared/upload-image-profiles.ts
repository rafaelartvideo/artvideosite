export type UploadImagePreset = "service-photo" | "service-label" | "document-image" | "catalog-image" | "whatsapp-image" | "sac-image" | "payment-proof" | "profile-image" | "logo-image";

type ImagePresetConfig = {
  maxDimension: number;
  quality: number;
  minQuality: number;
  minBytesToOptimize: number;
  targetMaxBytes: number;
};

export const IMAGE_PRESETS: Record<UploadImagePreset, ImagePresetConfig> = {
  "service-photo": { maxDimension: 1600, quality: 0.80, minQuality: 0.68, minBytesToOptimize: 250 * 1024, targetMaxBytes: 900 * 1024 },
  "service-label": { maxDimension: 2200, quality: 0.88, minQuality: 0.82, minBytesToOptimize: 450 * 1024, targetMaxBytes: 1600 * 1024 },
  "document-image": { maxDimension: 2200, quality: 0.90, minQuality: 0.84, minBytesToOptimize: 350 * 1024, targetMaxBytes: 1600 * 1024 },
  "payment-proof": { maxDimension: 2200, quality: 0.90, minQuality: 0.84, minBytesToOptimize: 350 * 1024, targetMaxBytes: 1600 * 1024 },
  "profile-image": { maxDimension: 512, quality: 0.82, minQuality: 0.74, minBytesToOptimize: 80 * 1024, targetMaxBytes: 250 * 1024 },
  "logo-image": { maxDimension: 1600, quality: 0.92, minQuality: 0.88, minBytesToOptimize: 160 * 1024, targetMaxBytes: 950 * 1024 },
  "catalog-image": { maxDimension: 1600, quality: 0.82, minQuality: 0.70, minBytesToOptimize: 250 * 1024, targetMaxBytes: 950 * 1024 },
  "sac-image": { maxDimension: 1600, quality: 0.80, minQuality: 0.68, minBytesToOptimize: 160 * 1024, targetMaxBytes: 900 * 1024 },
  "whatsapp-image": { maxDimension: 2560, quality: 0.86, minQuality: 0.68, minBytesToOptimize: 160 * 1024, targetMaxBytes: 3 * 1024 * 1024 },
};
