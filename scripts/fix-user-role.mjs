/**
 * Supabase Management API로 auth.users에서 email 검색 후 role 업데이트
 * 실행: node --env-file=.env.local scripts/fix-user-role.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const TARGET_EMAIL = 'worldkbeauty@gmail.com';

// Supabase REST API로 auth.users 조회 (service role 토큰 사용)
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) { console.error('SUPABASE_URL 파싱 실패'); process.exit(1); }

const res = await fetch(
  `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`,
  { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
);

if (!res.ok) {
  console.error('Admin users API 실패:', res.status, await res.text());
  process.exit(1);
}

const json = await res.json();
const users = json.users ?? [];
const target = users.find(u => u.email === TARGET_EMAIL);

if (!target) {
  console.error(`${TARGET_EMAIL} 사용자를 찾을 수 없습니다. 전체 유저 수: ${users.length}`);
  users.slice(0,5).forEach(u => console.log(` - ${u.email}`));
  process.exit(1);
}

console.log(`✅ 유저 발견: ${target.email} (${target.id})`);

// profiles 테이블 update (없으면 insert)
const { data: existing } = await supabase.from('profiles').select('id, role').eq('id', target.id).single();
console.log('현재 프로필:', existing);

let err;
if (existing) {
  ({ error: err } = await supabase.from('profiles').update({ role: 'broker' }).eq('id', target.id));
} else {
  ({ error: err } = await supabase.from('profiles').insert({ id: target.id, role: 'broker', display_name: 'worldkbeauty' }));
}

if (err) { console.error('업데이트 실패:', err.message); process.exit(1); }
console.log(`🎉 ${TARGET_EMAIL} → broker 역할 설정 완료!`);
