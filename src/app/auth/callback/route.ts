/**
 * GET /auth/callback
 *
 * Supabase PKCE (`?code=`) 및 OTP (`?token_hash=&type=recovery`) 인증 콜백 핸들러.
 * 세션 교환 성공 시 오픈 리다이렉트 검증을 통과한 내부 경로(`next`, 기본 `/broker`, recovery 시 `/update-password`)로 이동합니다.
 */
import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

function resolveSafeInternalPath(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (
    trimmed.length > 0 &&
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\')
  ) {
    return trimmed;
  }
  return fallback;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const rawNext = searchParams.get('next') ?? searchParams.get('redirectTo');

  const defaultTarget = rawType === 'recovery' ? '/update-password' : '/broker';
  const safeNext = resolveSafeInternalPath(rawNext, defaultTarget);
  const isRecoveryFlow =
    rawType === 'recovery' || safeNext.startsWith('/update-password');

  try {
    if (code) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(safeNext, origin));
      }
    } else if (tokenHash && rawType && ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: rawType as EmailOtpType,
      });
      if (!error) {
        return NextResponse.redirect(new URL(safeNext, origin));
      }
    }

    const failureTarget = isRecoveryFlow
      ? '/update-password?error=expired_link'
      : '/login?error=auth_callback_failed';
    return NextResponse.redirect(new URL(failureTarget, origin));
  } catch (err) {
    console.error('[auth/callback] Session exchange failed:', err);
    const failureTarget = isRecoveryFlow
      ? '/update-password?error=expired_link'
      : '/login?error=auth_callback_failed';
    return NextResponse.redirect(new URL(failureTarget, origin));
  }
}
