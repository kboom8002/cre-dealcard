/**
 * HapticFeedback.ts
 * Thin wrappers around the Vibration API for mobile tactile feedback.
 * All functions are safe to call on desktop (no-ops).
 */

export function hapticLight(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(30);
  }
}

export function hapticMedium(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(60);
  }
}

export function hapticSuccess(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([80, 40, 80]);
  }
}

export function hapticCelebrate(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }
}
