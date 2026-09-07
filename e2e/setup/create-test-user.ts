/**
 * e2e/setup/create-test-user.ts
 *
 * Supabase service role key로 E2E 테스트용 계정을 자동 생성합니다.
 * 이미 존재하면 비밀번호를 재설정합니다.
 *
 * 사용법: npx tsx e2e/setup/create-test-user.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E 테스트 전용 계정
const E2E_EMAIL = 'e2e-playwright@credeal.test';
const E2E_PASSWORD = 'E2E_Playwright_2026!';

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없습니다.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('📝 테스트 계정 생성/업데이트...');

  // 직접 생성 시도 (이미 존재하면 에러)
  const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: {
      display_name: 'E2E 테스트 브로커',
      name: 'E2E 테스트 브로커',
      full_name: 'E2E 테스트 브로커',
      requested_role: 'broker',
    },
  });

  let userId: string;

  if (createErr) {
    if (createErr.message?.includes('already') || createErr.message?.includes('exists') || createErr.message?.includes('duplicate')) {
      console.log('ℹ️  기존 계정 존재 — 비밀번호 로그인으로 ID 조회');
      
      // 기존 계정으로 로그인하여 userId 획득
      const anonClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: signIn, error: signErr } = await anonClient.auth.signInWithPassword({
        email: E2E_EMAIL,
        password: E2E_PASSWORD,
      });

      if (signErr) {
        // 비밀번호가 다른 경우 — service role로 비밀번호 갱신 시도
        console.log('⚠️ 로그인 실패, 이메일 기반 사용자 조회...');
        // getUserByEmail은 없으므로 signUp+update로 우회
        // 또는 그냥 새 비밀번호로 강제 변경
        const { data: { users }, error: listErr2 } = await supabase.auth.admin.listUsers({ 
          page: 1, perPage: 1000 
        });
        
        if (!listErr2 && users) {
          const existing = users.find(u => u.email === E2E_EMAIL);
          if (existing) {
            await supabase.auth.admin.updateUserById(existing.id, { password: E2E_PASSWORD });
            userId = existing.id;
            console.log(`✅ 비밀번호 업데이트 완료: ${userId}`);
          } else {
            console.error('❌ 계정을 찾을 수 없습니다');
            process.exit(1);
          }
        } else {
          console.error('❌ 사용자 조회 실패:', listErr2?.message);
          process.exit(1);
        }
      } else {
        userId = signIn.user!.id;
        console.log(`✅ 기존 계정 로그인 성공: ${userId}`);
      }
    } else {
      console.error('❌ 계정 생성 실패:', createErr.message);
      process.exit(1);
    }
  } else {
    userId = createData.user.id;
    console.log(`✅ 새 테스트 계정 생성 완료: ${userId}`);
  }

  await ensureProfile(supabase as any, userId!);

  // .env.local에 E2E 환경변수 추가
  const envPath = path.resolve(__dirname, '../../.env.local');
  let envContent = fs.readFileSync(envPath, 'utf-8');

  if (!envContent.includes('E2E_TEST_EMAIL')) {
    envContent += `\n# Playwright E2E Test Credentials\nE2E_TEST_EMAIL=${E2E_EMAIL}\nE2E_TEST_PASSWORD=${E2E_PASSWORD}\n`;
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env.local에 E2E 환경변수 추가 완료');
  } else {
    console.log('ℹ️  E2E 환경변수가 이미 .env.local에 존재합니다.');
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📧 Email:', E2E_EMAIL);
  console.log('🔑 Password:', E2E_PASSWORD);
  console.log('═'.repeat(50));
  console.log('\n✅ E2E 테스트 계정 준비 완료!');
}

async function ensureProfile(supabase: ReturnType<typeof createClient>, userId: string) {
  // Profile upsert
  const { error: profileErr } = await (supabase as any)
    .from('profiles')
    .upsert({ id: userId, role: 'broker', display_name: 'E2E 테스트 브로커' });

  if (profileErr) {
    console.warn('⚠️ profiles upsert 경고:', profileErr.message);
  } else {
    console.log('✅ profiles 테이블 upsert 완료');
  }

  // Broker profile upsert
  const { error: brokerErr } = await (supabase as any)
    .from('broker_profiles')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });

  if (brokerErr) {
    console.warn('⚠️ broker_profiles upsert 경고:', brokerErr.message);
  } else {
    console.log('✅ broker_profiles 테이블 upsert 완료');
  }
}

main().catch(err => {
  console.error('❌ 예상치 못한 오류:', err);
  process.exit(1);
});
