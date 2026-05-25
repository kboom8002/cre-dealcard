import { z } from "zod/v4";

export const SnapshotDraftSchema = z.object({
  headline: z.string().max(80),        // 한 줄 자산 소개
  area_signal: z.string(),             // 권역 (정확 주소 불가)
  asset_type: z.string(),
  size_signal: z.string(),             // "연면적 약 2,400㎡"
  price_band: z.string(),
  current_use_summary: z.string(),     // "복합 근생 (1F 리테일 + 2-5F 오피스)"
  deal_thesis: z.string().max(300),    // 핵심 딜 포인트 (3~5문장)
  risk_summary: z.string().max(200),   // 리스크 요약 (2~3문장)
  financial_snapshot: z.object({
    vacancy_rate_note: z.string(),     // "현재 공실률 약 5% (추정)"
    walt_note: z.string(),             // "WALT 약 2.1년 (브로커 제공)"
    income_note: z.string(),           // "연간 잠정 임대 소득 참고 수준"
  }),
  buyer_fit_types: z.array(z.string()).max(5),
  missing_data_note: z.string(),       // 빠진 데이터 안내
  boundary_disclaimer: z.literal(
    '본 자료는 중개인이 제공한 참고용 정보로, 투자 권유나 법적 확약이 아닙니다. 상세 실사 및 전문가 검토가 필요합니다.'
  ),
  document_version: z.string().default('v0.3-snapshot'),
});

export type SnapshotDraft = z.infer<typeof SnapshotDraftSchema>;
