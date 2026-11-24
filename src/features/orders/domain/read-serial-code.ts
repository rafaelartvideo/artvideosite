/** Shared on-device scanner for the CRM and public intake. No photo upload. */
export async function readSerialCodes(file: File): Promise<string[]> {
  const Detector = (globalThis as typeof globalThis & {
    BarcodeDetector?: new () => { detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>> };
  }).BarcodeDetector;
  if (Detector && typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const codes = await new Detector().detect(bitmap);
      const values = [...new Set(codes.map(code => code.rawValue.trim()).filter(Boolean))];
      if (values.length) return values;
    } catch { /* Fall back to the same library used by mobile capture. */ }
    finally { bitmap?.close(); }
  }
  const url = URL.createObjectURL(file);
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    const value = result.getText().trim();
    if (value) return [value];
  } catch { /* A printed serial without a barcode must be typed manually. */ }
  finally { URL.revokeObjectURL(url); }
  throw new Error("Código não encontrado. Tire uma foto mais próxima e nítida do código de barras ou QR da série. Texto sem código deve ser digitado.");
}
