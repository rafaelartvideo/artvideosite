/** Same on-device scanner for the CRM and public intake. No photo upload. */
export async function readSerialCodes(file: File): Promise<string[]> {
  let bitmap: ImageBitmap | undefined;
  try {
    const Detector = (window as unknown as {
      BarcodeDetector?: new () => { detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>> };
    }).BarcodeDetector;
    if (!Detector) throw new Error("Este navegador não oferece leitura de códigos. Digite o número de série manualmente.");
    bitmap = await createImageBitmap(file);
    const codes = await new Detector().detect(bitmap);
    const values = [...new Set(codes.map(code => code.rawValue.trim()).filter(Boolean))];
    if (!values.length) throw new Error("Código não encontrado. Tire uma foto mais próxima e nítida do código de barras ou QR da série. Texto sem código deve ser digitado.");
    return values;
  } finally { bitmap?.close(); }
}
