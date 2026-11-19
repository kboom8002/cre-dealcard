/**
 * Client-side local memory of brokers a reader has subscribed to via this browser.
 * Used to suppress redundant opt-in cards when revisiting via shared links without `?sid=`.
 */

const STORAGE_PREFIX = 'cre_mag_sub:';

function normalizeBrokerKey(brokerId: string): string {
  return String(brokerId || '').trim().toLowerCase();
}

export function markBrokerSubscribed(brokerId: string): void {
  if (typeof window === 'undefined') return;
  const key = normalizeBrokerKey(brokerId);
  if (!key) return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, '1');
  } catch {
    // Ignore storage quota or private-mode access errors
  }
}

export function hasLocalBrokerSubscribed(brokerId: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = normalizeBrokerKey(brokerId);
  if (!key) return false;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${key}`) === '1';
  } catch {
    return false;
  }
}
