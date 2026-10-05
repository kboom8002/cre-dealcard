/**
 * 성과 탭 순수 텍스트·표시 로직 (jsdom 없이 테스트 가능) — E-04, T3-16/T3-19/T1-UX-4
 */
import { CLICK_TARGETS, canonicalClickTarget } from '@/lib/magazine/visitor-id';

export interface LeadForBriefing {
  subscriber_name: string;
  buyerTemperature: string;
  totalViews: number;
  recentSections: string[];
  interest_tags?: { regions?: string[]; assetTypes?: string[]; topics?: string[] };
}

/** 고객 이름 호칭 — 비어 있으면 '고객님' (이름을 지어내지 않는다) */
export function honorific(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n ? `${n} 고객님` : '고객님';
}

/**
 * 통화 브리핑 **템플릿** (AI 생성 아님). 실제 데이터에 있는 사실만 채우고, 없는 사실("방금 접수된 매물" 등)은 쓰지 않는다.
 * 데이터가 없는 항목은 문장 자체를 생략한다.
 */
export function buildBriefingTemplate(lead: LeadForBriefing): string {
  const lines: string[] = [];
  lines.push(`${honorific(lead.subscriber_name)}, 안녕하세요. 중개사입니다.`);
  const section = lead.recentSections[0];
  if (lead.totalViews > 0 && section) {
    lines.push(`보내 드린 매거진에서 [${section}] 내용을 보신 것으로 확인되어 연락드렸습니다.`);
  } else if (lead.totalViews > 0) {
    lines.push('보내 드린 매거진을 열어보신 것으로 확인되어 연락드렸습니다.');
  } else {
    lines.push('보내 드린 매거진은 잘 받아보셨는지 여쭙고자 연락드렸습니다.');
  }
  const tags = [...(lead.interest_tags?.regions ?? []), ...(lead.interest_tags?.assetTypes ?? [])].slice(0, 3);
  if (tags.length > 0) {
    lines.push(`등록해 주신 관심 분야(${tags.join(', ')})와 관련해 궁금하신 점이 있으신지 여쭙고 싶습니다.`);
  }
  lines.push('지금 통화 가능하실까요? 어려우시면 편한 시간을 알려 주세요.');
  return lines.join('\n');
}

/** 이벤트 한 줄 설명 (구독자 상세 패널의 최근 활동) */
export function describeEvent(ev: {
  event_type: string;
  section_label?: string | null;
  section_id?: string | null;
  dwell_seconds?: number | null;
  scroll_pct?: number | null;
  target_param?: string | null;
  target_url?: string | null;
}): string {
  const sec = ev.section_label || ev.section_id || null;
  switch (ev.event_type) {
    case 'page_view':
      return '매거진 열람';
    case 'section_view':
      return sec ? `섹션 열람: ${sec}` : '섹션 열람';
    case 'scroll_depth':
      return `스크롤 ${ev.scroll_pct ?? '?'}% 도달`;
    case 'dwell':
      return sec
        ? `섹션 체류: ${sec} ${ev.dwell_seconds ?? 0}초`
        : `화면 체류 ${ev.dwell_seconds ?? 0}초`;
    case 'click': {
      const p = canonicalClickTarget((ev.target_param ?? '').trim().toLowerCase());
      const url = (ev.target_url ?? '').toLowerCase();
      if (p === CLICK_TARGETS.IM_REQUEST || url.includes('im-lite')) return 'IM(투자설명서) 요청';
      if (p === CLICK_TARGETS.PHONE_CLICK || url.startsWith('tel:')) return '전화 버튼 클릭';
      if (p === CLICK_TARGETS.INQUIRY) return '문의 버튼 클릭(카톡·연락·상담)';
      if (p === CLICK_TARGETS.LISTING_CLICK) return '매물 클릭';
      if (p === CLICK_TARGETS.POLL_VOTE) return '설문 투표';
      if (p === CLICK_TARGETS.CALC_SIMULATE) return '수지분석 계산';
      if (p === CLICK_TARGETS.REFERRAL_COPY) return '링크 복사(전달)';
      if (p === CLICK_TARGETS.SHARE) return '공유·전달';
      return '링크/버튼 클릭';
    }
    default:
      return ev.event_type;
  }
}

/** "m분 s초" — 표본이 없으면 '—' (0초로 위장하지 않는다) */
export function formatSeconds(sec: number | null | undefined, samples?: number): string {
  if (sec == null || (samples != null && samples === 0)) return '—';
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}분 ${s}초` : `${m}분`;
}

/** KST 'MM-DD HH:mm' (표시 전용) */
export function formatKstDateTime(iso: string | null | undefined): string {
  if (!iso) return '기록 없음';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '기록 없음';
  const k = new Date(t.getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

export const POLL_HIDDEN_TEXT: Record<'LOW_SAMPLE' | 'NO_TIMESTAMP', string> = {
  LOW_SAMPLE: '응답이 5건 미만이라 시간대별 추이는 표시하지 않습니다.',
  NO_TIMESTAMP: '응답 시각 기록이 없어 시간대별 추이를 표시할 수 없습니다.',
};
