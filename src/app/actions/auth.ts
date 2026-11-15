'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod/v4';
import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PURGE_STORAGE_COOKIE_NAME } from '@/lib/workspace/storage-namespace';

// ─── Validation Schemas ──────────────────────────────────────────────────────

const SignupSchema = z.object({
  displayName: z.string().min(2, '이름은 2자 이상이어야 합니다.').max(30),
  email: z.email('올바른 이메일 주소를 입력해주세요.'),
  password: z
    .string()
    .min(8, '비밀번호는 8자 이상이어야 합니다.')
    .max(72),
  // ALPHA: 알파 테스트 기간 동안 모든 신규 가입자에게 broker 권한 부여
  role: z.enum(['public_user', 'broker']).default('broker'),
});

const LoginSchema = z.object({
  email: z.email('올바른 이메일 주소를 입력해주세요.'),
  password: z.string().min(1, '비밀번호를 입력해주세요.'),
});

export type AuthFormState =
  | { errors?: Record<string, string[]>; message?: string }
  | undefined;

function resolveSafeRedirectTarget(raw: FormDataEntryValue | null | undefined, fallback = '/broker'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (
    trimmed.length > 0 &&
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\') &&
    trimmed !== '/login' &&
    trimmed !== '/signup'
  ) {
    return trimmed;
  }
  return fallback;
}

// ─── Signup ─────────────────────────────────────────────────────────────────

export async function signup(
  state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    displayName: formData.get('displayName'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role') ?? 'broker',
  };

  const agreeTerms = formData.get('agreeTerms') === 'on';
  const agreePrivacy = formData.get('agreePrivacy') === 'on';
  const agreeMarketing = formData.get('agreeMarketing') === 'on';

  const consentErrors: Record<string, string[]> = {};
  if (!agreeTerms) {
    consentErrors.agreeTerms = ['만 14세 이상 확인 및 서비스 이용약관(필수)에 동의해주세요.'];
  }
  if (!agreePrivacy) {
    consentErrors.agreePrivacy = ['개인정보 수집·이용(필수)에 동의해주세요.'];
  }

  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success || !agreeTerms || !agreePrivacy) {
    const fieldErrors: Record<string, string[]> = {
      ...(parsed.success ? {} : parsed.error.flatten().fieldErrors),
      ...consentErrors,
    };
    const consentMessage =
      !agreeTerms && !agreePrivacy
        ? '필수 이용약관 및 개인정보 수집·이용에 모두 동의해주세요.'
        : !agreeTerms
          ? '만 14세 이상 확인 및 서비스 이용약관(필수)에 동의해주세요.'
          : !agreePrivacy
            ? '개인정보 수집·이용(필수)에 동의해주세요.'
            : undefined;

    return {
      errors: fieldErrors,
      ...(consentMessage ? { message: consentMessage } : {}),
    };
  }

  const { displayName, email, password, role } = parsed.data;
  const nowIso = new Date().toISOString();

  const supabase = await createServerSupabaseClient();
  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        name: displayName,
        full_name: displayName,
        requested_role: role,
        terms_agreed_at: nowIso,
        privacy_agreed_at: nowIso,
        marketing_opt_in: agreeMarketing,
        consent_version: COMPANY_LEGAL_CONFIG.consentVersion,
      },
    },
  });

  if (error) {
    if (error.message?.includes('already registered')) {
      return { errors: { email: ['이미 사용 중인 이메일입니다.'] } };
    }
    return { message: `회원가입 오류: ${error.message}` };
  }

  // ALPHA: 모든 신규 가입자에게 서비스 롤을 통해 즉시 broker 권한 및 이름 부여
  const newUserId = signUpData?.user?.id;
  if (newUserId) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const serviceClient = createServiceClient();

      const { error: pErr } = await serviceClient
        .from('profiles')
        .upsert({
          id: newUserId,
          role: 'broker',
          display_name: displayName,
        });
      if (pErr) console.error('[Signup] profiles upsert failed:', pErr);

      const { error: bpErr } = await serviceClient
        .from('broker_profiles')
        .upsert(
          {
            user_id: newUserId,
          },
          { onConflict: 'user_id' },
        );
      if (bpErr) console.error('[Signup] broker_profiles upsert failed:', bpErr);
    } catch (upsertErr) {
      console.warn('[Signup] Profile upsert warning:', upsertErr);
    }
  }

  const safeTarget = resolveSafeRedirectTarget(formData.get('redirectTo'), '/broker');
  redirect(safeTarget);
}

// ─── Login ───────────────────────────────────────────────────────────────────

export async function login(
  state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { email, password } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { message: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  const safeTarget = resolveSafeRedirectTarget(
    formData.get('redirectTo') ?? formData.get('next'),
    '/broker',
  );
  redirect(safeTarget);
}

// ─── Logout ──────────────────────────────────────────────────────────────────

export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  try {
    const cookieStore = await cookies();
    cookieStore.set(PURGE_STORAGE_COOKIE_NAME, '1', {
      path: '/',
      maxAge: 60,
      httpOnly: false,
      sameSite: 'lax',
    });
  } catch {
    // Ignore cookie mutation errors outside active request context
  }
  redirect('/login');
}
