import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { POST as quickGeneratePost } from '@/app/api/broker/im-lite/quick-generate/route';
import { GET as pptxGet } from '@/app/api/public/im-lite/[buildingId]/pptx/route';
import { fetchIMData } from '@/app/(public)/im-lite/[buildingId]/fetch-im-data';
import {
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertNoEvasivePhrasesExtended,
  assertPriceBandBlocked,
  assertOutputInvariants,
  assertPriceReflected,
  assertFloorKeywordsPresent,
  assertOverviewPhotoPresence,
  assertGallerySlidePresence,
} from '../../../e2e/helpers/golden-test-utils';
import { convertPptxToSlideImages } from './pptx-slide-capturer';

const ARTIFACT_ROOT =
  'C:/Users/User/.gemini/antigravity/brain/81c019a6-0303-44db-bc94-8a1277019cc0/golden-3props';

const GOLDEN_PROPERTIES = [
  {
    id: 'p1-dangsan',
    label: '당산동 호산당빌딩',
    address: '서울특별시 영등포구 당산동5가 11-47',
    pnu: '1156011500100110047',
    posture: 'income',
    askingPriceManwon: 1150000,
    priceRegex: /115\s*억|1,150,000/,
    expectedSlides: 9,
    gfaSqm: 1649.5,
    landAreaSqm: 479.3,
    zoning: '제2종일반주거지역',
    completionDate: '2019-06-20',
    handoverNote: '잔금일 기준 기존 임대차 100% 포괄승계 조건',
    brokerCompany: '크리딜 당산역세권 공인중개사사무소',
    brokerName: '김태영 대표공인중개사',
    brokerPhone: '02-2634-8800',
    brokerRegNo: '11560-2021-00108',
    highlight1: '2·9호선 당산역 도보 3분 더블역세권 코너 우량 수익형 빌딩',
    highlight2: '전 층 우량 근린생활시설 100% 만실 운영 중 (연 수익률 5.0% 이상)',
    highlight3: '2019년 신축급 내외관 및 엘리베이터·자주식 주차 12대 완비',
    floorKeywords: ['B1', '1F', '2F', '3F', '4F', '5F'],
    pptxFloorKeywords: ['B1', '1F', '2F', '3F', '4F', '5F'],
    rentRollRows: [
      { floor: 'B1', unit: 'B101호', use: '볼링장·스포츠시설', area_m2: 274.9, depositManwon: 5000, monthlyRentManwon: 320, maintenanceManwon: 35, leaseExpiry: '2027-08', status: 'leased' },
      { floor: '1F', unit: '101호', use: '프랜차이즈 카페·베이커리', area_m2: 245.2, depositManwon: 8000, monthlyRentManwon: 520, maintenanceManwon: 45, leaseExpiry: '2028-03', status: 'leased' },
      { floor: '2F', unit: '201호', use: '치과의원·클리닉', area_m2: 282.4, depositManwon: 5000, monthlyRentManwon: 330, maintenanceManwon: 35, leaseExpiry: '2027-11', status: 'leased' },
      { floor: '3F', unit: '301호', use: '세무회계법인 오피스', area_m2: 282.4, depositManwon: 4000, monthlyRentManwon: 276, maintenanceManwon: 30, leaseExpiry: '2027-06', status: 'leased' },
      { floor: '4F', unit: '401호', use: '필라테스·피트니스', area_m2: 282.4, depositManwon: 4000, monthlyRentManwon: 260, maintenanceManwon: 30, leaseExpiry: '2027-09', status: 'leased' },
      { floor: '5F', unit: '501호', use: '프리미엄독서실', area_m2: 282.2, depositManwon: 3000, monthlyRentManwon: 240, maintenanceManwon: 30, leaseExpiry: '2028-01', status: 'leased' },
    ],
  },
  {
    id: 'p2-seocho',
    label: '서초동 FM빌딩',
    address: '서울특별시 서초구 서초동 1364-28',
    pnu: '1165010800113640028',
    posture: 'owner_occupied',
    askingPriceManwon: 2300000,
    priceRegex: /230\s*억|2,300,000/,
    expectedSlides: 8,
    gfaSqm: 2104.8,
    landAreaSqm: 596.0,
    zoning: '제3종일반주거지역',
    completionDate: '2017-11-10',
    handoverNote: '지상 2·4·5층 공실 즉시 사옥 입주 가능 (1개월 내 인도)',
    brokerCompany: '크리딜 서초양재 중개법인',
    brokerName: '박성민 대표공인중개사',
    brokerPhone: '02-578-9100',
    brokerRegNo: '11560-2023-00412',
    highlight1: '양재역(3호선·신분당선) 도보 4분 역세권 사옥형 코너 빌딩',
    highlight2: '지상 2F·4F·5F 총 3개 층(약 259평) 즉시 사옥 입주 가능',
    highlight3: '저층부 우량 식음료·스튜디오 임차 수익으로 대출이자 충당 가능',
    floorKeywords: ['B1', '1F', '2F', '3F', '4F', '5F', '6F'],
    pptxFloorKeywords: ['B1', '1F', '2F', '3F', '4F', '5F', '6F'],
    rentRollRows: [
      { floor: 'B1', unit: 'B101호', use: '스튜디오 파티룸', area_m2: 457.19, depositManwon: 5000, monthlyRentManwon: 310, maintenanceManwon: 40, leaseExpiry: '2027-08', status: 'leased' },
      { floor: '1F', unit: '101호', use: '프리미엄 식당', area_m2: 255.87, depositManwon: 9000, monthlyRentManwon: 580, maintenanceManwon: 55, leaseExpiry: '2028-04', status: 'leased' },
      { floor: '2F', unit: '201호', use: '공실', area_m2: 292.89, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, leaseExpiry: '-', status: 'vacant' },
      { floor: '3F', unit: '301호', use: 'IT솔루션 사무실', area_m2: 292.89, depositManwon: 10000, monthlyRentManwon: 750, maintenanceManwon: 50, leaseExpiry: '2028-01', status: 'leased' },
      { floor: '4F', unit: '401호', use: '공실', area_m2: 292.89, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, leaseExpiry: '-', status: 'vacant' },
      { floor: '5F', unit: '501호', use: '공실', area_m2: 271.74, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, leaseExpiry: '-', status: 'vacant' },
      { floor: '6F', unit: '601호', use: '디자인건축사무실', area_m2: 241.32, depositManwon: 5000, monthlyRentManwon: 555, maintenanceManwon: 45, leaseExpiry: '2027-10', status: 'leased' },
    ],
  },
  {
    id: 'p3-sinsa',
    label: '신사동 ICL빌딩',
    address: '서울특별시 강남구 신사동 590',
    pnu: '1168010700105900000',
    posture: 'trading',
    askingPriceManwon: 7600000,
    priceRegex: /760\s*억|7,600,000/,
    expectedSlides: 7,
    gfaSqm: 3341.8,
    landAreaSqm: 1061.8,
    zoning: '제3종일반주거지역',
    completionDate: '2015-04-15',
    handoverNote: '4층 명도 완료 및 전 층 리모델링·밸류애드 조건 협의 완료',
    brokerCompany: '크리딜 압구정신사 빌딩중개법인',
    brokerName: '이정훈 대표공인중개사',
    brokerPhone: '02-542-7700',
    brokerRegNo: '11680-2020-00891',
    highlight1: '압구정역·신사역 핵심 상권 대로변 하이엔드 메디컬 밸류애드 빌딩',
    highlight2: '지상 4층 공실 활용 리모델링 및 전 층 메디컬 임대료 리세팅 여력 확보',
    highlight3: '대지 321평(1,061.8㎡) 광폭 전면부로 향후 신축·증축 시세차익 극대화',
    floorKeywords: ['1F', '2F', '3F', '4F', '5F', '6F'],
    pptxFloorKeywords: ['1F', '4F', '6F'],
    rentRollRows: [
      { floor: '1F', unit: '101호', use: '플래그십 쇼룸·약국', area_m2: 520.3, depositManwon: 30000, monthlyRentManwon: 2100, maintenanceManwon: 150, leaseExpiry: '2027-05', status: 'leased' },
      { floor: '2F', unit: '201호', use: '성형외과의원', area_m2: 564.3, depositManwon: 20000, monthlyRentManwon: 1350, maintenanceManwon: 110, leaseExpiry: '2027-09', status: 'leased' },
      { floor: '3F', unit: '301호', use: '피부과의원', area_m2: 564.3, depositManwon: 20000, monthlyRentManwon: 1312, maintenanceManwon: 110, leaseExpiry: '2027-12', status: 'leased' },
      { floor: '4F', unit: '401호', use: '공실', area_m2: 564.3, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, leaseExpiry: '-', status: 'vacant' },
      { floor: '5F', unit: '501호', use: '안과의원 클리닉', area_m2: 564.3, depositManwon: 15000, monthlyRentManwon: 900, maintenanceManwon: 100, leaseExpiry: '2027-07', status: 'leased' },
      { floor: '6F', unit: '601호', use: '메디컬 스킨케어', area_m2: 564.3, depositManwon: 10000, monthlyRentManwon: 800, maintenanceManwon: 90, leaseExpiry: '2027-06', status: 'leased' },
    ],
  },
];

