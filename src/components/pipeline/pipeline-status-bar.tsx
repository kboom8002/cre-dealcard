'use client';

/**
 * PipelineStatusBar — Phase 2 ⑤
 * Shows current deal pipeline stage and allows advancement
 */
import { useState } from 'react';
import {
  STAGE_LABELS,
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
        setError(data.error ?? '전환 중 오류가 발생했습니다');
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
              {advancing ? '처리 중...' : `→ ${STAGE_LABELS[next]}`}
            </button>
          ))}
        </div>
      )}

      {error && <p className="pipeline-bar__error">{error}</p>}
    </div>
  );
}
