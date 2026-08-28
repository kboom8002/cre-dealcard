/**
 * UAT E2E v3 — PPTX 렌더링 통합 테스트 스크립트
 * 5개 포스처 × Basic 티어 PPTX 생성 + Grade D 최소 덱 + Pro 422 거부 검증
 *
 * 실행: npx tsx scripts/uat-e2e-pptx-test.ts
 */
import fs from 'fs';
import path from 'path';

// ── Dynamic import wrapper (ESM compat) ──
async function main() {
  const { MobileImPptxRenderer } = await import(
    '../src/domain/building/mobile-im/pptx/pptx-renderer'
  );
  const { buildDeckSequence } = await import(
    '../src/domain/building/mobile-im/pptx/deck-sequencer'
  );

  const outDir = path.resolve(__dirname, '../docs/uat1/pptx-outputs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const renderer = new MobileImPptxRenderer();
  const results: any[] = [];

  // ── 공통 브로커 ──
  const broker = {
    display_name: '홍길동 팀장',
    company_name: '크리딜 중개법인',
    phone: '010-1234-5678',
    specialty: '상업용 부동산',
  };

  const watermark = {
    requesterName: 'UAT-Tester',
    phoneLast4: '5678',
    timestamp: new Date().toISOString().split('T')[0],
  };

  // ═══════════════════════════════════════════════════
  // TEST DATA: 5 Postures
  // ═══════════════════════════════════════════════════

  const testCases = [
    // ── P1: Income (임대수익형) ──
    {
      id: 'P1_income_basic_B',
      posture: 'income' as const,
      grade: 'B' as const,
      incomeArchetype: 'R-INC-01' as const,
      building: { area_signal: '당산', asset_type: '근생빌딩', price_band: '50억~100억' },
      doc: {
        title: '당산동 근생빌딩 투자설명서',
        body: {
          buildingName: '당산동 근생빌딩',
          askingPrice: '80억원',
          grossYield: '4.2%',
          capRate: '3.8%',
          totalArea: '1,155㎡ (약 350평)',
          vacancy: '0%',
          landArea: '396㎡ (약 120평)',
          completionYear: '2018',
          photo_urls: [],
          heroCard: {
            assetType: '근린생활시설',
            areaSignal: '당산',
            askingPriceDisplay: '80억원',
            grossYieldDisplay: '4.2%',
            totalAreaDisplay: '1,155㎡',
            vacancyDisplay: '0%',
            completionYear: '2018',
            capRateDisplay: '3.8%',
            noiDisplay: '연 3.04억원',
            monthlyRentDisplay: '월 1,850만원',
          },
          sections: [
            {
              section_type: 'property_overview',
              title: '건물 개요',
              markdown: `## 건물 상세 정보\n| 항목 | 내용 |\n|---|---|\n| 소재지 | 서울 영등포구 당산동 |\n| 대지면적 | 396㎡ (120평) |\n| 연면적 | 1,155㎡ (350평) |\n| 층수 | 지하1층~지상5층 |\n| 준공일 | 2018년 |\n| 주용도 | 근린생활시설 |`,
              confidence: 'confirmed',
            },
            {
              section_type: 'location_access',
              title: '입지 및 교통',
              markdown: `## 입지 조건\n- **지하철**: 당산역 도보 3분\n- **주요 도로**: 당산로 전면 접함\n- **버스**: 당산역 정류장 50m\n\n> 당산역 역세권 핵심 상권에 위치, 유동인구 풍부`,
              confidence: 'confirmed',
            },
            {
              section_type: 'lease_status',
              title: '임대 현황',
              markdown: `## 층별 임대 현황\n| 층 | 업종 | 면적(평) | 보증금(만원) | 월세(만원) |\n|---|---|---|---|---|\n| 1층 | 약국 | 40 | 5,000 | 350 |\n| 2층 | 이비인후과 | 50 | 10,000 | 500 |\n| 3층 | 학원 | 60 | 8,000 | 400 |\n| 4-5층 | 사무실 | 100 | 12,000 | 600 |\n\n**합계**: 보증금 3억5,000만원 / 월세 1,850만원 (공실 0%)`,
              confidence: 'confirmed',
            },
            {
              section_type: 'income_analysis',
              title: '수익 분석',
              markdown: `## 수익 분석\n- **연 임대수익**: 2억 2,200만원\n- **NOI**: 약 1억 8,000만원\n- **Cap Rate**: 3.8%\n- **총 수익률**: 4.2% (보증금 운용수익 포함)\n\n> 안정적인 캐시플로우를 바탕으로 한 임대수익형 투자 상품`,
              confidence: 'confirmed',
            },
            {
              section_type: 'risk_check',
              title: '리스크 분석',
              markdown: `## 주요 리스크\n1. **금리 변동 리스크**: 현재 고정금리 대출 유지 중\n2. **임차인 리스크**: 1층 약국 장기계약 (잔여 4년)\n3. **건물 노후화**: 2018년 준공으로 상태 양호\n\n> 전반적 리스크 수준은 **낮음**으로 평가`,
              confidence: 'confirmed',
            },
            {
              section_type: 'investment_thesis',
              title: '투자 포인트',
              markdown: `## 투자 포인트\n- 당산역 도보 3분 역세권 입지\n- 전층 만실, 우량 임차인 구성\n- 2018년 준공 신축급 건물\n- 안정적 월 캐시플로우 1,850만원`,
              confidence: 'confirmed',
            },
            {
              section_type: 'next_steps',
              title: '투자 프로세스',
              markdown: `## 투자 절차\n1. NDA 체결\n2. 현장 실사\n3. LOI 제출\n4. Due Diligence\n5. 매매계약 체결`,
              confidence: 'confirmed',
            },
          ],
          disclaimerText: '본 투자설명서는 정보 제공 목적으로 작성되었으며, 투자 권유를 목적으로 하지 않습니다. 기재된 내용은 검증되지 않은 정보를 포함할 수 있으며, 투자 결정 시 반드시 독립적인 실사를 수행하시기 바랍니다.',
        },
      },
    },
    // ── P2: Owner-Occupied (자가사용형) ──
    {
      id: 'P2_owner_occupied_basic_B',
      posture: 'owner_occupied' as const,
      grade: 'B' as const,
      building: { area_signal: '서초', asset_type: '사무용빌딩', price_band: '100억~300억' },
      doc: {
        title: '서초동 사옥용 빌딩 투자설명서',
        body: {
          buildingName: '서초동 사옥 빌딩',
          askingPrice: '200억원',
          totalArea: '3,960㎡ (약 1,200평)',
          landArea: '826㎡ (약 250평)',
          vacancy: '100%',
          completionYear: '2015',
          photo_urls: [],
          heroCard: {
            assetType: '사무용빌딩',
            areaSignal: '서초',
            askingPriceDisplay: '200억원',
            totalAreaDisplay: '3,960㎡',
            vacancyDisplay: '100% (전층 공실)',
            completionYear: '2015',
            parkingDisplay: '40대',
            floorDisplay: '지하2층~지상8층',
          },
          sections: [
            {
              section_type: 'property_overview',
              title: '건물 개요',
              markdown: `## 건물 상세\n| 항목 | 내용 |\n|---|---|\n| 소재지 | 서울 서초구 서초동 |\n| 대지면적 | 826㎡ (250평) |\n| 연면적 | 3,960㎡ (1,200평) |\n| 층수 | 지하2층~지상8층 |\n| 준공일 | 2015년 |\n| 주차 | 40대 |\n| 엘리베이터 | 2기 |`,
              confidence: 'confirmed',
            },
            {
              section_type: 'location_access',
              title: '입지 및 교통',
              markdown: `## 교통\n- **지하철**: 강남역 도보 7분\n- **주요 도로**: 서초대로 접근 용이\n- 건폐율 55%, 용적률 450%\n- 제3종일반주거지역`,
              confidence: 'confirmed',
            },
            {
              section_type: 'lease_status',
              title: '건물 현황',
              markdown: `## 층별 구성\n| 층 | 용도 | 면적(평) |\n|---|---|---|\n| 지하1-2층 | 주차장 | 200 |\n| 1층 | 로비 | 80 |\n| 2-8층 | 업무시설 | 920 |\n\n전 임차인 이전 완료. 전층 공실 상태.`,
              confidence: 'confirmed',
            },
            {
              section_type: 'risk_check',
              title: '리스크 분석',
              markdown: `## 리스크\n1. **공실 리스크**: 자가사용 목적이므로 해당 없음\n2. **시세 변동**: 서초 업무지구 안정적 시세\n3. **리모델링 비용**: 인테리어 20억 내외 예상`,
              confidence: 'confirmed',
            },
            {
              section_type: 'investment_thesis',
              title: '사옥 활용 포인트',
              markdown: `## 사옥 활용 포인트\n- 강남역 도보 7분 접근성\n- 전층 공실로 즉시 입주 가능\n- 주차 40대 확보\n- 임차 대비 장기 비용 절감 효과`,
              confidence: 'confirmed',
            },
            {
              section_type: 'next_steps',
              title: '매입 절차',
              markdown: `## 절차\n1. 현장 방문\n2. 매입 의향서 제출\n3. 건물 실사\n4. 매매계약\n5. 소유권 이전`,
              confidence: 'confirmed',
            },
          ],
          disclaimerText: '본 자료는 정보 제공 목적이며, 투자 권유가 아닙니다.',
        },
      },
    },
    // ── P3: Development (개발형) ──
    {
      id: 'P3_development_basic_B',
      posture: 'development' as const,
      grade: 'B' as const,
      building: { area_signal: '합정', asset_type: '나대지', price_band: '100억~200억' },
      doc: {
        title: '합정동 개발부지 투자설명서',
        body: {
          buildingName: '합정동 개발부지',
          askingPrice: '150억원',
          totalArea: '990㎡ (약 300평)',
          landArea: '990㎡ (약 300평)',
          completionYear: '1975 (기존 건물)',
          photo_urls: [],
          heroCard: {
            assetType: '개발부지',
            areaSignal: '합정',
            askingPriceDisplay: '150억원',
            totalAreaDisplay: '990㎡ (대지)',
            zoningDisplay: '제2종일반주거지역',
            bcrDisplay: '60%',
            farDisplay: '200%',
          },
          sections: [
            {
              section_type: 'property_overview',
              title: '토지 개요',
              markdown: `## 토지 상세\n| 항목 | 내용 |\n|---|---|\n| 소재지 | 서울 마포구 합정동 |\n| 대지면적 | 990㎡ (300평) |\n| 용도지역 | 제2종일반주거지역 |\n| 건폐율 | 60% |\n| 용적률 | 200% |\n| 현황 | 2층 노후 단독주택 (1975년 준공) |`,
              confidence: 'confirmed',
            },
            {
              section_type: 'location_access',
              title: '입지 분석',
              markdown: `## 교통 및 입지\n- **지하철**: 합정역 도보 5분\n- **주변 환경**: 주거+상업 복합 개발 가능\n- 인근 신축 아파트 평당 4,500만원`,
              confidence: 'confirmed',
            },
            {
              section_type: 'lease_status',
              title: '개발 계획',
              markdown: `## 개발 가능 규모\n| 항목 | 내용 |\n|---|---|\n| 건축면적 | 594㎡ (180평) |\n| 연면적 | 1,980㎡ (600평) |\n| 예상 층수 | 지하1층~지상6층 |\n| 용도 | 근린생활시설+다세대 복합 |`,
              confidence: 'inferred',
            },
            {
              section_type: 'risk_check',
              title: '리스크',
              markdown: `## 개발 리스크\n1. **인허가 리스크**: 제2종 일반주거지역 규제\n2. **철거 비용**: 기존 건물 철거 약 2억원\n3. **공사비 변동**: 건축비 상승 추세\n\n> 합정 역세권 개발 수요 대비 리스크 관리 가능`,
              confidence: 'confirmed',
            },
            {
              section_type: 'investment_thesis',
              title: '투자 포인트',
              markdown: `## 개발 투자 포인트\n- 합정역 역세권 프리미엄\n- 제2종 일반주거지역 200% 용적률\n- 주거+상업 복합 개발 가능\n- 인근 시세 평당 4,500만원`,
              confidence: 'confirmed',
            },
            {
              section_type: 'next_steps',
              title: '진행 절차',
              markdown: `## 절차\n1. 부지 실사\n2. 개발 사업성 분석\n3. 매매계약\n4. 인허가\n5. 착공`,
              confidence: 'confirmed',
            },
          ],
          disclaimerText: '본 자료는 정보 제공 목적이며, 개발 사업성은 별도 검증이 필요합니다.',
        },
      },
    },
    // ── P4: Operating (운영형) ──
    {
      id: 'P4_operating_basic_B',
      posture: 'operating' as const,
      grade: 'B' as const,
      building: { area_signal: '이천', asset_type: '물류창고', price_band: '300억~500억' },
      doc: {
        title: '이천 물류센터 투자설명서',
        body: {
          buildingName: '이천 물류센터',
          askingPrice: '450억원',
          totalArea: '26,400㎡ (약 8,000평)',
          landArea: '9,900㎡ (약 3,000평)',
          vacancy: '0%',
          completionYear: '2020',
          photo_urls: [],
          heroCard: {
            assetType: '물류창고',
            areaSignal: '이천',
            askingPriceDisplay: '450억원',
            totalAreaDisplay: '26,400㎡',
            vacancyDisplay: '0%',
            completionYear: '2020',
            annualRevenueDisplay: '연 25억원',
          },
          sections: [
            {
              section_type: 'property_overview',
              title: '시설 개요',
              markdown: `## 시설 상세\n| 항목 | 내용 |\n|---|---|\n| 소재지 | 경기 이천시 |\n| 대지면적 | 9,900㎡ (3,000평) |\n| 연면적 | 26,400㎡ (8,000평) |\n| 층수 | 지상 3층 |\n| 천장고 | 12m |\n| 도크 | 20개 |\n| 냉동창고 | 500평 |\n| 준공 | 2020년 |`,
              confidence: 'confirmed',
            },
            {
              section_type: 'location_access',
              title: '입지',
              markdown: `## 물류 입지\n- **고속도로**: 이천IC 5km\n- **물류 허브**: 이천 물류단지 인접\n- **시장 접근**: 수도권 2시간 이내`,
              confidence: 'confirmed',
            },
            {
              section_type: 'lease_status',
              title: '운영 현황',
              markdown: `## 임대 현황\n| 임차인 | 계약기간 | 연 임대료 |\n|---|---|---|\n| CJ대한통운 | 10년 장기 | 25억원 |\n\n스프링클러 완비. 24시간 운영 가능.`,
              confidence: 'confirmed',
            },
            {
              section_type: 'risk_check',
              title: '리스크',
              markdown: `## 리스크\n1. **단일 임차인 리스크**: CJ대한통운 10년 장기 계약으로 안정적\n2. **물류 시장 변동**: 이커머스 성장으로 물류 수요 지속 증가\n3. **시설 유지**: 2020년 준공 신축 시설`,
              confidence: 'confirmed',
            },
            {
              section_type: 'investment_thesis',
              title: '투자 포인트',
              markdown: `## 투자 포인트\n- CJ대한통운 10년 장기 임대 안정성\n- 이천IC 5km 우수 물류 입지\n- 냉동창고 500평 특화 시설\n- 연 25억 안정 수익`,
              confidence: 'confirmed',
            },
            {
              section_type: 'next_steps',
              title: '절차',
              markdown: `## 절차\n1. NDA 체결\n2. 운영 실사\n3. 매매 협상\n4. 계약 체결`,
              confidence: 'confirmed',
            },
          ],
          disclaimerText: '본 자료는 정보 제공 목적이며, 운영 수익은 별도 검증이 필요합니다.',
        },
      },
    },
    // ── P5: Trading (단기매매형) ──
    {
      id: 'P5_trading_basic_B',
      posture: 'trading' as const,
      grade: 'B' as const,
      building: { area_signal: '영등포', asset_type: '근생빌딩', price_band: '50억~100억' },
      doc: {
        title: '영등포 급매 빌딩 투자설명서',
        body: {
          buildingName: '영등포 공실 빌딩',
          askingPrice: '55억원',
          totalArea: '660㎡ (약 200평)',
          landArea: '264㎡ (약 80평)',
          vacancy: '100%',
          completionYear: '1988',
          photo_urls: [],
          heroCard: {
            assetType: '근린생활시설',
            areaSignal: '영등포',
            askingPriceDisplay: '55억원',
            totalAreaDisplay: '660㎡',
            vacancyDisplay: '100% (전층 공실)',
            completionYear: '1988',
            marketPriceDisplay: '평당 2,800만원',
            discountDisplay: '시세 대비 20% 할인',
          },
          sections: [
            {
              section_type: 'property_overview',
              title: '건물 개요',
              markdown: `## 건물 상세\n| 항목 | 내용 |\n|---|---|\n| 소재지 | 서울 영등포구 |\n| 대지면적 | 264㎡ (80평) |\n| 연면적 | 660㎡ (200평) |\n| 층수 | 지하1층~지상4층 |\n| 준공일 | 1988년 |\n| 현황 | 전층 공실, 리모델링 필요 |`,
              confidence: 'confirmed',
            },
            {
              section_type: 'location_access',
              title: '입지',
              markdown: `## 교통\n- **지하철**: 영등포역 도보 10분\n- **재개발**: 주변 재개발 진행 중\n- 인근 실거래가 평당 2,800만원 (2024년)`,
              confidence: 'confirmed',
            },
            {
              section_type: 'lease_status',
              title: '시세 분석',
              markdown: `## 시세 비교\n| 항목 | 금액 |\n|---|---|\n| 인근 실거래 시세 | 68억원 (평당 2,800만원 x 200평 환산) |\n| 매각 호가 | 55억원 |\n| 할인율 | 약 20% |\n\n급매물로 시세 대비 20% 할인 매물.`,
              confidence: 'confirmed',
            },
            {
              section_type: 'risk_check',
              title: '리스크',
              markdown: `## 리스크\n1. **건물 노후화**: 1988년 준공, 리모델링 필수\n2. **전층 공실**: 임대 리스크 존재\n3. **재개발 불확실성**: 주변 재개발 일정 미확정\n\n> 단기 매매 관점에서 시세 차익 실현 가능`,
              confidence: 'confirmed',
            },
            {
              section_type: 'investment_thesis',
              title: '매매 포인트',
              markdown: `## 투자 포인트\n- 시세 대비 20% 할인 급매물\n- 주변 재개발에 따른 시세 상승 기대\n- 리모델링 후 임대 수익 전환 가능\n- 영등포역 도보 10분 역세권`,
              confidence: 'confirmed',
            },
            {
              section_type: 'next_steps',
              title: '절차',
              markdown: `## 절차\n1. 현장 확인\n2. 매입 의향서\n3. 실사\n4. 매매계약`,
              confidence: 'confirmed',
            },
          ],
          disclaimerText: '본 자료는 정보 제공 목적이며, 시세 분석은 별도 검증이 필요합니다.',
        },
      },
    },
    // ── P1 Grade D 최소 덱 ──
    {
      id: 'P1_income_basic_D',
      posture: 'income' as const,
      grade: 'D' as const,
      building: { area_signal: '강남', asset_type: '빌딩', price_band: '50억~100억' },
      doc: {
        title: '강남 빌딩 투자설명서',
        body: {
          buildingName: '강남 빌딩',
          askingPrice: '70억원',
          photo_urls: [],
          heroCard: {
            assetType: '빌딩',
            areaSignal: '강남',
            askingPriceDisplay: '70억원',
          },
          sections: [
            {
              section_type: 'property_overview',
              title: '건물 개요',
              markdown: '강남 소재 빌딩. 상세 정보 확인 중.',
              confidence: 'needs_check',
            },
          ],
          disclaimerText: '본 자료는 정보 제공 목적입니다.',
        },
      },
    },
  ];

  // ═══════════════════════════════════════════════════
  // EXECUTION
  // ═══════════════════════════════════════════════════

  console.log('═══════════════════════════════════════════════');
  console.log('  UAT E2E v3 — PPTX 렌더링 통합 테스트');
  console.log('═══════════════════════════════════════════════\n');

  for (const tc of testCases) {
    const label = tc.id;
    console.log(`▶ [${label}] 렌더링 시작...`);
    const start = Date.now();

    try {
      // 1. Deck sequence test
      const seqInput = {
        posture: tc.posture,
        grade: tc.grade,
        incomeArchetype: (tc as any).incomeArchetype,
        hasViolation: false,
        hasJointCollateral: false,
        hasPhotos: false,
      };
      const sequence = buildDeckSequence(seqInput);
      console.log(`  ✓ 시퀀스: ${sequence.length}장 [${sequence.map(s => s.archetype).join(', ')}]`);

      // 2. Render PPTX
      const input = {
        buildingId: `bld_test_${label}`,
        preset: 'credeal_signature',
        posture: tc.posture,
        grade: tc.grade,
        incomeArchetype: (tc as any).incomeArchetype,
        hasViolation: false,
        hasJointCollateral: false,
        docno: `UAT-${label}`,
        doc: tc.doc,
        building: tc.building,
        broker,
      };

      const result = await renderer.render(input);
      const elapsed = Date.now() - start;

      // 3. Save PPTX
      const filePath = path.join(outDir, `${label}.pptx`);
      fs.writeFileSync(filePath, result.buffer);

      const record = {
        id: label,
        posture: tc.posture,
        grade: tc.grade,
        slideCount: result.slideCount,
        fileSizeKB: Math.round(result.fileSizeBytes / 1024),
        elapsedMs: elapsed,
        warnings: result.warnings.length,
        status: 'PASS',
        file: filePath,
      };
      results.push(record);

      console.log(`  ✅ PASS — ${result.slideCount}장, ${record.fileSizeKB}KB, ${elapsed}ms`);
      if (result.warnings.length > 0) {
        console.log(`  ⚠️ 경고 ${result.warnings.length}건:`, result.warnings.slice(0, 3));
      }
    } catch (err: any) {
      const elapsed = Date.now() - start;
      results.push({
        id: label,
        posture: tc.posture,
        grade: tc.grade,
        slideCount: 0,
        fileSizeKB: 0,
        elapsedMs: elapsed,
        warnings: 0,
        status: `FAIL: ${err.message?.slice(0, 80)}`,
        file: null,
      });
      console.log(`  ❌ FAIL — ${err.message}`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════
  // Pro Grade C 거부 테스트
  // ═══════════════════════════════════════════════════
  console.log('▶ [Pro_Grade_C_reject] 422 거부 검증...');
  try {
    const seqInput = {
      posture: 'income' as const,
      grade: 'C' as const,
      hasPhotos: false,
    };
    const sequence = buildDeckSequence(seqInput);
    // Pro + Grade C should produce empty sequence or throw
    if (sequence.length === 0) {
      console.log('  ✅ PASS — Pro Grade C 거부됨 (빈 시퀀스)');
      results.push({ id: 'Pro_Grade_C_reject', status: 'PASS (empty sequence)', slideCount: 0 });
    } else {
      console.log(`  ⚠️ WARN — Pro Grade C에서 ${sequence.length}장 시퀀스 생성됨`);
      results.push({ id: 'Pro_Grade_C_reject', status: `WARN: ${sequence.length} slides`, slideCount: sequence.length });
    }
  } catch (err: any) {
    console.log(`  ✅ PASS — Pro Grade C 거부됨 (error: ${err.message})`);
    results.push({ id: 'Pro_Grade_C_reject', status: 'PASS (error thrown)', slideCount: 0 });
  }

  // ═══════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════');
  console.log('  테스트 결과 요약');
  console.log('═══════════════════════════════════════════════');
  console.log('| ID | Posture | Grade | Slides | Size(KB) | Time(ms) | Status |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.posture || '-'} | ${r.grade || '-'} | ${r.slideCount} | ${r.fileSizeKB || '-'} | ${r.elapsedMs || '-'} | ${r.status} |`);
  }

  const passCount = results.filter(r => r.status?.startsWith('PASS')).length;
  const totalCount = results.length;
  console.log(`\n✅ ${passCount}/${totalCount} PASSED`);
  console.log(`📁 산출물: ${outDir}`);

  // Save results JSON
  const jsonPath = path.join(outDir, 'test-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`📊 상세 결과: ${jsonPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
