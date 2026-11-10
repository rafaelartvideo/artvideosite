/** Cross-origin download attributes are ignored by browsers. Download the
 * authorized response as a local blob without changing the original bytes. */
export async function downloadRemoteFile(url: string, fileName: string) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error("Não foi possível baixar o arquivo. Tente novamente.");
  downloadBlobFile(await response.blob(), fileName);
}

/** Download an already-authorized local report using the same cleanup lifecycle. */
export function downloadBlobFile(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  let anchor: HTMLAnchorElement | null = null;
  try {
    anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName || "arquivo";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    // Leave time for the browser to take ownership before releasing the bytes.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
  }
}
