'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod/v4';
import { createServerSupabaseClient } from '@/lib/supabase/server';


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

// ─── Signup ─────────────────────────────────────────────────────────────────

export async function signup(
  state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    displayName: formData.get('displayName'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role') ?? 'public_user',
  };

  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { displayName, email, password, role } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        requested_role: role,
      },
    },
  });

  if (error) {
    if (error.message?.includes('already registered')) {
      return { errors: { email: ['이미 사용 중인 이메일입니다.'] } };
    }
    return { message: `회원가입 오류: ${error.message}` };
  }

  // ALPHA: 모든 신규 가입자에게 즉시 broker 권한 부여
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from('profiles')
      .update({ role: 'broker', display_name: displayName })
      .eq('id', user.id);
  }

  redirect('/broker');
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

  redirect('/broker');
}

// ─── Logout ──────────────────────────────────────────────────────────────────

export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect('/login');
}
