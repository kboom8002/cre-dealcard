/**
 * @module buyer-temperature
 * @description 매거진 독자 및 고객의 매수 참여도와 프로필 완성도를 결합한 5단계 매수 온도 판별기.
 */
import { computeEngagementScore, type InterestProfile } from "./subscriber-profile";

export type BuyerTemperature = '🔥 적극검토' | '📈 관심' | '⏸️ 관망' | '❄️ 냉각' | '⚪ 미확인';

export interface TemperatureTierConfig {
  label: BuyerTemperature;
  color: string;
  badgeBg: string;
  minScore: number;
  description: string;
}

export const TEMPERATURE_TIERS: TemperatureTierConfig[] = [
  {
    label: '🔥 적극검토',
    color: '#ef4444',
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    minScore: 80,
    description: '매수 예산 및 희망 권역이 명확하며 최근 14일 내 고관여 행동을 보인 핫리드',
  },
  {
    label: '📈 관심',
    color: '#10b981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    minScore: 60,
    description: '정기적으로 매거진을 열람하고 특정 권역 매물에 높은 관심을 보이는 투자자',
  },
  {
    label: '⏸️ 관망',
    color: '#f59e0b',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    minScore: 40,
    description: '시장 동향과 금리 리포트를 주시하며 매수 타이밍을 저울질 중인 독자',
  },
  {
    label: '❄️ 냉각',
    color: '#94a3b8',
    badgeBg: 'rgba(148, 163, 184, 0.12)',
    minScore: 20,
    description: '최근 30일간 열람 빈도가 낮거나 반응이 뜸한 구독자',
  },
  {
    label: '⚪ 미확인',
    color: '#64748b',
    badgeBg: 'rgba(100, 116, 139, 0.1)',
    minScore: 0,
    description: '관심사 프로필이나 열람 데이터가 아직 충분치 않은 신규 구독자',
  },
];

/**
 * 구독자의 interest_profile (0~100) 및 cross-channel 점수를 결합하여 매수 온도를 산출합니다.
 */
export function getBuyerTemperature(
  profileOrEngagement: InterestProfile | number | null | undefined,
  crossChannelScore: number = 0
): TemperatureTierConfig {
  const engagement =
    typeof profileOrEngagement === 'number'
      ? profileOrEngagement
      : profileOrEngagement
      ? computeEngagementScore(profileOrEngagement)
      : 0;

  // 가중 복합 점수: 참여도 40% + 크로스채널 행동점수 60%
  const composite = Math.round(engagement * 0.4 + Math.min(crossChannelScore, 100) * 0.6);

  for (const tier of TEMPERATURE_TIERS) {
    if (composite >= tier.minScore) {
      return tier;
    }
  }

  return TEMPERATURE_TIERS[TEMPERATURE_TIERS.length - 1];
}
