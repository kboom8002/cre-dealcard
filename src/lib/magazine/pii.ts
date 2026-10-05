/**
 * src/lib/magazine/pii.ts — PII 마스킹/정규화 (F-03)
 */
import { createHash } from 'node:crypto';

/** 전화번호를 숫자만 남기고 국내 형식(010XXXXXXXX)으로 정규화. 유효하지 않으면 null. */
export function normalizeKrPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2);
  if (!/^01[016789]\d{7,8}$/.test(d)) return null;
  return d;
}

/** 정규화된 국내 번호 → E.164 (+8210…). */
export function toE164Kr(phone: string): string | null {
  const n = normalizeKrPhone(phone);
  return n ? `+82${n.slice(1)}` : null;
}

/** 010-****-1234 */
export function maskPhone(raw: unknown): string {
  const d = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
  if (d.length < 8) return '***';
  const last4 = d.slice(-4);
  const head = d.slice(0, 3);
  return `${head}-****-${last4}`;
}

/** a***@example.com */
export function maskEmail(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.includes('@')) return '***';
  const [local, domain] = raw.split('@');
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

/** 김** */
export function maskName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) return '***';
  return raw.slice(0, 1) + '*'.repeat(Math.max(1, Math.min(raw.length - 1, 3)));
}

/**
 * 공개용 주소 마스킹 — 동(洞)/읍/면/리 단위까지만 남기고 지번·번지·호수 제거.
 *  '서울 강남구 역삼동 123-45'        → '서울 강남구 역삼동'
 *  '서울특별시 성동구 성수동2가 273-1 3층' → '서울특별시 성동구 성수동2가'
 *  '경기 성남시 분당구 판교역로 235'    → '경기 성남시 분당구 판교역로' (도로명은 번호 제거)
 * 동/읍/면/리/가/로/길 토큰 이후를 잘라낸다. 인식 불가 시 숫자 포함 토큰을 제거한다.
 */
export function maskAddress(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const tokens = s.split(' ');
  const out: string[] = [];
  for (const t of tokens) {
    // 지번/번지/호수/층 토큰이면 중단
    if (/^\d+(-\d+)?(번지|번|호|층)?$/.test(t) || /^B?\d+층$/.test(t)) break;
    out.push(t);
    // 법정동/읍/면/리/도로명 토큰으로 끝나면 이후(번지)는 잘라냄
    if (/(동|읍|면|리|가|로|길)(\d+가)?$/.test(t) || /\d+가$/.test(t)) {
      // 다음 토큰이 번지(숫자)이면 loop에서 break
      continue;
    }
  }
  // 번지가 토큰 안에 붙어있는 경우('역삼동123-45') 제거
  return out.join(' ').replace(/\s*\d+(-\d+)?(번지)?\s*$/, '').trim();
}

/** 텍스트에서 전화/이메일 패턴을 마스킹 (로그 문자열용). */
export function redactPiiInText(text: string): string {
  return text
    .replace(/(0\d{1,2})[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g, (_m, a, _b, c) => `${a}-****-${c}`)
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2');
}

/** IP 해시 (동의 기록용, 원문 IP 저장 금지). salt는 서버 비밀. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.MAGAZINE_SID_SECRET || process.env.CRON_SECRET || 'magazine-ip-salt';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
