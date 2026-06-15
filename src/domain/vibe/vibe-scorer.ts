import { BrokerStats } from "@/domain/broker-card/broker-stats-aggregator";

export interface VibeScores {
  valence: number;
  trust: number;
}

/**
 * 브로커의 통계(BrokerStats)를 기반으로 Vibe Score(호감도, 신뢰도)를 0~100 스케일로 계산합니다.
 */
export function calculateVibeScores(stats: BrokerStats): VibeScores {
  // 기본 점수 50점에서 시작
  let valence = 50;
  let trust = 50;

  // 1. Trust (신뢰도) 계산
  // - 딜카드 수가 많을수록 신뢰도 증가 (최대 +25점)
  const dealScore = Math.min(stats.totalDealCards * 2, 25);
  // - 케이스팩이 많을수록 신뢰도 증가 (최대 +15점)
  const casepackScore = Math.min(stats.totalCasePacks * 3, 15);
  // - 평균 딜 소요일이 짧을수록 신뢰도 증가 (빠른 거래) (최대 +10점)
  const speedScore = stats.avgDealDays > 0 ? Math.max(0, 10 - Math.floor(stats.avgDealDays / 10)) : 0;
  
  trust += dealScore + casepackScore + speedScore;

  // 2. Valence (호감/매력도) 계산
  // - S/A 등급 매칭률이 높을수록 호감도 증가 (최대 +30점)
  const matchScore = Math.round(stats.sGradeMatchRate * 30);
  // - 활성 딜(Active Deals)이 적절히 있을 때 매력도 증가 (최대 +20점)
  const activeScore = Math.min(stats.activeDealCount * 4, 20);
  
  valence += matchScore + activeScore;

  // 최대 100점 캡
  return {
    valence: Math.min(Math.max(valence, 0), 100),
    trust: Math.min(Math.max(trust, 0), 100),
  };
}
