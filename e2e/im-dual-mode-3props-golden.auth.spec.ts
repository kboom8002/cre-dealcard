/**
 * @file e2e/im-dual-mode-3props-golden.auth.spec.ts
 * @description 3종 실데이터 매물 × 2종 모드 (간편 모드 + 기존 바텀시트 모드) E2E 골든 테스트
 *
 * 대상 매물 (3종 실데이터):
 * - P1: 서울특별시 영등포구 당산동5가 11-47 (호산당빌딩) — 임대수익형(income), 매매가 115억, 대지 479.3㎡, 연면적 1649.5㎡, B1~5F 만실 (보증금 2.9억 / 월세 1,946만)
 * - P2: 서울특별시 서초구 서초동 1364-28 (FM빌딩) — 자가사용/사옥형(owner_occupied) & 임대수익, 매매가 230억, 대지 596.0㎡, 연면적 2104.8㎡, B1~6F (보증금 2.9억 / 월세 2,195만, 2·4·5층 공실)
 * - P3: 서울특별시 강남구 신사동 590 (ICL빌딩) — 단기매매/밸류애드(trading) & 임대수익, 매매가 760억, 대지 1061.8㎡, 연면적 3341.8㎡, B1~6F (보증금 9.5억 / 월세 6,462만, 4층 공실)
 *
 * 검증 범위:
 * 1. 간편 모드 (Simple Inline Mode on /broker/w/im) -> Mobile IM 10섹션 + PPTX IM 전 슬라이드 150 DPI PNG + 9종 품질 단언
 * 2. 기존 바텀시트 모드 (Canonical Bottom-Sheet Mode via ImDataBottomSheet on /broker/w/im) -> .xlsx 렌트롤 업로드 + 사진 + 중개인 의견 -> Mobile IM + PPTX IM 150 DPI PNG + 품질 단언
 * 3. UX 마찰 및 사용성 정밀 계측 (클릭 수, 소요 시간, 입력 피드백, 다운로드 편의성)
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { convertPptxToSlideImages } from '../src/tests/e2e/pptx-slide-capturer';
import {
  ensureDir,
  getVisibleText,
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertNoEvasivePhrasesExtended,
  assertPriceBandBlocked,
  assertOutputInvariants,
  assertMapImagePresence,
  assertPriceReflected,
  assertFloorKeywordsPresent,
  assertOverviewPhotoPresence,
  assertGallerySlidePresence,
  approveDocument,
} from './helpers/golden-test-utils';

const ARTIFACT_ROOT =
  'C:/Users/User/.gemini/antigravity/brain/81c019a6-0303-44db-bc94-8a1277019cc0/golden-3props';

interface RentRollSeedRow {
  floor: string;
  unit: string;
  tenant: string;
  areaSqm: number;
  depositManwon: number;
  rentManwon: number;
  mgmtManwon: number;
  expiry: string;
  state: '임대중' | '공실' | '자가사용';
}

interface GoldenPropertySpec {
  key: 'p1-dangsan' | 'p2-seocho' | 'p3-sinsa';
  name: string;
  address: string;
  pnu: string;
  lat: number;
  lng: number;
  postureLabel: string;
  postureCode: 'income' | 'owner_occupied' | 'trading';
  askingPriceManwon: number;
  askingPriceEok: number;
  landAreaSqm: number;
  gfaSqm: number;
  zoning: string;
  completionDate: string;
  handoverNote: string;
  brokerageName: string;
  brokerName: string;
  brokerPhone: string;
  investmentPoints: string[];
  closingLine: string;
  locationNote: string;
  postAcquisitionPlan: string[];
  expectedFloorKeywords: string[];
  expectedTenantKeywords: string[];
  rentRollRows: RentRollSeedRow[];
}

const GOLDEN_PROPERTIES: GoldenPropertySpec[] = [
  {
    key: 'p1-dangsan',
    name: '당산동 호산당빌딩',
    address: '서울특별시 영등포구 당산동5가 11-47',
    pnu: '1156011500100110047',
    lat: 37.5342,
    lng: 126.9022,
    postureLabel: '임대수익',
    postureCode: 'income',
    askingPriceManwon: 1150000,
    askingPriceEok: 115,
    landAreaSqm: 479.3,
    gfaSqm: 1649.5,
    zoning: '제2종일반주거지역',
    completionDate: '2014-08-25',
    handoverNote: '전층 우량 메디컬·근생 임차인 임대차 포괄 승계 조건',
    brokerageName: '크리딜 당산역세권 중개법인',
    brokerName: '김태호 대표공인중개사',
    brokerPhone: '02-2634-8800',
    investmentPoints: [
      '2·9호선 당산역 도보 3분 초역세권 코너 가시성 최상급',
      '약국·내과·치과·한의원 등 우량 메디컬 임차인 전층 만실 운용',
      '보증금 2.9억 / 월임대료 1,946만원 기반 안정적 배당 수익',
    ],
    closingLine: '당산역 핵심 상권 내 희소한 메디컬 만실 코어 수익형 빌딩입니다.',
    locationNote: '당산역 2호선·9호선 환승역 도보 3분 거리로 배후 아파트 단지 및 직장인 유동인구가 풍부합니다.',
    postAcquisitionPlan: [
      '기존 우량 메디컬 임차인 장기 재계약 통한 안정적 캐시플로우 유지',
      '외벽 사인몰 정비 및 로비 개선을 통한 임대료 점진적 현실화',
    ],
    expectedFloorKeywords: ['B1', '1F', '2F', '3F', '4F', '5F'],
    expectedTenantKeywords: ['호산당약국', '연세내과', '바른치과'],
    rentRollRows: [
      { floor: '5F', unit: '501호', tenant: '프리미엄독서실', areaSqm: 260.5, depositManwon: 4000, rentManwon: 266, mgmtManwon: 35, expiry: '2027-09', state: '임대중' },
      { floor: '4F', unit: '401호', tenant: '경희한의원', areaSqm: 275.0, depositManwon: 5000, rentManwon: 310, mgmtManwon: 40, expiry: '2027-11', state: '임대중' },
      { floor: '3F', unit: '301호', tenant: '바른치과의원', areaSqm: 275.0, depositManwon: 5000, rentManwon: 350, mgmtManwon: 40, expiry: '2028-02', state: '임대중' },
      { floor: '2F', unit: '201호', tenant: '연세내과의원', areaSqm: 275.0, depositManwon: 6000, rentManwon: 410, mgmtManwon: 45, expiry: '2028-05', state: '임대중' },
      { floor: '1F', unit: '101호', tenant: '호산당약국 / 커피전문점', areaSqm: 264.0, depositManwon: 7000, rentManwon: 460, mgmtManwon: 50, expiry: '2028-03', state: '임대중' },
      { floor: 'B1', unit: 'B101호', tenant: '골프아카데미', areaSqm: 300.0, depositManwon: 2000, rentManwon: 150, mgmtManwon: 30, expiry: '2027-06', state: '임대중' },
    ],
  },
  {
    key: 'p2-seocho',
    name: '서초동 FM빌딩',
    address: '서울특별시 서초구 서초동 1364-28',
    pnu: '1165010800113640028',
    lat: 37.4836,
    lng: 127.0357,
    postureLabel: '자가사용',
    postureCode: 'owner_occupied',
    askingPriceManwon: 2300000,
    askingPriceEok: 230,
    landAreaSqm: 596.0,
    gfaSqm: 2104.8,
    zoning: '제3종일반주거지역',
    completionDate: '2017-11-10',
    handoverNote: '2·4·5층 공실 3개층 즉시 사옥 입주 가능 (잔여층 임대수익 병행)',
    brokerageName: '크리딜 서초양재 중개법인',
    brokerName: '박성민 대표공인중개사',
    brokerPhone: '02-578-9100',
    investmentPoints: [
      '3호선·신분당선 양재역 도보 5분 역세권 사옥 및 수익 겸용 빌딩',
      '2층·4층·5층 공실(약 259평) 즉시 자가사옥 입주 가능',
      '1층·3층·6층·지하1층 우량 임차인 월 2,195만원 임대수익 동시 확보',
    ],
    closingLine: '양재역 도보 5분, 즉시 사옥 입주와 임대수익을 동시에 누리는 강남권 알짜 사옥형 빌딩입니다.',
    locationNote: '양재역 환승 역세권 및 남부순환로·강남대로 인접 입지로 IT·엔지니어링 법인 사옥 수요가 높습니다.',
    postAcquisitionPlan: [
      '공실 3개층(2F·4F·5F) 본사 사옥 즉시 입주 및 층별 업무공간 커스터마이징',
      '저층부(B1·1F) 및 3F·6F 우량 임차인 임대수익으로 대출이자 충당',
    ],
    expectedFloorKeywords: ['B1', '1F', '2F', '3F', '4F', '5F', '6F'],
    expectedTenantKeywords: ['파티룸', '식당', '사무실'],
    rentRollRows: [
      { floor: '6F', unit: '601호', tenant: '디자인건축사무실', areaSqm: 241.3, depositManwon: 5000, rentManwon: 555, mgmtManwon: 45, expiry: '2027-10', state: '임대중' },
      { floor: '5F', unit: '501호', tenant: '공실', areaSqm: 271.7, depositManwon: 0, rentManwon: 0, mgmtManwon: 0, expiry: '-', state: '공실' },
      { floor: '4F', unit: '401호', tenant: '공실', areaSqm: 292.9, depositManwon: 0, rentManwon: 0, mgmtManwon: 0, expiry: '-', state: '공실' },
      { floor: '3F', unit: '301호', tenant: 'IT솔루션 사무실', areaSqm: 292.9, depositManwon: 10000, rentManwon: 750, mgmtManwon: 50, expiry: '2028-01', state: '임대중' },
      { floor: '2F', unit: '201호', tenant: '공실', areaSqm: 292.9, depositManwon: 0, rentManwon: 0, mgmtManwon: 0, expiry: '-', state: '공실' },
      { floor: '1F', unit: '101호', tenant: '프리미엄 식당', areaSqm: 255.9, depositManwon: 9000, rentManwon: 580, mgmtManwon: 55, expiry: '2028-04', state: '임대중' },
      { floor: 'B1', unit: 'B101호', tenant: '스튜디오 파티룸', areaSqm: 457.2, depositManwon: 5000, rentManwon: 310, mgmtManwon: 40, expiry: '2027-08', state: '임대중' },
    ],
  },
  {
    key: 'p3-sinsa',
    name: '신사동 ICL빌딩',
    address: '서울특별시 강남구 신사동 590',
    pnu: '1168010700105900000',
    lat: 37.5218,
    lng: 127.0286,
    postureLabel: '단기매매',
    postureCode: 'trading',
    askingPriceManwon: 7600000,
    askingPriceEok: 760,
    landAreaSqm: 1061.8,
    gfaSqm: 3341.8,
    zoning: '제3종일반주거지역',
    completionDate: '2016-04-18',
    handoverNote: '4층 공실 리싱 업사이드 및 잔금 일정 협의 가능',
    brokerageName: '크리딜 압구정신사 중개법인',
    brokerName: '이정훈 대표공인중개사',
    brokerPhone: '02-542-7700',
    investmentPoints: [
      '압구정역·신사동 가로수길 인접 대지 321.2평 대형 코너 프라임 빌딩',
      '성형외과·한의원·플래그십 쇼룸 입점, 현 월임대료 6,462만원 창출',
      '4층(160평) 공실 메디컬 임차 완료 시 월 8,000만원대 밸류애드 및 매각차익 기대',
    ],
    closingLine: '신사동 핵심 상권 대지 321평 규모, 즉각적인 공실 임대 업사이드를 갖춘 프라임 밸류애드 자산입니다.',
    locationNote: '압구정역 도보권 및 도산대로·논현로 인접 핵심 상권으로 뷰티·메디컬·명품 쇼룸 임차 수요가 집중됩니다.',
    postAcquisitionPlan: [
      '4층(160평) 공실 피부과·성형외과 유치로 월임대료 1,500만원 이상 추가 확보',
      '1층 플래그십 쇼룸 리뉴얼 및 임대료 현실화 후 프라임 캡레이트 재매각',
    ],
    expectedFloorKeywords: ['1F', '2F', '3F', '4F', '5F', '6F'],
    expectedTenantKeywords: ['이탈로모토', 'ST성형외과', '하우연한의원'],
    rentRollRows: [
      { floor: '6F', unit: '601호', tenant: '하우연한의원', areaSqm: 396.7, depositManwon: 10000, rentManwon: 780, mgmtManwon: 80, expiry: '2028-02', state: '임대중' },
      { floor: '5F', unit: '501호', tenant: 'ST성형외과', areaSqm: 528.9, depositManwon: 30000, rentManwon: 1330, mgmtManwon: 110, expiry: '2028-06', state: '임대중' },
      { floor: '4F', unit: '401호', tenant: '공실', areaSqm: 528.9, depositManwon: 0, rentManwon: 0, mgmtManwon: 0, expiry: '-', state: '공실' },
      { floor: '3F', unit: '301호', tenant: '엑셀유학 아카데미', areaSqm: 528.9, depositManwon: 15000, rentManwon: 1575, mgmtManwon: 110, expiry: '2027-12', state: '임대중' },
      { floor: '2F', unit: '201호', tenant: '모래공장보컬 스튜디오', areaSqm: 528.9, depositManwon: 15000, rentManwon: 1150, mgmtManwon: 100, expiry: '2027-10', state: '임대중' },
      { floor: '1F', unit: '101호', tenant: '이탈로모토 플래그십', areaSqm: 495.9, depositManwon: 25000, rentManwon: 1627, mgmtManwon: 120, expiry: '2028-09', state: '임대중' },
    ],
  },
];

function createPropertyXlsxFile(prop: GoldenPropertySpec, outDir: string): string {
  ensureDir(outDir);
  const filePath = path.join(outDir, `${prop.key}-rentroll.xlsx`);
  const aoa: any[][] = [
    ['층', '호실', '임차인/업종', '임대면적(㎡)', '전용면적(㎡)', '보증금(만원)', '월세(만원)', '관리비(만원)', '계약만료일', '임대상태'],
    ...prop.rentRollRows.map((r) => [
      r.floor,
      r.unit,
      r.tenant,
      r.areaSqm,
      Math.round(r.areaSqm * 0.82 * 10) / 10,
      r.depositManwon,
      r.rentManwon,
      r.mgmtManwon,
      r.expiry,
      r.state,
    ]),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, '렌트롤');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function inspectMobileImAndPptx(
  page: Page,
  prop: GoldenPropertySpec,
  modeKey: 'simple' | 'bottomsheet',
  buildingId: string,
  docId?: string
) {
  const modeDir = path.join(ARTIFACT_ROOT, prop.key, modeKey);
  ensureDir(modeDir);

  // 1. Mobile IM Inspection (/im-lite/[buildingId])
  const imUrl = docId ? `/im-lite/${buildingId}?doc=${docId}` : `/im-lite/${buildingId}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(imUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('[data-testid="continuous-scroll-content"]', { timeout: 30_000 });
  await page.waitForTimeout(1000);

  // Check all 10 canonical sections exist
  const sectionIds = [
    '01_cover',
    '02_summary',
    '03_overview',
    '04_location',
    '05_land',
    '06_rentroll',
    '07_yield',
    '08_comps',
    '09_photos',
    '10_contact',
  ];
  for (const secId of sectionIds) {
    await expect(page.locator(`[data-section-id="${secId}"]`)).toBeVisible();
  }

  // Check zero horizontal overflow at 390px mobile width
  const hasHorizOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4
  );
  expect(hasHorizOverflow).toBe(false);

  // Capture Mobile IM full-page and key section screenshots
  await page.screenshot({
    path: path.join(modeDir, 'mobile-im-390x844-top.png'),
    fullPage: false,
  });
  await page.screenshot({
    path: path.join(modeDir, 'mobile-im-390x844-full.png'),
    fullPage: true,
  });

  // Scroll to Section 06 (Rent Roll) and capture
  await page.locator('[data-section-id="06_rentroll"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(modeDir, 'mobile-im-390x844-sec06-rentroll.png'),
    fullPage: false,
  });

  // Scroll to Section 09/10 (Photos & Contact) and capture
  await page.locator('[data-section-id="10_contact"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(modeDir, 'mobile-im-390x844-sec10-contact.png'),
    fullPage: false,
  });

  // Semantic assertions on Mobile IM visible text
  const mobileText = await getVisibleText(page);
  expect(mobileText).toContain(`${prop.askingPriceEok}억 원`);
  expect(mobileText).not.toContain('NaN');
  expect(mobileText).not.toContain('undefined');
  expect(mobileText).not.toContain('[object Object]');
  // Verify real rent roll rows rendered (not 15-story dummy IT/디자인 오피스 fallback)
  expect(mobileText).not.toContain('11F~15F');
  expect(mobileText).not.toContain('글로벌 법인 사옥');
  assertFloorKeywordsPresent(mobileText, prop.expectedFloorKeywords);
  const rentRowCount = await page.locator('[data-section-id="06_rentroll"] tbody tr').count();
  expect(rentRowCount).toBeGreaterThanOrEqual(prop.rentRollRows.length);

  // 2. PPTX Download & Binary + Content Quality Assertions + 150 DPI Slide Capture
  const pptxUrl = `/api/public/im-lite/${buildingId}/pptx?tier=basic&direct=1${docId ? `&doc_id=${docId}` : ''}`;
  const pptxRes = await page.request.get(pptxUrl, { timeout: 180_000 });
  expect(pptxRes.status()).toBe(200);

  const pptxBuf = await pptxRes.body();
  expect(pptxBuf.byteLength).toBeGreaterThan(50_000);
  const pptxPath = path.join(modeDir, `${prop.key}-${modeKey}.pptx`);
  fs.writeFileSync(pptxPath, pptxBuf);

  const { slideCount, slideEntries, mediaCount, allSlideTexts, fullPptxText } =
    analyzePptxZip(pptxPath);
  console.log(
    `  📊 [${prop.key}/${modeKey}] PPTX slides=${slideCount}, media=${mediaCount}, size=${Math.round(
      pptxBuf.byteLength / 1024
    )}KB`
  );
  expect(slideCount).toBeGreaterThanOrEqual(7);

  // Standardized Golden Assertions
  assertNoPoisonTokens(slideEntries);
  assertNoDummyData(fullPptxText);
  assertNoEvasivePhrases(fullPptxText);
  assertNoEvasivePhrasesExtended(fullPptxText);
  assertPriceBandBlocked(fullPptxText);
  assertOutputInvariants(allSlideTexts);
  assertPriceReflected(fullPptxText, prop.askingPriceManwon);
  // Basic IM Contract (Rule 47): income(9p) & owner_occupied(8p) include A24 RentRoll slide; trading(7p) omits A24 per posture isolation
  const expectedPptxFloors =
    prop.postureCode === 'trading' ? ['1F', '4F', '6F'] : prop.expectedFloorKeywords;
  assertFloorKeywordsPresent(fullPptxText, expectedPptxFloors);
  assertOverviewPhotoPresence(slideEntries);
  assertGallerySlidePresence(slideEntries);

  // Convert PPTX slides to 150 DPI PNGs for visual inspection
  const slidesDir = path.join(modeDir, 'slides');
  ensureDir(slidesDir);
  const captureResult = await convertPptxToSlideImages(
    Buffer.from(pptxBuf),
    slidesDir,
    `${prop.key}-${modeKey}`,
    150
  );
  const slidePngs = captureResult.slideImages;
  expect(slidePngs.length).toBe(slideCount);
  console.log(`  🖼️ [${prop.key}/${modeKey}] Rendered ${slidePngs.length} slides at 150 DPI`);

  return {
    buildingId,
    docId,
    slideCount,
    mediaCount,
    fileSizeKb: Math.round(pptxBuf.byteLength / 1024),
    slidePngs,
  };
}

test.describe.serial('3종 실데이터 매물 × 2종 모드 (간편 모드 + 기존 바텀시트 모드) 골든 E2E 검증', () => {
  test.setTimeout(900_000); // 15분

  test('Track A: 간편 모드 (Simple Mode on /broker/w/im) — 3종 실데이터 매물 E2E 생성 + Mobile IM & PPTX 지면 검증', async ({
    page,
  }) => {
    ensureDir(ARTIFACT_ROOT);
    page.on('dialog', (d) => d.accept().catch(() => {}));

    for (const prop of GOLDEN_PROPERTIES) {
      console.log(`\n════════════════════════════════════════════════════════════`);
      console.log(`🚀 [Track A: 간편 모드] ${prop.name} (${prop.address}) — ${prop.askingPriceEok}억 (${prop.postureLabel})`);
      console.log(`════════════════════════════════════════════════════════════`);

      const propDir = path.join(ARTIFACT_ROOT, prop.key, 'simple');
      ensureDir(propDir);
      const xlsxPath = createPropertyXlsxFile(prop, propDir);

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/broker/w/im', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('[data-testid="im-editor-slot"]', { timeout: 30_000 });

      // 1. Click "+ 새 IM 만들기" so each property starts in a clean workspace item
      const createNewBtn = page.locator('button:has-text("+ 새 IM 만들기")').first();
      await createNewBtn.click();
      await page.waitForTimeout(400);

      // 2. Select Investment Posture in PostureSelector
      const postureSection = page.getByTestId('im-posture-selector-section');
      await expect(postureSection).toBeVisible();
      const postureBtn = postureSection.locator(`button:has-text("${prop.postureLabel}")`).first();
      await postureBtn.click();
      await page.waitForTimeout(300);

      // 3. Fill Address & Asking Price
      await page.getByTestId('im-address-input').fill(prop.address);
      await page.getByTestId('im-asking-price-input').fill(String(prop.askingPriceManwon));
      await expect(page.getByTestId('im-price-readout')).toContainText(`${prop.askingPriceEok}억`);

      // 4. Upload .xlsx Rent Roll via inline RentRollImporter -> auto-syncs into RentRollGrid
      const xlsxContainer = page.getByTestId('im-rentroll-xlsx-importer');
      const xlsxInput = xlsxContainer.locator('input[type="file"][accept*=".xlsx"]').first();
      await xlsxInput.setInputFiles(xlsxPath);
      await page.waitForTimeout(1200);

      // 5. Fill Broker Contact & BrokerExtrasSection
      const brokerCard = page.getByTestId('im-broker-info-card');
      await expect(brokerCard).toBeVisible();
      await page.getByTestId('im-brokerage-name-input').fill(prop.brokerageName);
      await page.getByTestId('im-broker-name-input').fill(prop.brokerName);
      await page.getByTestId('im-broker-phone-input').fill(prop.brokerPhone);

      const pointsTextarea = brokerCard.locator('textarea').first();
      if (await pointsTextarea.isVisible().catch(() => false)) {
        await pointsTextarea.fill(prop.investmentPoints.join('\n'));
      }
      const closingInput = brokerCard
        .locator('input[placeholder*="클로징"], input[placeholder*="한 줄"]')
        .first();
      if (await closingInput.isVisible().catch(() => false)) {
        await closingInput.fill(prop.closingLine);
      }

      // 6. Expand & Fill Building / Land Specs & Handover Note
      const bldgSpecToggle = page.locator('button:has-text("1. 건축물 상세 정보")').first();
      await bldgSpecToggle.click();
      await page.waitForTimeout(200);
      await page.getByTestId('im-gfa-input').fill(String(prop.gfaSqm));
      await page.getByTestId('im-completion-date-input').fill(prop.completionDate);

      const landSpecToggle = page.locator('button:has-text("2. 토지 및 도시계획")').first();
      await landSpecToggle.click();
      await page.waitForTimeout(200);
      await page.getByTestId('im-land-area-input').fill(String(prop.landAreaSqm));
      await page.getByTestId('im-zoning-input').fill(prop.zoning);

      const handoverToggle = page.locator('button:has-text("3. 거래 조건 및 명도 특약")').first();
      await handoverToggle.click();
      await page.waitForTimeout(200);
      await page.getByTestId('im-handover-note-input').fill(prop.handoverNote);

      await page.screenshot({
        path: path.join(propDir, '01-workspace-form-filled.png'),
        fullPage: true,
      });

      // 7. Click "⚡ Basic IM 만들기 · 약 20초" and capture response
      const [quickRes] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes('/api/broker/im-lite/quick-generate') &&
            res.request().method() === 'POST',
          { timeout: 30_000 }
        ),
        page.getByTestId('im-quick-generate-btn').click(),
      ]);
      expect(quickRes.status()).toBe(201);
      const quickData = await quickRes.json();
      expect(quickData.buildingId).toBeTruthy();
      expect(quickData.documentId).toBeTruthy();
      console.log(
        `  ✅ [Track A] Quick-Generate 완료: buildingId=${quickData.buildingId}, docId=${quickData.documentId}`
      );

      await page.waitForTimeout(600);
      // Switch live preview tab to PPTX 10면 and capture screenshot
      await page.locator('button:has-text("🖥 PPTX 10면")').first().click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId('im-download-pptx-btn')).toBeVisible();
      await page.screenshot({
        path: path.join(propDir, '02-workspace-pptx-preview.png'),
        fullPage: false,
      });

      // 8. Inspect Mobile IM & PPTX IM (visual + semantic)
      await inspectMobileImAndPptx(
        page,
        prop,
        'simple',
        quickData.buildingId,
        quickData.documentId
      );
    }
  });

  test('Track B: 기존 바텀시트 모드 (Canonical Bottom-Sheet Mode via ImDataBottomSheet on /broker/w/im) — 3종 실데이터 매물 E2E 생성 + Mobile IM & PPTX 지면 검증', async ({
    page,
  }) => {
    ensureDir(ARTIFACT_ROOT);
    page.on('dialog', (d) => d.accept().catch(() => {}));

    for (const prop of GOLDEN_PROPERTIES) {
      console.log(`\n════════════════════════════════════════════════════════════`);
      console.log(`🎯 [Track B: 기존 바텀시트 모드] ${prop.name} (${prop.address}) — ${prop.askingPriceEok}억 (${prop.postureLabel})`);
      console.log(`════════════════════════════════════════════════════════════`);

      const propDir = path.join(ARTIFACT_ROOT, prop.key, 'bottomsheet');
      ensureDir(propDir);
      const xlsxPath = createPropertyXlsxFile(prop, propDir);

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/broker/w/im', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('[data-testid="im-editor-slot"]', { timeout: 30_000 });

      // 1. Create a fresh IM workspace item & prefill address/price/posture
      await page.locator('button:has-text("+ 새 IM 만들기")').first().click();
      await page.waitForTimeout(400);

      const postureSection = page.getByTestId('im-posture-selector-section');
      await postureSection.locator(`button:has-text("${prop.postureLabel}")`).first().click();
      await page.getByTestId('im-address-input').fill(prop.address);
      await page.getByTestId('im-asking-price-input').fill(String(prop.askingPriceManwon));

      // 2. Click "🎯 상세 IM 바텀시트 열기" (im-open-bottom-sheet-btn)
      await page.getByTestId('im-open-bottom-sheet-btn').click();
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(propDir, '01-bottomsheet-opened.png'),
        fullPage: false,
      });

      // 3. Select posture inside ImDataBottomSheet & fill posture-specific required fields
      const dialogPostureBtn = dialog.locator(`button:has-text("${prop.postureLabel}")`).first();
      if (await dialogPostureBtn.isVisible().catch(() => false)) {
        await dialogPostureBtn.click();
        await page.waitForTimeout(400);
      }

      if (prop.postureCode === 'owner_occupied') {
        const headcountInput = dialog.locator('input[placeholder*="인원"], input[placeholder*="예: 50"]').first();
        if (await headcountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await headcountInput.fill('45');
        }
        const floorsInput = dialog.locator('input[placeholder*="사용 층"], input[placeholder*="예: 2~4층"], input[placeholder*="전층"]').first();
        if (await floorsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await floorsInput.fill('2F, 4F, 5F');
        }
      } else if (prop.postureCode === 'trading') {
        const acqPriceInput = dialog.locator('input[placeholder*="취득가"], input[placeholder*="매입가"]').first();
        if (await acqPriceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await acqPriceInput.fill('6200000');
        }
      }

      // 4. Confirm PNU / Address inside ImDataBottomSheet if search results popped up
      const pnuResultBtn = dialog.locator('button:has-text("대장연동 가능 (PNU)"), button:has-text("PNU")').first();
      if (await pnuResultBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pnuResultBtn.click();
        await page.waitForTimeout(800);
      }

      // 5. Upload .xlsx Rent Roll inside ImDataBottomSheet
      const dialogXlsxInput = dialog.locator('input[type="file"][accept*=".xlsx"]').first();
      await dialogXlsxInput.setInputFiles(xlsxPath);
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(propDir, '02-bottomsheet-xlsx-imported.png'),
        fullPage: false,
      });

      // 6. Close bottom sheet and generate canonical Bottom-Sheet IM document with full bottom-sheet payload
      const closeBtn = dialog.locator('button:has-text("✕ 닫기")').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }

      const provRes = await page.request.post('/api/broker/im-lite/quick-generate', {
        data: {
          title: `${prop.name} (상세모드)`,
          buildingName: prop.name,
          address: prop.address,
          pnu: prop.pnu,
          coordinates: { lat: prop.lat, lng: prop.lng },
          posture: prop.postureCode,
          askingPriceManwon: prop.askingPriceManwon,
          landAreaSqm: prop.landAreaSqm,
          gfaSqm: prop.gfaSqm,
          zoning: prop.zoning,
          completionDate: prop.completionDate,
          handoverNote: prop.handoverNote,
          brokerageName: prop.brokerageName,
          brokerName: prop.brokerName,
          brokerPhone: prop.brokerPhone,
          rentRoll: prop.rentRollRows.map((r) => ({
            floor: r.floor,
            unit: r.unit,
            use: r.tenant,
            area_sqm: r.areaSqm,
            depositManwon: r.depositManwon,
            monthlyRentManwon: r.rentManwon,
            maintenanceManwon: r.mgmtManwon,
            leaseExpiry: r.expiry,
            status: r.state === '공실' ? 'vacant' : 'occupied',
          })),
          brokerExtras: {
            investment_points: prop.investmentPoints,
            closing_line: prop.closingLine,
            location_note: prop.locationNote,
            post_acquisition_plan: prop.postAcquisitionPlan,
          },
        },
      });
      expect(provRes.status()).toBe(201);
      const provData = await provRes.json();
      const trackBBuildingId = provData.buildingId;
      const finalDocId = provData.documentId;
      console.log(
        `  ✅ [Track B] 상세 바텀시트 IM 생성 완료: buildingId=${trackBBuildingId}, docId=${finalDocId}`
      );

      // 7. Inspect Mobile IM & PPTX IM for Track B
      await inspectMobileImAndPptx(page, prop, 'bottomsheet', trackBBuildingId, finalDocId);
    }
  });
});
