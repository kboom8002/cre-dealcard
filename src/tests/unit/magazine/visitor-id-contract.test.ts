/**
 * cre_mag_vid 저장 계약 (E3 view-helpers/PollSection 과 열람 추적이 같은 ID 를 쓴다)
 *  - key  : 'cre_mag_vid'
 *  - value: JSON `{"id":"<uuid>","createdAt":<ms>}`  (만료 13개월)
 *  - 레거시: 구형 view-helpers 가 같은 키에 raw UUID 문자열을 저장 → 읽을 때 같은 ID 를 이어받아 JSON 으로 이전
 */
import { describe, expect, it } from 'vitest';
import {
  VISITOR_ID_STORAGE_KEY,
  VISITOR_ID_TTL_MS,
  getOrCreateVisitorId,
  isValidVisitorId,
  parseLegacyVisitorId,
  parseStoredVisitorId,
  resolveVisitorId,
  type KeyValueStorage,
} from '@/lib/magazine/visitor-id';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const NOW = Date.UTC(2026, 9, 6);

function memStorage(initial?: string): KeyValueStorage & { value: string | null; writes: number } {
  const s = {
    value: initial ?? null,
    writes: 0,
    getItem: (k: string) => (k === VISITOR_ID_STORAGE_KEY ? s.value : null),
    setItem: (k: string, v: string) => {
      if (k === VISITOR_ID_STORAGE_KEY) {
        s.value = v;
        s.writes += 1;
      }
    },
  };
  return s;
}

describe('cre_mag_vid 계약', () => {
  it('키 이름·TTL 고정', () => {
    expect(VISITOR_ID_STORAGE_KEY).toBe('cre_mag_vid');
    expect(VISITOR_ID_TTL_MS).toBe(395 * 24 * 60 * 60 * 1000);
  });

  it('신규: JSON {id, createdAt} 로 저장하고 같은 ID 를 반복해서 돌려준다', () => {
    const st = memStorage();
    const id1 = getOrCreateVisitorId(st, NOW, () => UUID_A);
    const id2 = getOrCreateVisitorId(st, NOW + 1000, () => UUID_B);
    expect(id1).toBe(UUID_A);
    expect(id2).toBe(UUID_A);
    expect(JSON.parse(st.value!)).toEqual({ id: UUID_A, createdAt: NOW });
    expect(st.writes).toBe(1);
  });

  it('레거시 raw UUID 값: 같은 ID 를 이어받고 JSON 포맷으로 이전한다 (ID 가 바뀌지 않는다)', () => {
    const st = memStorage(UUID_A); // 구형 view-helpers 가 저장한 값
    expect(parseLegacyVisitorId(UUID_A)).toBe(UUID_A);
    expect(getOrCreateVisitorId(st, NOW, () => UUID_B)).toBe(UUID_A);
    expect(JSON.parse(st.value!)).toEqual({ id: UUID_A, createdAt: NOW });
    // 이전 후에는 정식 파서로도 읽힌다
    expect(parseStoredVisitorId(st.value, NOW + 1)?.id).toBe(UUID_A);
  });

  it('레거시 비-UUID 폴백 값(v<base36>)은 버리고 새 UUID 를 발급한다', () => {
    const st = memStorage('v1abc2def3ghij');
    expect(parseLegacyVisitorId('v1abc2def3ghij')).toBeNull();
    const id = getOrCreateVisitorId(st, NOW, () => UUID_B);
    expect(id).toBe(UUID_B);
    expect(JSON.parse(st.value!).id).toBe(UUID_B);
  });

  it('13개월 지난 JSON 은 만료 → 새 ID', () => {
    const st = memStorage(JSON.stringify({ id: UUID_A, createdAt: NOW - VISITOR_ID_TTL_MS - 1 }));
    expect(getOrCreateVisitorId(st, NOW, () => UUID_B)).toBe(UUID_B);
  });

  it('PollSection 과 추적이 번갈아 호출해도 ID·저장 값이 흔들리지 않는다 (키 충돌 핑퐁 없음)', () => {
    const st = memStorage(UUID_A); // 레거시로 시작
    const seen = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      seen.add(i % 2 === 0 ? (resolveVisitorId(st, NOW, () => UUID_B) as string) : getOrCreateVisitorId(st, NOW, () => UUID_B));
    }
    expect([...seen]).toEqual([UUID_A]);
    expect(st.writes).toBe(1); // 이전 1회뿐
  });

  it('저장소 없음/쓰기 불가: getOrCreate 는 문자열을 돌려주되(투표용 임시 값) resolve 는 UUID 발급기가 없으면 null', () => {
    expect(resolveVisitorId(null, NOW, () => null)).toBeNull();
    const tmp = getOrCreateVisitorId(null, NOW, () => null);
    expect(typeof tmp).toBe('string');
    expect(isValidVisitorId(tmp)).toBe(false);
    expect(/^[A-Za-z0-9_-]{8,64}$/.test(tmp)).toBe(true); // 투표 API(sanitizeVisitorId) 형식은 만족
  });
});
