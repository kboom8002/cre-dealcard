/**
 * /api/public/magazine/referral — 레퍼럴(DC-11=b: 전달 버튼만 남기는 축소)
 *
 * 이전 구현은 존재하지 않는 `magazine_referrals` 테이블이 없을 때 가짜 성공·가짜 카운터(`totalReferrals:1`,
 * 보상 마일스톤)를 반환했다(T2-08). 정직하게 바꾼다:
 *   - DB를 전혀 건드리지 않는다. 귀속·마일스톤·보상은 **차기 범위**(독자 토큰 ref + magazine_referrals 적용 후 구현).
 *   - GET  → { ok:true, enabled:false, count:null }   (카운터를 만들어 내지 않음)
 *   - POST → { ok:true, tracked:false }               (입력 검증만, 기록하지 않음)
 * 공개 엔드포인트이므로 레이트리밋·본문 크기 제한 가드를 적용한다. 전화번호 등 PII는 받지도, 반환하지도 않는다.
 */
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { withPublicGuard } from '@/lib/magazine/public-guard';

export const dynamic = 'force-dynamic';

const BROKER_PARAM = /^[A-Za-z0-9가-힣_-]{1,80}$/;

const postSchema = z.object({
  brokerId: z
    .string({ error: '중개사 정보가 올바르지 않습니다.' })
    .regex(BROKER_PARAM, '중개사 정보가 올바르지 않습니다.'),
  /** 독자 식별 토큰(차기 범위). 현재는 형식만 확인하고 저장하지 않는다. */
  ref: z.string().max(100, '요청 형식이 올바르지 않습니다.').optional(),
});

export const POST = withPublicGuard({
  name: 'magazine-referral',
  schema: postSchema,
  maxBodyBytes: 2 * 1024,
  rateLimit: { ip: { max: 30, windowSec: 3600 } },
})(async () => {
  // 귀속·마일스톤은 차기 범위: 기록하지 않았음을 명시적으로 알린다(가짜 성공 금지)
  return NextResponse.json({ ok: true, tracked: false });
});

export const GET = withPublicGuard({
  name: 'magazine-referral-get',
  rateLimit: { ip: { max: 60, windowSec: 3600 } },
})(async (req) => {
  const brokerId = req.nextUrl.searchParams.get('brokerId');
  if (!brokerId || !BROKER_PARAM.test(brokerId)) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '중개사 정보가 올바르지 않습니다.' } },
      { status: 400 },
    );
  }
  // 카운터 기능 비활성: count:null 은 "집계하지 않음"이며 0명이 아니다
  return NextResponse.json({ ok: true, enabled: false, count: null });
});
