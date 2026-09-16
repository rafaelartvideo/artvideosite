export const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;

export function remainingSessionTime(
  lastActivityAt: number,
  now = Date.now(),
  timeoutMs = INACTIVITY_TIMEOUT_MS,
) {
  return Math.max(0, timeoutMs - Math.max(0, now - lastActivityAt));
}

export function isSessionInactive(
  lastActivityAt: number,
  now = Date.now(),
  timeoutMs = INACTIVITY_TIMEOUT_MS,
) {
  return remainingSessionTime(lastActivityAt, now, timeoutMs) === 0;
}