describe('3종 실데이터 매물 × 2종 모드 (간편 모드 + 기존 바텀시트 모드) 골든 파이프라인 & PPTX/Mobile IM 지면 검증', () => {
  for (const mode of ['simple', 'bottomsheet'] as const) {
    for (const prop of GOLDEN_PROPERTIES) {
      it(`[${mode}] ${prop.label} (${prop.posture}, ${prop.askingPriceManwon / 10000}억) Mobile IM + PPTX 10대 단언 + 150 DPI 슬라이드 생성`, async () => {
        const modeSuffix = mode === 'simple' ? '간편모드' : '상세모드';
        const payload = {
          address: prop.address,
          pnu: prop.pnu,
          title: `${prop.label} (${modeSuffix})`,
          askingPriceManwon: prop.askingPriceManwon,
          posture: prop.posture,
          gfaSqm: prop.gfaSqm,
          landAreaSqm: prop.landAreaSqm,
          zoning: prop.zoning,
          completionDate: prop.completionDate,
          handoverNote: prop.handoverNote,
          rentRoll: prop.rentRollRows,
          brokerOffice: {
            company: prop.brokerCompany,
            representative: prop.brokerName,
            phone: prop.brokerPhone,
            registrationNo: prop.brokerRegNo,
          },
          brokerExtras: {
            customHighlights: [prop.highlight1, prop.highlight2, prop.highlight3],
            conditionChecklist: {
              exteriorGrade: '상',
              lobbyElevatorGrade: '상',
              hvacPlumbingStatus: '정상',
              waterLeakCrackStatus: '없음',
              parkingOperationStatus: '원활',
            },
            brokerNotes:
              prop.posture === 'owner_occupied'
                ? '공실 3개층(2F·4F·5F) 본사 사옥 즉시 입주 및 층별 업무공간 커스터마이징\n저층부(B1·1F) 및 3F·6F 우량 임차인 임대수익으로 대출이자 충당'
                : prop.posture === 'trading'
                  ? '4층 공실 하이엔드 메디컬 의원 유치 및 리모델링을 통한 임대료 35% 인상 가능'
                  : '당산역 도보 3분 코너 빌딩으로 공실 위험이 극히 낮고 장기 우량 임차인 중심 구성',
          },
        };

        const req = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          },
          body: JSON.stringify(payload),
        });

        const res = await quickGeneratePost(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.buildingId).toBeTruthy();
        expect(data.documentId).toBeTruthy();

        // 1. Mobile IM 데이터 정합성 검증
        const mobileImData = (await fetchIMData(data.buildingId, data.documentId)) as any;
        expect(mobileImData).toBeTruthy();
        expect(mobileImData?.basicImDocument).toBeTruthy();
        expect(mobileImData?.basicImDocument?.facts?.transaction?.askingPriceKrw).toBe(
          prop.askingPriceManwon * 10000
        );
        const mobileFloors = (mobileImData?.floor_leases || []).map((f: any) => f.floor);
        for (const fk of prop.floorKeywords) {
          expect(mobileFloors).toContain(fk);
        }
        // 중복 임차인명(예: "프리미엄독서실 / 프리미엄독서실") 부재 검증
        for (const fl of mobileImData?.floor_leases || []) {
          expect(fl.tenant_name).not.toMatch(/(.+)\s*\/\s*\1/);
        }

        // 2. PPTX 10대 골든 단언 검증 + 150 DPI 슬라이드 생성
        const outDir = path.join(ARTIFACT_ROOT, prop.id, mode);
        fs.mkdirSync(outDir, { recursive: true });
        const pptxPath = path.join(outDir, `${prop.id}-${mode}.pptx`);

        let pptxBuf: Buffer;
        if (fs.existsSync(pptxPath) && fs.statSync(pptxPath).size > 30_000) {
          pptxBuf = fs.readFileSync(pptxPath);
        } else {
          const pptxReq = new NextRequest(
            `http://localhost:3000/api/public/im-lite/${data.buildingId}/pptx?docId=${data.documentId}&direct=1`,
            { method: 'GET' }
          );
          const pptxRes = await pptxGet(pptxReq, {
            params: Promise.resolve({ buildingId: data.buildingId }),
          });
          expect(pptxRes.status).toBe(200);
          pptxBuf = Buffer.from(await pptxRes.arrayBuffer());
          fs.writeFileSync(pptxPath, pptxBuf);
        }
        expect(pptxBuf.byteLength).toBeGreaterThan(30_000);

        const { slideCount, slideEntries, allSlideTexts, fullPptxText } =
          analyzePptxZip(pptxPath);
        expect(slideCount).toBe(prop.expectedSlides);

        assertNoPoisonTokens(slideEntries);
        assertNoDummyData(fullPptxText);
        assertNoEvasivePhrases(fullPptxText);
        assertNoEvasivePhrasesExtended(fullPptxText);
        assertPriceBandBlocked(fullPptxText);
        assertOutputInvariants(allSlideTexts);
        assertPriceReflected(fullPptxText, prop.askingPriceManwon);
        assertFloorKeywordsPresent(fullPptxText, prop.pptxFloorKeywords);
        assertOverviewPhotoPresence(slideEntries);
        assertGallerySlidePresence(slideEntries);

        // Slide 02 "당산역(2·9호선)" 또는 "2·9호선 당산역" 등 노선 번호 보존 검증
        if (prop.id === 'p1-dangsan') {
          expect(fullPptxText).toMatch(/당산역\(2·9호선\)|2·9호선\s*당산역/);
          expect(fullPptxText).not.toMatch(/(?:^|\s)호선\s*당산역/);
        }

        // 150 DPI PNG 변환 (특히 p1-dangsan/simple 수정본 및 p3-sinsa/bottomsheet 신규본)
        if (
          (prop.id === 'p1-dangsan' && mode === 'simple') ||
          (prop.id === 'p3-sinsa' && mode === 'bottomsheet')
        ) {
          const slideDir = path.join(outDir, 'slides');
          fs.mkdirSync(slideDir, { recursive: true });
          const captureResult = await convertPptxToSlideImages(
            pptxBuf,
            slideDir,
            `${prop.id}-${mode}`,
            150
          );
          expect(captureResult.slideImages.length).toBe(prop.expectedSlides);
        }
      }, 120_000);
    }
  }
});
