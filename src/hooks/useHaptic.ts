/**
 * useHaptic — lightweight haptic feedback hook using the Vibration API.
 * Falls back gracefully on desktop / browsers without vibration support.
 */
export function useHaptic() {
  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  };

  return {
    /** 10ms — light selection feedback */
    light: () => vibrate(10),
    /** 25ms — medium tap feedback */
    medium: () => vibrate(25),
    /** 50ms — heavy press feedback */
    heavy: () => vibrate(50),
    /** Success pattern — two short taps */
    success: () => vibrate([10, 50, 10]),
    /** Error pattern — three short aggressive taps */
    error: () => vibrate([50, 30, 50, 30, 50]),
  };
}
