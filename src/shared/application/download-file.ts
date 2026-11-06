/** Cross-origin download attributes are ignored by browsers. Download the
 * authorized response as a local blob without changing the original bytes. */
export async function downloadRemoteFile(url: string, fileName: string) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error("Não foi possível baixar o arquivo. Tente novamente.");
  const objectUrl = URL.createObjectURL(await response.blob());
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
