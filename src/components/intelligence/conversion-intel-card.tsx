'use client';
/**
 * ConversionIntelCard — P-X + G-S + G-D unified UI
 * Shows: deal conversion probability, network recommendations, similar deals
 */
import { useEffect, useState } from 'react';

interface ConversionData {
  conversion: {
    probabilityLabel: string;
    probability: number;
    confidence: 'high' | 'medium' | 'low';
    topFactors: Array<{ factor: string; impact: string }>;
    recommendedAction: string;
    mode: 'model' | 'heuristic';
    boundaryNote: string;
  } | null;
  networkRecommendations: Array<{
    buildingId: string;
    areaSignal: string;
    assetType: string;
    priceBand: string | null;
    sharedBuyers: number;
    topGrade: string;
    networkScore: number;
  }>;
  similarDeals: Array<{
    task: string;
    knowledge: string;
    warning: string;
    similarity: number;
  }>;
  similarDealsMode: 'semantic' | 'text';
}

interface Props {
  buildingId: string;
  authToken:  string;
}

export function ConversionIntelCard({ buildingId, authToken }: Props) {
  const [data, setData]     = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<'conversion' | 'network' | 'deals'>('conversion');

  useEffect(() => {
    fetch(`/api/broker/buildings/${buildingId}/conversion`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [buildingId, authToken]);

  if (loading) return (
    <div className="intel-card intel-card--loading">
      <span className="intel-card__spinner" /> AI 딜 인텔리전스 분석 중...
    </div>
  );
  if (!data) return null;

  const { conversion, networkRecommendations, similarDeals } = data;

  return (
    <div className="intel-card">
      <div className="intel-card__header">
        <span className="intel-card__icon">🧠</span>
        <h3 className="intel-card__title">딜 인텔리전스</h3>
        <div className="intel-card__tabs">
          {(['conversion', 'network', 'deals'] as const).map((t) => (
            <button
              key={t}
              className={`intel-card__tab ${tab === t ? 'intel-card__tab--active' : ''}`}
              onClick={() => setTab(t)}
              type="button"
            >
              {t === 'conversion' ? '성사 예측' : t === 'network' ? '연관 매물' : '유사 딜'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'conversion' && conversion && (
        <div className="intel-card__body">
          {/* Probability gauge */}
          <div className="intel-card__gauge-wrap">
            <div className="intel-card__gauge">
              <svg viewBox="0 0 120 60" className="intel-card__gauge-svg">
                <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#1e293b" strokeWidth="12" />
                <path
                  d="M10,60 A50,50 0 0,1 110,60"
                  fill="none"
                  stroke={conversion.probability >= 0.6 ? '#4ade80' : conversion.probability >= 0.4 ? '#fbbf24' : '#f87171'}
                  strokeWidth="12"
                  strokeDasharray={`${conversion.probability * 157} 157`}
                />
              </svg>
              <div className="intel-card__gauge-label">{conversion.probabilityLabel}</div>
              <div className="intel-card__gauge-sub">딜 성사 예측</div>
            </div>
            <div className="intel-card__gauge-meta">
              <span className={`intel-card__badge intel-card__badge--${conversion.confidence}`}>
                {conversion.confidence === 'high' ? '🟢 높은 신뢰도' : conversion.confidence === 'medium' ? '🟡 보통 신뢰도' : '🔴 참고용 (데이터 축적 중)'}
              </span>
              <span className="intel-card__mode">{conversion.mode === 'model' ? 'ML 모델' : '규칙 기반'}</span>
            </div>
          </div>

          {/* Top factors */}
          <div className="intel-card__factors">
            <div className="intel-card__section-label">주요 영향 요인</div>
            {conversion.topFactors.map((f, i) => (
              <div key={i} className="intel-card__factor-row">
                <span className="intel-card__factor-name">{f.factor}</span>
                <span className={`intel-card__factor-impact ${f.impact.startsWith('+') ? 'intel-card__factor-impact--pos' : 'intel-card__factor-impact--neg'}`}>
                  {f.impact}
                </span>
              </div>
            ))}
          </div>

          {/* Recommended action */}
          <div className="intel-card__action-banner">
            💡 {conversion.recommendedAction}
          </div>
          <p className="intel-card__boundary">{conversion.boundaryNote}</p>
        </div>
      )}

      {tab === 'network' && (
        <div className="intel-card__body">
          {networkRecommendations.length === 0 ? (
            <p className="intel-card__empty">연관 매물이 아직 발견되지 않았습니다. 매칭을 더 실행해보세요.</p>
          ) : (
            <>
              <div className="intel-card__section-label">같은 매수자가 관심 가진 매물</div>
              {networkRecommendations.map((b) => (
                <div key={b.buildingId} className="intel-card__network-row">
                  <div className="intel-card__network-info">
                    <span className="intel-card__network-area">{b.areaSignal}</span>
                    <span className="intel-card__network-asset">{b.assetType}</span>
                    {b.priceBand && <span className="intel-card__network-price">{b.priceBand}</span>}
                  </div>
                  {b.sharedBuyers > 0 && (
                    <span className="intel-card__badge intel-card__badge--indigo">
                      매수자 {b.sharedBuyers}명 공통
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'deals' && (
        <div className="intel-card__body">
          {similarDeals.length === 0 ? (
            <p className="intel-card__empty">유사 딜 사례가 아직 없습니다. 딜이 쌓일수록 정확도가 높아집니다.</p>
          ) : (
            <>
              <div className="intel-card__section-label">
                유사 딜 사례 {data.similarDealsMode === 'semantic' ? '(AI 시맨틱 검색)' : '(텍스트 검색)'}
              </div>
              {similarDeals.map((d, i) => (
                <div key={i} className="intel-card__deal-row">
                  <div className="intel-card__deal-task">{d.task}</div>
                  {d.knowledge && <div className="intel-card__deal-knowledge">{d.knowledge.slice(0, 80)}...</div>}
                  {d.warning && <div className="intel-card__deal-warning">⚠️ {d.warning.slice(0, 60)}...</div>}
                  {d.similarity > 0 && (
                    <span className="intel-card__similarity">유사도 {(d.similarity * 100).toFixed(0)}%</span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
