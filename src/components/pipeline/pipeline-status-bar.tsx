'use client';

/**
 * PipelineStatusBar — Phase 2 ⑤
 * Shows current deal pipeline stage and allows advancement
 */
import { useState } from 'react';
import {
  STAGE_LABELS,
  STAGE_ACTION_LABELS,
  STAGE_HOLD_WARNINGS,
  VALID_TRANSITIONS,
  type DealStage,
} from '@/domain/pipeline/bridge-state-machine';

interface Props {
  buildingId: string;
  authToken: string;
  currentStage: DealStage;
  holdDays: number;
  onStageChange?: (newStage: DealStage) => void;
}

const STAGE_ORDER: DealStage[] = [
  'memo_input','deal_card_created','gate_requested',
  'im_created','buyer_meeting','loi','contract','closed',
];

export function PipelineStatusBar({
  buildingId,
  authToken,
  currentStage,
  holdDays,
  onStageChange,
}: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedNext = VALID_TRANSITIONS[currentStage] ?? [];
  const activeNext = allowedNext.filter((s) => s !== 'failed');
  const holdWarning = holdDays >= 14 ? STAGE_HOLD_WARNINGS[currentStage] : null;

  async function advanceTo(toStage: DealStage) {
    // 💡 1) IM 작성 시작 클릭 시: 실제 IM 생성 시트 오픈 및 IM 탭 전환
    if (toStage === 'im_created') {
      window.dispatchEvent(new CustomEvent('switch-deal-tab', { detail: 'im' }));
      window.dispatchEvent(new CustomEvent('open-mobile-im-sheet', { detail: { stage: 'basic' } }));
      return;
    }

    // 💡 2) 자료 요청 접수 처리 클릭 시: 매수자/자료요청 탭 전환
    if (toStage === 'gate_requested') {
      window.dispatchEvent(new CustomEvent('switch-deal-tab', { detail: 'buyers' }));
      return;
    }

    if (!window.confirm(`파이프라인 단계를 '${STAGE_LABELS[toStage]}'로 전환하시겠습니까?`)) {
      return;
    }
    
    setAdvancing(true);
    setError(null);
    try {
      const res = await fetch(`/api/broker/buildings/${buildingId}/pipeline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ toStage, metadata: {} }),
      });
      const data = await res.json();
      if (!res.ok) {
        const FIELD_LABELS: Record<string, string> = {
          building_ssot_lite_id: '건물 정보',
          gate_request_id: '자료 요청서',
          im_project_id: 'IM 프로젝트',
          readiness_score: '준비도 점수',
          buyer_intent_lite_id: '매수자 정보',
          match_grade: '매칭 등급',
          meeting_schedule: '미팅 일정',
          buyer_reaction: '매수자 반응',
          price_gap: '가격 차이',
          agreed_price: '합의된 가격',
          key_conditions: '주요 조건',
          closing_date: '잔금일',
          fund_confirmed: '자금 조달 확인',
        };
        const missing = data.missing?.map((f: string) => FIELD_LABELS[f] || f).join(', ');
        const missingText = missing ? ` (필요 항목: ${missing})` : '';
        setError((data.error ?? '전환을 완료하려면 필수 조건이 필요합니다') + missingText);
      } else {
        onStageChange?.(toStage);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setAdvancing(false);
    }
  }

  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <div className="pipeline-bar">
      {/* Stage progress */}
      <div className="pipeline-bar__steps">
        {STAGE_ORDER.map((stage, idx) => {
          const isActive  = stage === currentStage;
          const isDone    = idx < currentIdx;
          const isFuture  = idx > currentIdx;
          return (
            <div
              key={stage}
              className={[
                'pipeline-bar__step',
                isActive  && 'pipeline-bar__step--active',
                isDone    && 'pipeline-bar__step--done',
                isFuture  && 'pipeline-bar__step--future',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="pipeline-bar__dot" />
              <span className="pipeline-bar__label">{STAGE_LABELS[stage]}</span>
            </div>
          );
        })}
      </div>

      {/* Hold warning */}
      {holdWarning && (
        <div className="pipeline-bar__warning">
          ⏰ {holdWarning}
        </div>
      )}

      {/* Advance buttons */}
      {activeNext.length > 0 && (
        <div className="pipeline-bar__actions">
          {activeNext.map((next) => (
            <button
              key={next}
              className="pipeline-bar__advance-btn"
              disabled={advancing}
              onClick={() => advanceTo(next)}
              type="button"
            >
              {advancing ? '처리 중...' : STAGE_ACTION_LABELS[next] || `→ ${STAGE_LABELS[next]}`}
            </button>
          ))}
        </div>
      )}

      {error && <p className="pipeline-bar__error">{error}</p>}
    </div>
  );
}
