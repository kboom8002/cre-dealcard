/**
 * src/domain/magazine/templates/types.ts — 이메일/알림톡 렌더 입력 계약 (G-05 ↔ B1 distribute-*)
 *
 * 필수 필드는 B1과 합의한 계약 시그니처. 선택(extra) 필드는 생성기 타입과 맞춘 확장 섹션이며,
 * 값이 없으면 섹션 자체를 렌더하지 않는다(가짜 폴백 금지).
 */
import type { TaxClinicScenario } from '../tax-clinic-generator';

export interface MagazineDealInput {
  title: string;
  /** 공개 지번 — 렌더 시 maskAddress()로 동 단위까지만 표시 (P0-05 M2-02) */
  address?: string;
  /** 원 단위 숫자 또는 '12.5억' 같은 표기 문자열 (NaN/undefined 표기는 숨김) */
  price?: string | number;
  /** 거래일(YYYY-MM-DD) */
  date?: string;
}

/** 세무 클리닉: 생성기 타입(TaxClinicScenario)과 동일 계약. 일부만 있어도 렌더(없는 항목은 생략). */
export type MagazineTaxClinicInput = Partial<Pick<TaxClinicScenario, 'title' | 'scenario' | 'conclusion'>> & {
  comparison?: {
    optionA?: { name?: string; description?: string; expectedTaxInfo?: string };
    optionB?: { name?: string; description?: string; expectedTaxInfo?: string };
  };
};

export interface MagazineEmailInput {
  /** profiles.display_name — 비어 있으면 렌더 거부(MISSING_SENDER). slug/'담당 중개사' 폴백 금지(M2-26) */
  brokerName: string;
  /** 전송자 연락처(전화번호 등). 없으면 hasSenderContact=false → sendGate가 차단해야 한다 */
  brokerContact?: string;
  subscriberName?: string;
  edition: {
    title: string;
    headline: string;
    /** MarketTemperature 라벨. 지원 라벨이 아니면 배지를 숨긴다 */
    marketTemp: string;
    /** YYYY-MM-DD (KST 발행일). 비어 있으면 날짜 표기 생략 */
    date: string;
    /** 매거진 뷰어 절대 https URL */
    url: string;
    deals?: MagazineDealInput[];
    fieldNote?: { question?: string; comment?: string } | null;
    topNews?: Array<{ title?: string; source?: string }>;
    taxClinic?: MagazineTaxClinicInput | null;
  };
  /** 구독자별 서명 해지 링크(절대 https). 필수 */
  unsubscribeUrl: string;
  /** 전송자 주소(선택, footer 표기) */
  senderAddress?: string;
  /** 수신 동의 일자(YYYY-MM-DD, 선택, footer 표기) */
  consentDate?: string;
  /** 광고성 정보 표기. 반드시 true */
  isAd: true;
}

export interface MagazineEmailRendered {
  subject: string;
  html: string;
  text: string;
  hasUnsubscribeLink: boolean;
  hasAdLabel: boolean;
  /** footer에 전송자 연락처가 표기되었는가(없으면 sendGate가 MISSING_SENDER로 차단) */
  hasSenderContact: boolean;
}

export interface MagazineKakaoRendered {
  text: string;
  hasUnsubscribeLink: boolean;
  hasAdLabel: boolean;
}

/** 렌더 거부 사유(throw 시 error.code) */
export class MagazineRenderError extends Error {
  constructor(
    public readonly code: 'MISSING_SENDER' | 'MISSING_AD_FLAG' | 'INVALID_URL' | 'MISSING_UNSUB_LINK',
    message: string,
  ) {
    super(message);
    this.name = 'MagazineRenderError';
  }
}
