'use client';

/**
 * 매거진 구독 필수 동의 3종 (P0-07) — 구독 페이지 폼과 인라인 SubscribeCard가 공유한다.
 *  1) 개인정보 수집·이용 동의 (필수)
 *  2) 광고성 정보 수신 동의 (필수, 매거진 발송 목적 · 21~08시 야간 제외)
 *  3) 만 14세 이상 (필수)
 * 야간 수신 동의(선택)는 넣지 않는다: 기본 야간 미발송이 안전하다.
 */
import { MAGAZINE_QUIET_HOURS_LABEL } from '@/lib/magazine/schedule-labels';
import {
  SUBSCRIBER_RETENTION_LEGAL_NOTE,
  SUBSCRIBER_RETENTION_NOTICE,
} from '@/lib/magazine/legal-constants';

export interface ConsentState {
  privacy: boolean;
  marketing: boolean;
  age14: boolean;
}

export const EMPTY_CONSENT: ConsentState = { privacy: false, marketing: false, age14: false };

/** 개인정보 처리방침 경로. */
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

const ROW = 'flex items-start gap-3 min-h-12 py-2 px-1 cursor-pointer select-none';
const BOX = 'mt-0.5 h-6 w-6 shrink-0 rounded accent-indigo-500 cursor-pointer';
const TEXT = 'text-[15px] leading-relaxed text-slate-100';

export function ConsentCheckboxes({ value, onChange, idPrefix }: Props) {
  const allDone = allConsented(value);
  const set = (k: keyof ConsentState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.checked });

  const handleToggleAll = (checked: boolean) => {
    onChange({ privacy: checked, marketing: checked, age14: checked });
  };

  return (
    <fieldset className="space-y-1.5 rounded-xl border border-slate-700 bg-slate-900 p-3.5 text-slate-100">
      <legend className="sr-only">필수 동의 항목</legend>

      {/* 마스터 체크박스: 한 번에 모두 동의 (행 높이 ≥52px, 체크박스 24×24, 17px 굵게, 테두리 강조) */}
      <div className="flex items-center gap-3 min-h-[52px] rounded-xl border-2 border-indigo-400/70 bg-slate-800/90 px-3.5 py-2.5">
        <input
          id={`${idPrefix}-all`}
          type="checkbox"
          checked={allDone}
          onChange={(e) => handleToggleAll(e.target.checked)}
          className="h-6 w-6 shrink-0 rounded accent-indigo-500 cursor-pointer"
        />
        <label
          htmlFor={`${idPrefix}-all`}
          className="flex min-h-[48px] flex-1 items-center text-[17px] font-bold leading-snug text-white cursor-pointer select-none"
        >
          [✓ 필수 항목 모두 동의합니다 (한 번에 체크)]
        </label>
      </div>

      <label htmlFor={`${idPrefix}-privacy`} className={ROW}>
        <input id={`${idPrefix}-privacy`} type="checkbox" checked={value.privacy} onChange={set('privacy')} className={BOX} />
        <span className={TEXT}>
          <b className="text-white">[필수]</b> 개인정보 수집·이용에 동의합니다. (수집 항목: 연락처·이름, 목적: 매거진 발송, 보유: {SUBSCRIBER_RETENTION_NOTICE} — {SUBSCRIBER_RETENTION_LEGAL_NOTE}){' '}
          <a href={PRIVACY_POLICY_HREF} target="_blank" rel="noopener noreferrer" className="underline text-indigo-200 font-semibold">
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
