import fs from 'fs';
import path from 'path';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';

async function main() {
  const r = new MobileImPptxRenderer();
  const result = await r.render({
    buildingId: 'bld_P1',
    preset: 'credeal_signature',
    posture: 'income' as const,
    grade: 'B' as const,
    incomeArchetype: 'R-INC-01' as const,
    docno: 'UAT-P1',
    doc: {
      title: '당산동 근생빌딩 투자설명서',
      body: {
        heroCard: {
          askingPriceDisplay: '80억원',
          grossYieldDisplay: '4.2%',
          totalAreaDisplay: '1,155㎡',
          vacancyDisplay: '0%',
        },
        photo_urls: [],
        sections: [
          {
            section_type: 'property_overview',
            title: '건물 개요',
            markdown:
              '| 항목 | 내용 |\n|---|---|\n| 소재지 | 서울 당산동 |\n| 연면적 | 1,155㎡ |\n| 층수 | 지하1~지상5층 |\n| 준공 | 2018년 |',
          },
          {
            section_type: 'location_access',
            title: '입지',
            markdown:
              '- **지하철**: 당산역 도보 3분\n- **도로**: 당산로 전면\n> 역세권 핵심 상권',
          },
          {
            section_type: 'lease_status',
            title: '임대 현황',
            markdown:
              '| 층 | 업종 | 면적 | 보증금 | 월세 |\n|---|---|---|---|---|\n| 1층 | 약국 | 40평 | 5000 | 350 |\n| 2층 | 의원 | 50평 | 10000 | 500 |\n| 3층 | 학원 | 60평 | 8000 | 400 |',
          },
          {
            section_type: 'risk_check',
            title: '리스크',
            markdown:
              '- **금리리스크**: 고정금리 유지\n- **임차인리스크**: 약국 장기계약\n- **노후화**: 2018 준공 양호\n> 리스크 낮음',
          },
        ],
      },
    },
    building: { area_signal: '당산', asset_type: '근생빌딩', price_band: '50억~100억' },
    broker: { display_name: '홍길동', company_name: '크리딜' },
  } as any);

  const outPath = path.resolve(__dirname, '../docs/uat1/pptx-outputs/P1_income_basic_B_v4.pptx');
  fs.writeFileSync(outPath, result.buffer);
  console.log(
    'OK',
    result.slideCount,
    'slides',
    Math.round(result.fileSizeBytes / 1024) + 'KB',
    'warnings:',
    result.warnings.length,
    result.warnings,
  );
}

main().catch((e) => console.error('ERR', e.message));
