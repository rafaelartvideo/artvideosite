/** Own preview URLs until the composer or its pending outbox releases them. */
export function createMediaPreviewUrls() {
  const urls = new Set();
  return {
    create(file) {
      const url = URL.createObjectURL(file);
      urls.add(url);
      return url;
    },
    release(url) {
      if (!urls.delete(url)) return;
      URL.revokeObjectURL(url);
    },
    clear() {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
