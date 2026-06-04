/**
 * Onboarding Event Tracker
 *
 * Fire-and-forget analytics events to POST /api/onboarding/track.
 * Never throws — all errors are swallowed to keep the UX unblocked.
 */

// ── Event union type ─────────────────────────────────────────────────────────

export type OnboardingEvent =
  | 'onboard_start'
  | 'onboard_role_select'
  | 'onboard_photo_upload'
  | 'onboard_analysis_start'
  | 'onboard_analysis_done'
  | 'onboard_reveal_view'
  | 'onboard_share_pre_login'
  | 'onboard_login_start'
  | 'onboard_login_done'
  | 'onboard_profile_done'
  | 'onboard_radar_start'
  | 'onboard_radar_done'
  | 'onboard_dealcard_start'
  | 'onboard_dealcard_done'
  | 'onboard_share_final'
  | 'onboard_complete'
  | `onboard_skip_${string}`
  | `onboard_drop_${string}`;

// ── Core tracking function ───────────────────────────────────────────────────

/**
 * Tracks an onboarding event.
 *
 * Posts to /api/onboarding/track.
 * Fire-and-forget: await-able but NEVER throws.
 *
 * @param event        - The event name
 * @param sessionToken - Onboarding session token (may be null before analysis)
 * @param data         - Optional arbitrary key-value metadata
 */
export async function trackOnboardingEvent(
  event: OnboardingEvent,
  sessionToken: string | null,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch('/api/onboarding/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: sessionToken,
        event_name: event,
        event_data: data ?? null,
      }),
      // Use keepalive so the request survives page unloads (e.g. drop events)
      keepalive: true,
    });
  } catch {
    // Intentionally swallowed — analytics must never block the user
  }
}
