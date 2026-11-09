// Ephemeral browser-only avatar cache. Never stored in localStorage or the DB.
// Base64 data URLs can be large; bound both entry count and an intentionally
// conservative UTF-16 memory estimate, including a small per-entry overhead.
export const VISIBLE_AVATAR_CACHE_MAX_BYTES = 8 * 1024 * 1024;
export const VISIBLE_AVATAR_CACHE_MAX_ENTRIES = 96;
export const VISIBLE_AVATAR_FOUND_TTL_MS = 60 * 60 * 1000;
export const VISIBLE_AVATAR_MISSING_TTL_MS = 15 * 60 * 1000;
export const VISIBLE_AVATAR_RETRY_MS = 5 * 60 * 1000;

/**
 * @param {Record<string, string|null>} previous
 * @param {string} key
 * @param {string|null} url
 * @returns {Record<string, string|null>}
 */
export function rememberVisibleAvatar(previous, key, url) {
  const next = { ...previous };
  delete next[key];
  next[key] = url;
  const keys = Object.keys(next);
  const entrySize = id => 512 + 2 * (id.length + (next[id]?.length || 0));
  let estimatedBytes = keys.reduce((total, id) => total + entrySize(id), 0);
  while (keys.length > VISIBLE_AVATAR_CACHE_MAX_ENTRIES ||
         estimatedBytes > VISIBLE_AVATAR_CACHE_MAX_BYTES) {
    const oldest = keys.shift();
    if (!oldest) break;
    estimatedBytes -= entrySize(oldest);
    delete next[oldest];
  }
  return next;
}
