import JSZip from 'jszip';
import type { InvestmentPosture } from '@/domain/ontology';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';

/** 포스처별 메타데이터 */
export const BUILDING_META: Record<string, { area_signal: string; asset_type: string; price_band: string }> = {
  income: { area_signal: '서초권역', asset_type: '메디컬빌딩', price_band: '165억' },
  owner_occupied: { area_signal: '성수권역', asset_type: '사옥', price_band: '135억' },
  development: { area_signal: '강남권역', asset_type: '신축부지', price_band: '210억' },
  operating: { area_signal: '이천권역', asset_type: '물류센터', price_band: '450억' },
  trading: { area_signal: '강남권역', asset_type: '노후빌딩', price_band: '98억' },
};

/** 포스처별 최소 유효 doc 구조 생성 */
export function buildMinimalDoc(posture: InvestmentPosture): MobileImPptxInput['doc'] {
  const sectionMap: Record<string, Array<{ title: string; markdown: string; section_type: string }>> = {
    income: [
      { title: '물건 개요', markdown: '서초 메디컬 빌딩은 지하2층~지상7층 규모의 올근생 빌딩입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지면적 | 142.5평 |\n| 연면적 | 620.8평 |\n| 준공 | 2017년 |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '강남역·양재역 더블역세권 도보 4분 거리에 위치합니다.', section_type: 'location_access' },
      { title: '임대차 현황', markdown: '전층 메디컬 만실 운영 중이며 WALE 평균 3.5년입니다.\n\n| 층 | 업종 | 보증금 | 월세 |\n|---|---|---|---|\n| 1F | 약국 | 3억 | 1,200만 |\n| 2F | 안과 | 2억 | 1,100만 |', section_type: 'lease_status' },
      { title: '수익성 분석', markdown: '연 순영업소득(NOI) 약 7.14억 원, 매입 Cap Rate 4.62%입니다.\n\n- 실투자금: 약 69억 원\n- 순수익(매월): 약 3,650만 원\n- 레버리지 수익률: 약 5.8%', section_type: 'income_analysis' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 메디컬 단일업종 집중 | 전층 의료 | 업종 다각화 검토 |\n| 금리 변동 | 4.1% 고정 | 승계 대출 활용 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '60대 자산가 관점에서 안정적 월 임대수익과 우량 메디컬 테넌트를 보유한 핵심 투자 자산입니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '현장 실사 및 임대차계약서 원본 확인을 권장합니다.', section_type: 'next_steps' },
    ],
    owner_occupied: [
      { title: '물건 개요', markdown: '성수 IT밸리 단독 통사옥 빌딩입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 연면적 | 512.4평 |\n| 층고 | 4.2m |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '성수역 3번 출구 도보 5분입니다.', section_type: 'location_access' },
      { title: '사옥 적합성', markdown: '전층 명도 완료, 즉시 사옥 입주 가능합니다.\n\n- 자주식 주차 12대\n- 옥상 휴게정원', section_type: 'occupancy_fit' },
      { title: '비용 비교', markdown: '자가 vs 임차 연간 비용 비교 결과, 약 2.5억 원 절감 효과가 있습니다.', section_type: 'cost_comparison' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 준공업 용도제한 | IT 허용 | 사전 확인 완료 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '성수 IT산업 거점으로서의 입지 가치와 통사옥 희소성을 갖추고 있습니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '사옥 활용 레이아웃 설계 및 인테리어 비용 산정을 권장합니다.', section_type: 'next_steps' },
    ],
    development: [
      { title: '물건 개요', markdown: '역삼동 테헤란로 이면 코너 신축 부지입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지면적 | 168.5평 |\n| 용도지역 | 제3종일반주거 |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '역삼역 도보 4분, 테헤란로 메인 이면입니다.', section_type: 'location_access' },
      { title: '부지 분석', markdown: '건폐율 50%, 용적률 250% 적용 시 약 680평 신축 가능합니다.', section_type: 'site_analysis' },
      { title: '개발 사업성', markdown: '예상 개발이익률 약 28%, 완공 후 자산가치 350억 상회 전망입니다.', section_type: 'development_feasibility' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 인허가 지연 | 사전협의 완료 | 2개월 내 착수 가능 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '테헤란로 프라임 입지의 개발 가치와 용적률 잔여 활용 가능성이 핵심입니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '건축 설계 발주 및 인허가 일정 협의를 권장합니다.', section_type: 'next_steps' },
    ],
    operating: [
      { title: '물건 개요', markdown: '이천 물류센터 3층 규모 냉동냉장 겸용 시설입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지 | 3,000평 |\n| 연면적 | 5,500평 |\n| 천장고 | 12m |\n| 도크 | 12개 |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '영동고속도로 이천IC 3km 거리에 위치합니다.', section_type: 'location_access' },
      { title: '운영 현황', markdown: 'CJ대한통운 10년 장기계약 만실 운영 중입니다.', section_type: 'operation_overview' },
      { title: 'GOP 분석', markdown: '월 운영수익 1.2억, GOP 마진율 약 65%입니다.\n\n| 지표 | 수치 |\n|---|---|\n| ADR | 85만 원 |\n| OCC | 95% |\n| RevPAR | 80.75만 원 |', section_type: 'gop_analysis' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 단일 임차인 | CJ 10년 | 장기계약 보장 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '3PL 대형 임차인의 장기 안정수익과 냉동냉장 특화 시설의 희소성이 핵심입니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '임대차계약서 원본 및 시설 점검 보고서 확인을 권장합니다.', section_type: 'next_steps' },
    ],
    trading: [
      { title: '물건 개요', markdown: '신사동 가로수길 이면 코너 노후 빌딩입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지 | 102.3평 |\n| 연면적 | 215.4평 |\n| 준공 | 1988년 |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '신사역 도보 5분, 가로수길 세로수길 상권 접면입니다.', section_type: 'location_access' },
      { title: '시장 포지션', markdown: '시세 대비 15% 저평가, 용적률 여유 35% 보유입니다.', section_type: 'market_position' },
      { title: '비교 분석', markdown: '인근 유사 매물 대비 평당가가 약 15% 낮은 수준입니다.\n\n| 비교항목 | 본건 | 인근 시세 |\n|---|---|---|\n| 평당 매매가 | 9,580만 | 11,200만 |', section_type: 'comparable_analysis' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 노후 설비 | 36년 | 대수선 예산 반영 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '가로수길 프리미엄 입지의 저평가 기회와 증축/리모델링 밸류애드 잠재력이 핵심입니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '건축사 사전 상담 및 대수선 비용 산정을 권장합니다.', section_type: 'next_steps' },
    ],
  };
  return {
    title: `${posture} 포스처 테스트 문서`,
    body: {},
    sections: sectionMap[posture as string] || [],
  };
}

/** PPTX 바이너리에서 슬라이드별 텍스트 추출 */
export async function extractSlideTexts(buffer: Buffer): Promise<Map<number, string[]>> {
  const zip = await JSZip.loadAsync(buffer);
  const slideMap = new Map<number, string[]>();

  const regex = /ppt\/slides\/slide(\d+)\.xml/;
  const files = Object.keys(zip.files).filter(f => regex.test(f));

  for (const filename of files) {
    const match = regex.exec(filename);
    if (!match) continue;
    const slideNumber = parseInt(match[1], 10);

    const content = await zip.file(filename)!.async('string');
    const texts: string[] = [];
    const textRegex = /<a:t[^>]*>([^<]+)<\/a:t>/g;
    let textMatch;
    while ((textMatch = textRegex.exec(content)) !== null) {
      const extractedText = textMatch[1].trim();
      if (extractedText) {
        texts.push(extractedText);
      }
    }
    slideMap.set(slideNumber, texts);
  }

  return slideMap;
}

/** PPTX 바이너리에서 슬라이드별 XML 원본 추출 */
export async function extractSlideXmls(buffer: Buffer): Promise<Map<number, string>> {
  const zip = await JSZip.loadAsync(buffer);
  const slideXmlMap = new Map<number, string>();

  const regex = /ppt\/slides\/slide(\d+)\.xml/;
  const files = Object.keys(zip.files).filter(f => regex.test(f));

  for (const filename of files) {
    const match = regex.exec(filename);
    if (!match) continue;
    const slideNumber = parseInt(match[1], 10);
    const content = await zip.file(filename)!.async('string');
    slideXmlMap.set(slideNumber, content);
  }

  return slideXmlMap;
}

/** PPTX 바이너리 내 오염 문자열(NaN, undefined, null, [object Object]) 부재 검증 */
export async function assertNoCorruptionStrings(buffer: Buffer): Promise<void> {
  const xmlMap = await extractSlideXmls(buffer);
  const corruptPatterns: [RegExp, string][] = [
    // 기존: 태그 사이 오염
    [/>\s*NaN\s*</, 'NaN in text node'],
    [/>\s*undefined\s*</, 'undefined in text node'],
    [/>\s*null\s*</, 'null in text node'],
    [/\[object Object\]/, '[object Object]'],
    // 확장: 단위 결합 오염 (한국 숫자 단위)
    [/NaN[%원만억천㎡평]/, 'NaN + unit suffix'],
    [/undefined\s*[원만억천%㎡평]/, 'undefined + unit suffix'],
    // 확장: XML 속성 값 오염
    [/val="(NaN|undefined|null)"/, 'corrupted XML attribute value'],
    // 확장: 숫자열 중간 오염
    [/\d+,NaN/, 'NaN in number sequence'],
  ];

  for (const [slideNum, xml] of xmlMap) {
    for (const [pattern, label] of corruptPatterns) {
      if (pattern.test(xml)) {
        throw new Error(`Slide ${slideNum} contains corrupted text: ${label} (pattern: ${pattern})`);
      }
    }
  }
}
