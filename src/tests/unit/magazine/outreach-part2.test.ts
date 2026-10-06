/**
 * Part2 골든 결함 회귀: 폼 상호 의존 검증 해제, 채널 라벨 SSOT, 전화번호 표시 포맷,
 * special GET sendEnabled 파싱, QR/인쇄용 중개사 표시명 규칙(공개 페이지와 동일).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  CHANNEL_LABEL,
  refreshAddErrors,
  validateAddSubscriber,
  type AddSubscriberInput,
} from '@/components/magazine-editor/outreach/outreach-helpers';
import { parseSpecialPreview } from '@/components/magazine-editor/outreach/special-edition-helpers';
import { formatKrPhoneDisplay } from '@/lib/magazine/phone-input';
import { parseEditorIdentity, resolveEditorPublicName } from '@/lib/magazine/editor-helpers';
import { publicBrokerDisplayName } from '@/lib/magazine/public-page-data';

const base: AddSubscriberInput = { name: '김고객', phone: '010-0000-7103', email: '', channel: 'both', attested: true };

function errorsFor(input: AddSubscriberInput) {
  const v = validateAddSubscriber(input);
  return v.ok ? {} : v.errors;
}

describe('① 채널·이메일 상호 의존 검증 오류 재계산', () => {
  it("'둘 다'+이메일 없음 오류 → '카카오톡'으로 바꾸면 이메일 오류가 사라진다", () => {
    const prev = errorsFor(base);
    expect(prev.email).toMatch(/이메일 수신을 선택하면/);
    const next = refreshAddErrors({ ...base, channel: 'kakao' }, prev);
    expect(next.email).toBeUndefined();
  });
  it('이메일을 입력하면 필수 오류가 해제된다', () => {
    const prev = errorsFor(base);
    expect(refreshAddErrors({ ...base, email: 'a@b.co' }, prev).email).toBeUndefined();
  });
  it('형식이 잘못된 이메일이면 오류가 최신 문구로 갱신된다', () => {
    const prev = errorsFor(base);
    const next = refreshAddErrors({ ...base, email: 'abc' }, prev);
    expect(next.email).toMatch(/이메일 형식/);
  });
  it('여전히 필요한 채널이면 오류 유지, 오류가 없던 필드엔 새 오류를 만들지 않는다', () => {
    const prev = errorsFor(base);
    const next = refreshAddErrors({ ...base, channel: 'email', phone: '' }, prev);
    expect(next.email).toBeTruthy();
    expect(next.phone).toBeUndefined(); // 이전에 오류가 없었다 → 입력 중 조기 경고 금지
  });
  it('전화 오류는 유효한 번호가 되면 해제', () => {
    const prev = errorsFor({ ...base, channel: 'kakao', phone: '010' });
    expect(prev.phone).toBeTruthy();
    expect(refreshAddErrors({ ...base, channel: 'kakao', phone: '010-1234-5678' }, prev).phone).toBeUndefined();
  });
});

describe('③ 채널 라벨 SSOT', () => {
  it("'둘 다' 하나로 통일, 구 라벨 '카카오+이메일' 제거", () => {
    expect(CHANNEL_LABEL).toEqual({ kakao: '카카오톡', email: '이메일', both: '둘 다' });
    const root = path.resolve(__dirname, '../../../components/magazine-editor');
    for (const f of ['EditorOutreachTab.tsx', 'outreach/SubscriberDetailModal.tsx', 'outreach/AddSubscriberForm.tsx']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src, f).not.toContain('카카오+이메일');
      expect(src, f).toContain('CHANNEL_LABEL');
    }
  });
});

describe('② 로딩 중 구독자 수 숨김', () => {
  it("'총 N명 중 M명' 블록은 loading 이 아닐 때만 렌더", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../components/magazine-editor/EditorOutreachTab.tsx'),
      'utf8',
    );
    expect(src).toMatch(/!loadError\s*&&\s*!loading\s*\?/);
  });
});

describe('⑤ 전화번호 표시 포맷 (소유 중개사 화면)', () => {
  it('하이픈 없는 휴대폰은 010-0000-7103 형식', () => {
    expect(formatKrPhoneDisplay('01000007103')).toBe('010-0000-7103');
    expect(formatKrPhoneDisplay('0101234567')).toBe('010-123-4567');
    expect(formatKrPhoneDisplay('010-0000-7103')).toBe('010-0000-7103');
  });
  it('마스킹·유선·빈 값·국제번호는 그대로', () => {
    expect(formatKrPhoneDisplay('010-****-7103')).toBe('010-****-7103');
    expect(formatKrPhoneDisplay('0212345678')).toBe('0212345678');
    expect(formatKrPhoneDisplay('+821000007103')).toBe('+821000007103');
    expect(formatKrPhoneDisplay(null)).toBe('');
    expect(formatKrPhoneDisplay('')).toBe('');
  });
});

describe('④ special GET sendEnabled', () => {
  const body = { building: { id: 'b1' }, total: 3, matched: 1 };
  it('boolean 이면 그대로, 없으면 null(알 수 없음)', () => {
    expect(parseSpecialPreview({ ...body, sendEnabled: false })?.sendEnabled).toBe(false);
    expect(parseSpecialPreview({ ...body, sendEnabled: true })?.sendEnabled).toBe(true);
    expect(parseSpecialPreview(body)?.sendEnabled).toBeNull();
    expect(parseSpecialPreview({ ...body, sendEnabled: 'no' })?.sendEnabled).toBeNull();
  });
  it('모달은 서버 값이 있으면 그것을, 없을 때만 sendDisabled 힌트를 쓴다', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../components/magazine-editor/SpecialEditionModal.tsx'),
      'utf8',
    );
    expect(src).toMatch(/preview\?\.sendEnabled\s*!=\s*null/);
    expect(src).toMatch(/autoDistribute\s*&&\s*sendOff/);
  });
});

describe('⑥ QR/인쇄 중개사 표시명 = 공개 페이지와 동일 규칙', () => {
  it('broker_profiles.name 우선, 비면 display_name, 둘 다 없으면 fallback', () => {
    expect(resolveEditorPublicName({ brokerName: '김테스트', displayName: '표시명' }, 'slug')).toBe('김테스트');
    expect(resolveEditorPublicName({ brokerName: null, displayName: '표시명' }, 'slug')).toBe('표시명');
    expect(resolveEditorPublicName({ brokerName: '  ', displayName: null }, 'slug')).toBe('slug');
    expect(resolveEditorPublicName(null, 'slug')).toBe('slug');
  });
  it('공개 페이지 publicBrokerDisplayName 과 결과 일치', () => {
    const cases: Array<[string | null, string | null]> = [
      ['김테스트', '표시명'],
      [null, '표시명'],
      ['  ', '표시명'],
      [null, null],
    ];
    for (const [name, display] of cases) {
      const pub = publicBrokerDisplayName(name, display);
      expect(resolveEditorPublicName({ brokerName: name, displayName: display }, 'slug')).toBe(pub ?? 'slug');
    }
  });
  it('parseEditorIdentity 가 broker.name 을 읽는다', () => {
    const id = parseEditorIdentity({ data: { display_name: '표시명', broker: { slug: 's', name: '김테스트' } } });
    expect(id?.brokerName).toBe('김테스트');
    expect(id?.displayName).toBe('표시명');
  });
});
