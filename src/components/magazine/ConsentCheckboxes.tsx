'use client';

/**
 * 매거진 구독 필수 동의 3종 (P0-07) — 구독 페이지 폼과 인라인 SubscribeCard가 공유한다.
 *  1) 개인정보 수집·이용 동의 (필수)
 *  2) 광고성 정보 수신 동의 (필수, 매거진 발송 목적 · 21~08시 야간 제외)
 *  3) 만 14세 이상 (필수)
 * 야간 수신 동의(선택)는 넣지 않는다: 기본 야간 미발송이 안전하다.
 */
import { MAGAZINE_QUIET_HOURS_LABEL } from '@/lib/magazine/schedule-labels';

export interface ConsentState {
  privacy: boolean;
  marketing: boolean;
  age14: boolean;
}

export const EMPTY_CONSENT: ConsentState = { privacy: false, marketing: false, age14: false };

/** 개인정보 처리방침 경로. (repo에 /privacy 페이지가 아직 없으면 정책 페이지 작성 후 연결 필요) */
export const PRIVACY_POLICY_HREF = '/privacy';

export function allConsented(c: ConsentState): boolean {
  return c.privacy && c.marketing && c.age14;
}

/** 서버 계약 `consent` 객체. night는 항상 false(야간 미발송). */
export function toConsentPayload(c: ConsentState): { privacy: boolean; marketing: boolean; age14: boolean; night: boolean } {
  return { privacy: c.privacy, marketing: c.marketing, age14: c.age14, night: false };
}

interface Props {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** 같은 페이지에 폼이 둘 이상일 때 id 충돌 방지 */
  idPrefix: string;
}

const ROW = 'flex items-start gap-2.5 min-h-[44px] py-1.5 cursor-pointer select-none';
const BOX = 'mt-0.5 w-5 h-5 shrink-0 rounded accent-indigo-500 cursor-pointer';
const TEXT = 'text-xs leading-relaxed text-slate-300';

export function ConsentCheckboxes({ value, onChange, idPrefix }: Props) {
  const set = (k: keyof ConsentState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.checked });

  return (
    <fieldset className="space-y-0.5 border-t border-white/10 pt-2">
      <legend className="sr-only">필수 동의 항목</legend>

      <label htmlFor={`${idPrefix}-privacy`} className={ROW}>
        <input id={`${idPrefix}-privacy`} type="checkbox" checked={value.privacy} onChange={set('privacy')} className={BOX} />
        <span className={TEXT}>
          <b className="text-white">[필수]</b> 개인정보 수집·이용에 동의합니다. (수집 항목: 연락처·이름, 목적: 매거진 발송, 보유: 수신 해지 시까지){' '}
          <a href={PRIVACY_POLICY_HREF} target="_blank" rel="noopener noreferrer" className="underline text-indigo-300">
            처리방침 보기
          </a>
        </span>
      </label>

      <label htmlFor={`${idPrefix}-marketing`} className={ROW}>
        <input id={`${idPrefix}-marketing`} type="checkbox" checked={value.marketing} onChange={set('marketing')} className={BOX} />
        <span className={TEXT}>
          <b className="text-white">[필수]</b> 광고성 정보 수신에 동의합니다. (매거진 발송 · {MAGAZINE_QUIET_HOURS_LABEL} · 언제든 수신거부 가능)
        </span>
      </label>

      <label htmlFor={`${idPrefix}-age14`} className={ROW}>
        <input id={`${idPrefix}-age14`} type="checkbox" checked={value.age14} onChange={set('age14')} className={BOX} />
        <span className={TEXT}>
          <b className="text-white">[필수]</b> 만 14세 이상입니다.
        </span>
      </label>
    </fieldset>
  );
}
