/**
 * @module PitchGenerator
 * @description Generates customized pitching messages for buyers based on relationship temperature (cold vs warm).
 */

export type PitchMode = 'cold' | 'warm';

export interface BuyerContext {
  name: string;
  investmentStyle: string;
  recentInteractions: number;
}

export interface DealContext {
  id: string;
  title: string;
  highlight: string;
}

export interface PitchMessage {
  subject: string;
  body: string;
  mode: PitchMode;
}

export function generatePitchMessage(deal: DealContext, buyer: BuyerContext, mode: PitchMode): PitchMessage {
  if (mode === 'warm') {
    return {
      mode,
      subject: `[CREDEAL] ${buyer.name}님, 최근 관심가지신 ${deal.title} 관련 추천 딜입니다`,
      body: `안녕하세요 ${buyer.name}님,\n\n최근 저희와 논의하셨던 ${buyer.investmentStyle} 투자 성향에 딱 맞는 물건이 나와서 가장 먼저 연락드렸습니다.\n\n[핵심 투자포인트]\n${deal.highlight}\n\n상세한 IM이 준비되어 있으니 편하실 때 연락주시면 브리핑 드리겠습니다.\n\n감사합니다.`,
    };
  }

  // Cold mode
  return {
    mode,
    subject: `[CREDEAL] 우량 매물 소개: ${deal.title}`,
    body: `대표님 안녕하십니까,\n\nCREDEAL을 통해 발굴된 우량 매물을 소개드립니다.\n\n[핵심 투자포인트]\n${deal.highlight}\n\n${buyer.investmentStyle} 관점에서 매우 매력적인 자산으로 판단됩니다. 관심 있으시면 상세 자료(Teaser)를 송부드리겠습니다.\n\n감사합니다.`,
  };
}
