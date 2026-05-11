'use client';

/**
 * DealBriefingCard — Phase 3 ⑩
 * Cross-system AI briefing card shown on the deal card result page.
 * Fetches from GET /api/broker/buildings/[id]/briefing
 */
import { useEffect, useState } from 'react';
import type { DealBriefing, RecommendedAction } from '@/domain/briefing/deal-briefing-generator';

interface Props {
  buildingId: string;
  authToken: string;
}

export function DealBriefingCard({ buildingId, authToken }: Props) {
  const [briefing, setBriefing] = useState<DealBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/broker/buildings/${buildingId}/briefing`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((d) => setBriefing(d.briefing ?? null))
      .catch(() => setBriefing(null))
      .finally(() => setLoading(false));
  }, [buildingId, authToken]);

  if (loading) {
    return (
      <div className="briefing-card briefing-card--loading">
        <span className="briefing-card__spinner" />
        <span>AI 브리핑 불러오는 중...</span>
      </div>
    );
  }

  if (!briefing) return null;

  const highActions = briefing.recommendedActions.filter((a) => a.priority === 'high');
  const otherActions = briefing.recommendedActions.filter((a) => a.priority !== 'high');

  return (
    <div className="briefing-card">
      <div className="briefing-card__header">
        <span className="briefing-card__icon">💡</span>
        <h3 className="briefing-card__title">AI 브리핑</h3>
      </div>

      {/* Similar deals */}
      {briefing.similarDealCount > 0 && (
        <div className="briefing-card__section">
          <div className="briefing-card__section-label">📊 유사 딜 분석</div>
          <div className="briefing-card__row">
            <span>유사 사례 {briefing.similarDealCount}건 발견</span>
            {briefing.dominantPurpose && (
              <span className="briefing-card__badge">{briefing.dominantPurpose}</span>
            )}
          </div>
          {briefing.avgMatchScore !== null && (
            <div className="briefing-card__row briefing-card__row--sub">
              평균 매칭 점수: <strong>{briefing.avgMatchScore}점</strong>
            </div>
          )}
        </div>
      )}

      {/* Hold warning */}
      {briefing.holdWarning && (
        <div className="briefing-card__section briefing-card__section--warn">
          <div className="briefing-card__section-label">⚠️ 딜 모멘텀 경고</div>
          <p className="briefing-card__text">{briefing.holdWarning}</p>
        </div>
      )}

      {/* Vacancy status */}
      <div className="briefing-card__section">
        <div className="briefing-card__section-label">🏢 임대 AI 현황</div>
        {briefing.vacancyStatus.inquiryCount === 0 ? (
          <p className="briefing-card__text briefing-card__text--muted">
            임차인 문의 없음 — AI 임대 홈페이지를 만들어보세요
          </p>
        ) : (
          <div className="briefing-card__row">
            <span>문의 {briefing.vacancyStatus.inquiryCount}건</span>
            {briefing.vacancyStatus.avgFitScore !== null && (
              <span>적합도 평균 {briefing.vacancyStatus.avgFitScore}점</span>
            )}
            {briefing.vacancyStatus.demandVerified && (
              <span className="briefing-card__badge briefing-card__badge--green">
                ✅ 임대 수요 검증됨
              </span>
            )}
          </div>
        )}
      </div>

      {/* Recommended actions */}
      {briefing.recommendedActions.length > 0 && (
        <div className="briefing-card__section">
          <div className="briefing-card__section-label">📋 추천 다음 행동</div>
          <div className="briefing-card__actions">
            {highActions.map((action) => (
              <ActionButton key={action.action} action={action} variant="primary" />
            ))}
            {otherActions.map((action) => (
              <ActionButton key={action.action} action={action} variant="secondary" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  variant,
}: {
  action: RecommendedAction;
  variant: 'primary' | 'secondary';
}) {
  return (
    <button
      className={`briefing-card__action-btn briefing-card__action-btn--${variant}`}
      data-action={action.action}
      type="button"
    >
      {action.label}
    </button>
  );
}
