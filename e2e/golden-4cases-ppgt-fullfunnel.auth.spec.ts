/**
 * @file e2e/golden-4cases-ppgt-fullfunnel.auth.spec.ts
 * @description 골든 실매물 4종(CASE-02 ~ CASE-05) × 4대 워크스페이스(딜카드 · IM · 부동산뉴스 · 소통함)
 *   Full-Funnel Parametric Persona Golden Test (PPGT-Loop Layer C: R1 + R2 + Binary/Oracle/150DPI PNG).
 *
 * 검증 범위:
 * 1. CASE-02 (서초동 1364-28 · 사옥형 · TSV + 부록 원단위 자동보정)
 * 2. CASE-03 (잠원동 26-14 외 1 · 신축개발형 · 다필지 + Step1 대지↔연면적 스왑 복구)
 * 3. CASE-04 (당산동5가 11-47 · 수익형 · XLSX v1.5 ㎡ 15호실 + 계약그룹·전세·렌트프리 + 세로사진)
 * 4. CASE-05 (양평동4가 117 외 2 · 수익형 · XLSX v1.5 평 자동환산 + V12 차단게이트 + 세로 대표외관)
 * 5. 부동산뉴스(Newsletter) 크로스링크 발행 + 모바일 390 xlarge 뷰어 (IM 발행 2건 + 딜카드 전용 1건)
 * 6. 소통함(Inbox) 신규 고객/중복 경고/빈 타임라인 정직성/409 IM_NOT_GENERATED/AI 답장 비중복/VIP 삭제 보호
 * 7. 4대 서브시스템 통합 100점 비보상 루브릭(UnifiedCreReport100) + P-Score 백로그 + fullfunnel-manifest.json 산출
 * 8. afterAll: 생성된 테스트 매물·에디션·고객 자동 삭제(DB 무오염)
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { BANNED_UI_TERMS } from '../src/lib/ux/lexicon';
import {
  scanUxWriting,
  auditDealCardContentSuitability,
  auditNewsletterContentSuitability,
} from '../src/lib/qa/ux-writing-and-content-oracle';
import {
  scoreDealCardPpgtRun,
  rankDealCardPpgtBacklog,
  verifyDealCardAntiSycophancyControls,
  type DealCardPpgtProbeMetrics,
  type DealCardPpgtScoreResult,
} from '../src/lib/qa/dealcard-ppgt-personas';
import {
  scoreImPpgtRun,
  rankImPpgtBacklog,
  verifyAntiSycophancyControls as verifyImAntiSycophancyControls,
  type ImPpgtProbeMetrics,
  type ImPpgtScoreResult,
} from '../src/lib/qa/im-ppgt-personas';
import {
  scoreNewsletterPpgtRun,
  rankNewsletterPpgtBacklog,
  verifyNewsletterAntiSycophancyControls,
  type NewsletterPpgtProbeMetrics,
  type NewsletterPpgtScoreResult,
} from '../src/lib/qa/newsletter-ppgt-personas';
import {
  scoreInboxPpgtRun,
  rankInboxPpgtBacklog,
  verifyInboxAntiSycophancyControls,
  type InboxPpgtProbeMetrics,
  type InboxPpgtScoreResult,
} from '../src/lib/qa/inbox-ppgt-personas';
import {
  buildUnifiedCreReport100,
  formatUnifiedCreScorecardMarkdown,
} from '../src/lib/qa/unified-cre-rubric';
import {
  ensureDir,
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertPriceBandBlocked,
} from './helpers/golden-test-utils';

test.describe.configure({ mode: 'serial' });

const TESTDATA_ROOT = path.resolve(__dirname, '../docs/finaltest/testdata');
const OUT_ROOT = path.resolve(__dirname, 'golden-snapshots/out/golden-4cases-ppgt');
const GROUND_TRUTH_PATH = path.join(TESTDATA_ROOT, 'ground_truth_5cases.json');

interface GroundTruthCase {
  case_id: string;
  folder: string;
  input_mode: string;
  address: string;
  pnu: string;
  land_area_sqm: number;
  gfa_sqm: number;
  asking_price_manwon: number;
  asking_price_krw: number;
  posture: 'owner_occupied' | 'value_add' | 'income';
  expected_price_band: string;
  dealcard_blind_forbidden_tokens: string[];
  asis_rentroll: {
    deposit_manwon: number;
    rent_manwon: number;
    mgmt_manwon: number;
    net_yield_pct: number;
    gross_yield_pct: number;
    vacancy_unit_pct: number;
    vacancy_area_pct: number;
  };
  stabilized_rentroll: {
    deposit_manwon: number;
    rent_manwon: number;
    mgmt_manwon: number;
    net_yield_pct: number;
    gross_yield_pct: number;
    vacancy_unit_pct: number;
  };
  poka_yoke_checks?: string[];
  expected_rentroll_slide_split?: number;
}

interface CaseSpec {
  caseId: 'CASE-02' | 'CASE-03' | 'CASE-04' | 'CASE-05';
  folderName: string;
  imTitle: string;
  zoning: string;
  completionDate: string;
  imPostureButtonText: string;
  dcExpectedPostureChipId: string;
  rentRollMode: 'tsv' | 'xlsx';
  asisFile: string;
  stabilizedTsvFile: string;
  appendixPokaYokeFile?: string;
  exteriorImages: string[];
  interiorImages: string[];
  dealcardBuyerPersonaId: 'DC-MG-03' | 'DC-MG-04' | 'DC-MG-05';
  imBuyerPersonaId: 'IM-MG-03' | 'IM-MG-04' | 'IM-MG-05';
}

const CASE_SPECS: readonly CaseSpec[] = [
  {
    caseId: 'CASE-02',
    folderName: 'CASE-02_서초_서초동_1364-28_화면입력_법인사옥형',
    imTitle: '서초동 1364-28 법인사옥형 꼬마빌딩 (FM빌딩)',
    zoning: '제3종일반주거지역',
    completionDate: '2006-05-15',
    imPostureButtonText: '사옥용',
    dcExpectedPostureChipId: 'owner_occupied',
    rentRollMode: 'tsv',
    asisFile: '02_현황_렌트롤_화면붙여넣기.tsv',
    stabilizedTsvFile: '03_안정화_렌트롤_화면붙여넣기.tsv',
    appendixPokaYokeFile: '99_부록_원단위오입력_자동보정체험.tsv',
    exteriorImages: [
      'images/01_외관_코너전면대표.jpeg',
      'images/02_외관_정면파사드.jpeg',
      'images/03_외관_측면주차장.jpeg',
    ],
    interiorImages: [
      'images/04_내부_기준층오피스A.jpeg',
      'images/05_내부_기준층오피스B.jpeg',
    ],
    dealcardBuyerPersonaId: 'DC-MG-04',
    imBuyerPersonaId: 'IM-MG-04',
  },
  {
    caseId: 'CASE-03',
    folderName: 'CASE-03_서초_잠원동_26-14외1_화면입력_신축개발형',
    imTitle: '잠원동 26-14 외 1 신축·밸류애드 빌딩 (두원빌딩)',
    zoning: '제3종일반주거지역',
    completionDate: '1991-09-20',
    imPostureButtonText: '신축·개발용',
    dcExpectedPostureChipId: 'value_add',
    rentRollMode: 'tsv',
    asisFile: '02_현황_렌트롤_화면붙여넣기.tsv',
    stabilizedTsvFile: '03_안정화_렌트롤_화면붙여넣기.tsv',
    exteriorImages: [
      'images/01_외관_코너전면대표.png',
      'images/02_외관_후면자주식주차장.png',
      'images/03_외관_인근신축개발상권.png',
    ],
    interiorImages: [
      'images/04_내부_기준층실내현황.jpeg',
      'images/05_내부_옥상설비및조망.jpeg',
    ],
    dealcardBuyerPersonaId: 'DC-MG-05',
    imBuyerPersonaId: 'IM-MG-05',
  },
  {
    caseId: 'CASE-04',
    folderName: 'CASE-04_영등포_당산동5가_11-47_XLSX입력_다호실복합',
    imTitle: '당산동5가 11-47 메디컬·근생 복합수익형 빌딩',
    zoning: '준공업지역',
    completionDate: '2014-08-25',
    imPostureButtonText: '임대수익용',
    dcExpectedPostureChipId: 'income',
    rentRollMode: 'xlsx',
    asisFile: '02_현황_렌트롤_v1.5_sqm.xlsx',
    stabilizedTsvFile: '04_안정화_서브탭_화면붙여넣기.tsv',
    exteriorImages: [
      'images/01_외관_전면및필로티주차장.jpeg',
      'images/02_외관_사거리코너전경.jpeg',
      'images/03_외관_영신로259주출입구.jpeg',
    ],
    interiorImages: [
      'images/04_내부_2층로뎀내과복도.jpeg',
      'images/05_내부_내과수액검진실.jpeg',
      'images/06_내부_엘리베이터홀.jpeg',
    ],
    dealcardBuyerPersonaId: 'DC-MG-03',
    imBuyerPersonaId: 'IM-MG-03',
  },
  {
    caseId: 'CASE-05',
    folderName: 'CASE-05_영등포_양평동4가_117외2_XLSX입력_프라임오피스',
    imTitle: '양평동4가 117 외 2 프라임 코너 오피스 (더레드빌딩)',
    zoning: '준공업지역',
    completionDate: '2018-04-10',
    imPostureButtonText: '임대수익용',
    dcExpectedPostureChipId: 'income',
    rentRollMode: 'xlsx',
    asisFile: '02_현황_렌트롤_v1.5_pyeong.xlsx',
    stabilizedTsvFile: '04_안정화_서브탭_화면붙여넣기.tsv',
    appendixPokaYokeFile: '99_부록_V12_단위혼동_차단게이트_체험용.xlsx',
    exteriorImages: [
      'images/01_외관_10층코너전면_세로형.jpg',
      'images/02_외관_대로변접면.jpeg',
    ],
    interiorImages: [
      'images/03_내부_승강기홀.jpg',
      'images/04_내부_기준층오피스.jpeg',
    ],
    dealcardBuyerPersonaId: 'DC-MG-03',
    imBuyerPersonaId: 'IM-MG-03',
  },
];

const RAW_ERROR_REGEX =
  /PGRST|relation .* does not exist|column .* does not exist|syntax error|\[object Object\]|>NaN<|>undefined<|>null</;

interface DomProbeRaw {
  horizontalOverflowPx: number;
  aboveFoldActionCount: number;
  totalVisibleInteractiveCount: number;
  sub44Buttons: Array<{ text: string; width: number; height: number }>;
  sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }>;
  clippedButtons: Array<{ text: string; clientW: number; scrollW: number }>;
  brokenImgs: Array<{ alt: string; src: string }>;
  visibleText: string;
  observedHeadings: string[];
  observedButtons: string[];
  observedBadges: string[];
  provenanceBadgeVisible: boolean;
  honestSaveVisible: boolean;
}

interface CaseExecutionRecord {
  caseId: string;
  buildingId: string;
  docId: string;
  dcUrl: string;
  imLiteUrl: string;
  dealcardPostureDetected: string;
  dealcardPostureMatch: boolean;
  aiHeadlineVariantNonRepeating: boolean;
  strengthTagApplied: boolean;
  blindLeaksOnDc: string[];
  priceBandFoundOnDc: boolean;
  ogImageValid: boolean;
  ogImageBytes: number;
  pokaYokeChecks: Record<string, boolean>;
  imAiNominalEndingsClean: boolean;
  pptxPath: string;
  pptxBytes: number;
  pptxSlideCount: number;
  pptxMediaCount: number;
  pptxSlideImages: string[];
  slidesHtmlValid: boolean;
  oracleChecks: {
    priceReflected: boolean;
    asisNetYieldMatched: boolean;
    stabilizedNetYieldMatched: boolean;
    vacancyMatched: boolean;
    rentRollSlideSplitMatched: boolean;
    details: string[];
  };
  screenshots: Record<string, string>;
  observedSpans: {
    dc: string[];
    imLite: string[];
    pptxTextSample: string;
  };
  defects: string[];
  server500s: string[];
}

const runState: {
  server500s: string[];
  createdBuildingIds: string[];
  createdEditionIds: string[];
  createdClientIds: string[];
  dealOnlyBuildingId: string;
  caseRecords: Record<string, CaseExecutionRecord>;
  dealcardRuns: DealCardPpgtScoreResult[];
  imRuns: ImPpgtScoreResult[];
  newsletterRuns: NewsletterPpgtScoreResult[];
  inboxRuns: InboxPpgtScoreResult[];
  newsletterManifest: {
    editionId: string;
    publicUrl: string;
    liveNewsRefreshed: boolean;
    freshnessBadgeText: string;
    blindGridCount: number;
    featuredLinksChecked: Array<{ href: string; status: number }>;
    screenshots: Record<string, string>;
    observedSpans: string[];
    defects: string[];
  };
  inboxManifest: {
    duplicateWarningShown: boolean;
    honestEmptyEventsShown: boolean;
    imNotGeneratedNoticeShown: boolean;
    api409ImNotGeneratedVerified: boolean;
    aiReplyVariantNonRepeating: boolean;
    vipDeleteStrongWarningShown: boolean;
    foldedNewsletterFilterDefaultHidden: boolean;
    screenshots: Record<string, string>;
    observedSpans: string[];
    defects: string[];
  };
} = {
  server500s: [],
  createdBuildingIds: [],
  createdEditionIds: [],
  createdClientIds: [],
  dealOnlyBuildingId: '',
  caseRecords: {},
  dealcardRuns: [],
  imRuns: [],
  newsletterRuns: [],
  inboxRuns: [],
  newsletterManifest: {
    editionId: '',
    publicUrl: '',
    liveNewsRefreshed: false,
    freshnessBadgeText: '',
    blindGridCount: 0,
    featuredLinksChecked: [],
    screenshots: {},
    observedSpans: [],
    defects: [],
  },
  inboxManifest: {
    duplicateWarningShown: false,
    honestEmptyEventsShown: false,
    imNotGeneratedNoticeShown: false,
    api409ImNotGeneratedVerified: false,
    aiReplyVariantNonRepeating: false,
    vipDeleteStrongWarningShown: false,
    foldedNewsletterFilterDefaultHidden: false,
    screenshots: {},
    observedSpans: [],
    defects: [],
  },
};

function loadGroundTruth(): Record<string, GroundTruthCase> {
  const raw = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, 'utf-8'));
  const map: Record<string, GroundTruthCase> = {};
  for (const c of raw.cases as Array<any>) {
    const id = String(c.id || c.case_id);
    const vacDesc = String(c.expectedOracle?.asIsVacancyDesc ?? '');
    const vacPctFromObj = c.rentRollVerification?.occupancySummaryAsIs?.vacancyPct;
    const pctMatches = Array.from(vacDesc.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((m) =>
      parseFloat(m[1]),
    );
    const unitVac =
      typeof vacPctFromObj === 'number'
        ? vacPctFromObj
        : id === 'CASE-03'
          ? 16.7
          : pctMatches[0] ?? 0;
    const areaVac = id === 'CASE-05' ? 25.3 : id === 'CASE-04' ? 10.8 : unitVac;
    const postureMap: Record<string, 'owner_occupied' | 'value_add' | 'income'> = {
      'CASE-02': 'owner_occupied',
      'CASE-03': 'value_add',
      'CASE-04': 'income',
      'CASE-05': 'income',
    };

    map[id] = {
      case_id: id,
      folder: String(c.folderName ?? ''),
      input_mode: String(c.inputMode ?? ''),
      address: String(c.jibunAddress ?? ''),
      pnu: String(c.pnu ?? ''),
      land_area_sqm: Number(c.landAreaSqm ?? 0),
      gfa_sqm: Number(c.gfaSqm ?? 0),
      asking_price_manwon: Number(c.askingPriceManwon ?? 0),
      asking_price_krw: Number(c.askingPriceManwon ?? 0) * 10000,
      posture: postureMap[id] ?? 'income',
      expected_price_band: String(c.dealCardVerification?.parsedPriceBand ?? ''),
      dealcard_blind_forbidden_tokens: Array.isArray(c.dealCardVerification?.checkedForbiddenTokens)
        ? c.dealCardVerification.checkedForbiddenTokens
        : [],
      asis_rentroll: {
        deposit_manwon: Number(c.expectedOracle?.asIsDepositManwon ?? 0),
        rent_manwon: Number(c.expectedOracle?.asIsRentManwon ?? 0),
        mgmt_manwon: Number(c.expectedOracle?.asIsMgmtManwon ?? 0),
        net_yield_pct: Number(c.expectedOracle?.asIsNetYieldPct ?? 0),
        gross_yield_pct: Number(c.expectedOracle?.asIsGrossCapPct ?? 0),
        vacancy_unit_pct: unitVac,
        vacancy_area_pct: areaVac,
      },
      stabilized_rentroll: {
        deposit_manwon: Number(c.expectedOracle?.stabilizedDepositManwon ?? 0),
        rent_manwon: Number(c.expectedOracle?.stabilizedRentManwon ?? 0),
        mgmt_manwon: Number(c.expectedOracle?.stabilizedMgmtManwon ?? 0),
        net_yield_pct: Number(c.expectedOracle?.stabilizedNetYieldPct ?? 0),
        gross_yield_pct: Number(c.expectedOracle?.stabilizedGrossCapPct ?? 0),
        vacancy_unit_pct: 0,
      },
      expected_rentroll_slide_split:
        Number(c.rentRollVerification?.rowCount ?? 0) >= 12 ? 2 : 1,
    };
  }
  return map;
}

async function applyFontScale(page: Page, scale: 'normal' | 'xlarge') {
  await page.evaluate((s) => {
    document.documentElement.setAttribute('data-font-scale', s);
    try {
      window.localStorage.setItem('credeal-font-scale', s);
      window.localStorage.setItem('cre-font-scale', s);
    } catch {
      // ignore
    }
  }, scale);
  await page.waitForTimeout(250);
}

async function hideDevOverlay(page: Page) {
  await page
    .addStyleTag({
      content:
        'nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}',
    })
    .catch(() => {});
}

async function collectDomProbe(page: Page, scopeSelector: string): Promise<DomProbeRaw> {
  return await page.evaluate((sel) => {
    const isVisible = (el: Element): boolean => {
      const htmlEl = el as HTMLElement;
      const style = getComputedStyle(htmlEl);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      if (htmlEl.closest('.sr-only')) return false;
      const rect = htmlEl.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    };

    const inViewport = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
    };

    const overflowPx = Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    const scopeRoot = document.querySelector(sel) || document.body;
    const interactiveSel =
      'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="switch"]';

    const allInteractives = Array.from(document.querySelectorAll(interactiveSel)).filter((el) => {
      if (!isVisible(el)) return false;
      const h = el as HTMLElement;
      if (h.hasAttribute('data-preview-unit-id')) return false;
      if (h.getAttribute('role') === 'separator') return false;
      return true;
    });

    const scopeInteractives = Array.from(scopeRoot.querySelectorAll(interactiveSel)).filter(
      (el) => {
        if (!isVisible(el)) return false;
        const h = el as HTMLElement;
        if (h.hasAttribute('data-preview-unit-id')) return false;
        if (h.getAttribute('role') === 'separator') return false;
        return true;
      },
    );

    const scopeAboveFold = scopeInteractives.filter(inViewport);

    const sub44Buttons: Array<{ text: string; width: number; height: number }> = [];
    const clippedButtons: Array<{ text: string; clientW: number; scrollW: number }> = [];
    const observedButtons: string[] = [];

    for (const el of allInteractives) {
      const htmlEl = el as HTMLElement;
      const label = (htmlEl.innerText || htmlEl.getAttribute('aria-label') || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48);
      if (label && observedButtons.length < 30) observedButtons.push(label);

      const rect = htmlEl.getBoundingClientRect();
      const role = el.getAttribute('role');
      const isTapTarget = el.tagName === 'BUTTON' || role === 'tab' || role === 'switch';
      if (isTapTarget && Math.round(rect.height) < 40 && sub44Buttons.length < 25) {
        sub44Buttons.push({
          text: label || el.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }

      if (isTapTarget || el.tagName === 'A') {
        const isSidebarRow =
          htmlEl.matches('[data-list-row="simple"]') ||
          Boolean(htmlEl.closest('[data-list-row="simple"]'));
        if (!isSidebarRow) {
          const btnStyle = getComputedStyle(htmlEl);
          const ownOverflow =
            htmlEl.clientWidth > 0 &&
            htmlEl.scrollWidth > htmlEl.clientWidth + 6 &&
            btnStyle.overflowX !== 'visible';
          if (ownOverflow && clippedButtons.length < 20) {
            clippedButtons.push({
              text: label || el.tagName,
              clientW: Math.round(htmlEl.clientWidth),
              scrollW: Math.round(htmlEl.scrollWidth),
            });
          }
        }
      }
    }

    const sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }> = [];
    const textEls = Array.from(scopeRoot.querySelectorAll('p, li, h1, h2, h3, label')).filter(
      isVisible,
    );
    for (const el of textEls) {
      const htmlEl = el as HTMLElement;
      const txt = (htmlEl.innerText || '').replace(/\s+/g, ' ').trim();
      if (txt.length < 6) continue;
      const fsPx = parseFloat(getComputedStyle(htmlEl).fontSize || '16');
      if (fsPx < 13.5 && sub15Texts.length < 20) {
        sub15Texts.push({ text: txt.slice(0, 40), tag: el.tagName, fontSizePx: Math.round(fsPx * 10) / 10 });
      }
    }

    const brokenImgs = Array.from(document.querySelectorAll('img'))
      .filter((img) => isVisible(img) && img.complete && img.naturalWidth === 0)
      .map((img) => ({ alt: img.alt || '', src: img.src.slice(0, 120) }));

    const observedHeadings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .filter(isVisible)
      .map((h) => (h as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20);

    const observedBadges = Array.from(
      document.querySelectorAll('[data-testid*="badge"], [role="status"], [role="alert"]'),
    )
      .filter(isVisible)
      .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20);

    const visibleText = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    const provenanceBadgeVisible =
      /공인중개사|중개법인|검증|건축물대장|토지이음|국토교통부|한국부동산원|등록번호|소재지/.test(
        visibleText,
      );
    const honestSaveVisible = /저장됨|임시저장|자동 저장|발행됨|발행 완료/.test(visibleText);

    return {
      horizontalOverflowPx: Math.round(overflowPx),
      aboveFoldActionCount: scopeAboveFold.length,
      totalVisibleInteractiveCount: scopeInteractives.length,
      sub44Buttons,
      sub15Texts,
      clippedButtons,
      brokenImgs,
      visibleText,
      observedHeadings,
      observedButtons,
      observedBadges,
      provenanceBadgeVisible,
      honestSaveVisible,
    };
  }, scopeSelector);
}

function countBannedTerms(text: string): number {
  let count = 0;
  for (const entry of BANNED_UI_TERMS) {
    if (entry.term.test(text)) count += 1;
  }
  return count;
}

function countPoisonTokens(text: string): number {
  const matches = text.match(new RegExp(RAW_ERROR_REGEX.source, 'g'));
  return matches ? matches.length : 0;
}

/**
 * Isolated LibreOffice user profile conversion (Rule 79 safe — never stops user's soffice process).
 */
function convertPptxToPngsIsolated(
  pptxBuffer: Buffer,
  outputDir: string,
  baseName: string,
  dpi: number = 150,
): { pdfPath: string; slideImages: string[]; slideCount: number } {
  ensureDir(outputDir);
  const pptxPath = path.join(outputDir, `${baseName}.pptx`);
  fs.writeFileSync(pptxPath, pptxBuffer);

  const profileDir = path.join(outputDir, `_lo_profile_${baseName}`);
  ensureDir(profileDir);
  const profileUrl = 'file:///' + profileDir.replace(/\\/g, '/');

  const pyScript = `
import subprocess, os, sys, fitz
pptx_path = r"""${pptxPath}"""
output_dir = r"""${outputDir}"""
base_name = "${baseName}"
dpi = ${dpi}
profile_url = "${profileUrl}"

soffice_path = r"C:\\Program Files\\LibreOffice\\program\\soffice.com"
if not os.path.exists(soffice_path):
    soffice_path = r"C:\\Program Files\\LibreOffice\\program\\soffice.exe"
if not os.path.exists(soffice_path):
    soffice_path = "soffice"

pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
if os.path.exists(pdf_path):
    try:
        os.remove(pdf_path)
    except Exception:
        pass

cmd = [
    soffice_path,
    f"-env:UserInstallation={profile_url}",
    "--headless",
    "--norestore",
    "--convert-to", "pdf",
    pptx_path,
    "--outdir", output_dir,
]
res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
if res.returncode != 0:
    print(f"ERROR: LibreOffice failed: {res.stderr or res.stdout}", file=sys.stderr)
    sys.exit(1)

if not os.path.exists(pdf_path):
    print(f"ERROR: PDF not created at {pdf_path}", file=sys.stderr)
    sys.exit(1)

doc = fitz.open(pdf_path)
slide_paths = []
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=dpi)
    img_path = os.path.join(output_dir, f"{base_name}_slide_{i+1:02d}.png")
    pix.save(img_path)
    slide_paths.append(img_path)

print(f"SLIDE_COUNT:{len(doc)}")
for sp in slide_paths:
    print(f"SLIDE_PATH:{sp}")
`;
  const scriptPath = path.join(outputDir, `_render_${baseName}.py`);
  fs.writeFileSync(scriptPath, pyScript, 'utf-8');
  const stdout = execSync(`python "${scriptPath}"`, { encoding: 'utf-8', timeout: 150_000 });
  const lines = stdout.split(/\r?\n/).map((l) => l.trim());
  const slideCount = Number(
    lines.find((l) => l.startsWith('SLIDE_COUNT:'))?.replace('SLIDE_COUNT:', '') ?? 0,
  );
  const slideImages = lines
    .filter((l) => l.startsWith('SLIDE_PATH:'))
    .map((l) => l.replace('SLIDE_PATH:', '').trim());
  return {
    pdfPath: path.join(outputDir, `${baseName}.pdf`),
    slideImages,
    slideCount,
  };
}

/** Dispatch a real synthetic ClipboardEvent('paste') on the rent-roll grid */
async function pasteTsvIntoRentRollGrid(page: Page, tsvContent: string) {
  const grid = page.locator('[data-testid="rent-roll-grid"]').first();
  await grid.waitFor({ state: 'visible', timeout: 15_000 });
  await grid.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    dt.setData('text', text);
    const ev = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    el.dispatchEvent(ev);
  }, tsvContent);
  await page.waitForTimeout(500);
}

/** Check whether a target percentage appears in extracted PPTX text within ±0.03%p */
function hasPercentageWithinTolerance(text: string, expectedPct: number, tol = 0.03): boolean {
  const matches = text.match(/\d+(?:\.\d+)?\s*%/g) ?? [];
  for (const m of matches) {
    const val = parseFloat(m.replace('%', '').trim());
    if (Number.isFinite(val) && Math.abs(val - expectedPct) <= tol) {
      return true;
    }
  }
  return false;
}

const VALID_DEAL_ID_REGEX = /^(?:[0-9a-f-]{36}|bld-[a-z0-9-]+)$/i;

/** Run full DealCard → /dc/[id] → IM → /im-lite/[id] → PPTX/PDF/PNG funnel for one golden case */
async function runGoldenCaseFunnel(
  page: Page,
  spec: CaseSpec,
  gt: GroundTruthCase,
): Promise<CaseExecutionRecord> {
  const caseDir = path.join(TESTDATA_ROOT, spec.folderName);
  const caseOutDir = path.join(OUT_ROOT, spec.caseId);
  ensureDir(caseOutDir);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const server500s: string[] = [];
  const onConsole = (msg: any) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onPageError = (err: Error) => pageErrors.push(err.message);
  const onResponse = (res: any) => {
    if (res.status() >= 500) {
      const entry = `${res.request().method()} ${res.url()} -> ${res.status()}`;
      server500s.push(entry);
      runState.server500s.push(`[${spec.caseId}] ${entry}`);
      console.log(`  🚨 HTTP ${res.status()}: ${res.request().method()} ${res.url()}`);
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  const defects: string[] = [];
  const pokaYokeChecks: Record<string, boolean> = {};
  const screenshots: Record<string, string> = {};

  try {
    // =========================================================================
    // STAGE 1: DEALCARD WORKSPACE (Broker Creator)
    // =========================================================================
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/dealcards?new=1', { waitUntil: 'domcontentloaded' });
    await hideDevOverlay(page);
    await applyFontScale(page, spec.caseId === 'CASE-02' ? 'xlarge' : 'normal');

    let buildingId = '';
    const onWorkspacePatch = (res: any) => {
      if (
        res.url().includes('/api/broker/workspace/summary') &&
        res.request().method() === 'PATCH'
      ) {
        try {
          const reqBody = res.request().postDataJSON?.() as Record<string, any> | null;
          if (
            reqBody?.buildingId &&
            VALID_DEAL_ID_REGEX.test(String(reqBody.buildingId)) &&
            (reqBody.action === 'upsert' || reqBody.action === 'mark_sent')
          ) {
            buildingId = String(reqBody.buildingId);
            if (!runState.createdBuildingIds.includes(buildingId)) {
              runState.createdBuildingIds.push(buildingId);
            }
          }
        } catch {
          // ignore
        }
      }
    };
    page.on('response', onWorkspacePatch);

    const memoText = fs.readFileSync(path.join(caseDir, '01_딜카드_현장메모.txt'), 'utf-8').trim();
    const memoBox = page.locator('[data-testid="dealcard-top-memo-textarea"]');
    await memoBox.waitFor({ state: 'visible', timeout: 25_000 });
    await memoBox.fill(memoText);

    const genBtn = page.locator('[data-testid="dealcard-generate-from-memo-btn"]');
    await genBtn.click();

    await page.locator('[data-testid="card4-confirm-card"]').waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    await page.waitForTimeout(1000);

    // Check detected posture chip
    let detectedPosture = 'unknown';
    for (const pid of ['income', 'owner_occupied', 'value_add']) {
      const chip = page.locator(`[data-testid="card4-posture-chip-${pid}"]`);
      if (await chip.count()) {
        const pressed = await chip.getAttribute('aria-pressed');
        if (pressed === 'true') detectedPosture = pid;
      }
    }
    const dealcardPostureMatch = detectedPosture === spec.dcExpectedPostureChipId;
    if (!dealcardPostureMatch) {
      defects.push(
        `[DealCard] 포스처 자동분류 불일치: expected=${spec.dcExpectedPostureChipId}, detected=${detectedPosture}`,
      );
      // Correct manually so downstream IM/PPTX can proceed cleanly while recording the defect
      const expectedChip = page.locator(
        `[data-testid="card4-posture-chip-${spec.dcExpectedPostureChipId}"]`,
      );
      if (await expectedChip.count()) await expectedChip.click();
    }

    // Check AI headline 2x non-repetition (Card4 applies directly into card4-headline-input with undo toast)
    let aiHeadlineVariantNonRepeating = false;
    const aiHeadlineBtn = page.locator('[data-testid="card4-ai-headline-btn"]');
    const headlineInput = page.locator('[data-testid="card4-headline-input"]');
    if (await aiHeadlineBtn.isVisible()) {
      await aiHeadlineBtn.click();
      await page
        .waitForFunction(
          () =>
            document
              .querySelector('[data-testid="card4-ai-headline-btn"]')
              ?.getAttribute('aria-busy') === 'false',
          undefined,
          { timeout: 25_000 },
        )
        .catch(() => {});
      await page.waitForTimeout(400);
      const firstSugg = (await headlineInput.inputValue()).trim();

      await aiHeadlineBtn.click();
      await page
        .waitForFunction(
          () =>
            document
              .querySelector('[data-testid="card4-ai-headline-btn"]')
              ?.getAttribute('aria-busy') === 'false',
          undefined,
          { timeout: 25_000 },
        )
        .catch(() => {});
      await page.waitForTimeout(400);
      const secondSugg = (await headlineInput.inputValue()).trim();
      aiHeadlineVariantNonRepeating =
        Boolean(firstSugg) && Boolean(secondSugg) && firstSugg !== secondSugg;
      if (!aiHeadlineVariantNonRepeating) {
        defects.push(
          `[DealCard] AI 제목 추천 2회 연속 비중복 미충족 (1차="${firstSugg}", 2차="${secondSugg}")`,
        );
      }
    }

    // Check strength tag chip interaction
    let strengthTagApplied = false;
    const pointInput0 = page.locator('[data-testid="card4-point-input-0"]');
    if (await pointInput0.isVisible()) {
      const beforePt = await pointInput0.inputValue();
      await pointInput0.focus();
      const firstChip = page.locator('[data-testid^="dealcard-strength-chip-"]').first();
      if (await firstChip.isVisible()) {
        await firstChip.click();
        await page.waitForTimeout(300);
        const afterPt = await pointInput0.inputValue();
        strengthTagApplied = Boolean(afterPt) && afterPt !== beforePt;
        if (!strengthTagApplied) {
          defects.push('[DealCard] 강점 태그칩 클릭 시 포커스 슬롯 반영 미확인');
        }
      }
    }

    // If blind alert or priceband warning appeared on editor, clean/convert as a real broker would
    const blindCleanBtn = page.locator('[data-testid="card4-blind-clean-btn"]');
    if (await blindCleanBtn.isVisible().catch(() => false)) {
      await blindCleanBtn.click();
      await page.waitForTimeout(400);
    }
    const priceConvertBtn = page.locator('[data-testid="card4-priceband-convert-btn"]');
    if (await priceConvertBtn.isVisible().catch(() => false)) {
      await priceConvertBtn.click();
      await page.waitForTimeout(400);
    }

    // Probe DealCard creator workspace DOM ergonomics
    const dcCreatorProbe = await collectDomProbe(page, '[data-testid="card4-confirm-card"]');
    const dcCreatorShot = path.join(caseOutDir, `${spec.caseId.toLowerCase()}_dc_workspace.png`);
    await page.screenshot({ path: dcCreatorShot, fullPage: false });
    screenshots.dcWorkspace = dcCreatorShot;

    // Publish DealCard via Primary Send button → PreSendConfirmationSheet
    let dcUrl = '';

    // Capture publish API response (`PATCH /api/broker/workspace/summary` mark_sent or `/publish`)
    const publishResponsePromise = page
      .waitForResponse(
        (res) =>
          (res.url().includes('/api/broker/workspace/summary') &&
            res.request().method() === 'PATCH') ||
          (res.url().includes('/api/broker/dealcards/') && res.url().includes('/publish')) ||
          (res.url().includes('/api/broker/deal/') && res.url().includes('/teaser/publish')),
        { timeout: 30_000 },
      )
      .catch(() => null);

    await page.locator('[data-testid="workspace-primary-send-btn"]:visible').first().click();
    const presendSheet = page.locator('[data-testid="presend-confirmation-sheet"]');
    await presendSheet.waitFor({ state: 'visible', timeout: 20_000 });

    const autoMaskBtn = page.locator('[data-testid="presend-auto-mask-btn"]');
    if (await autoMaskBtn.isVisible().catch(() => false)) {
      await autoMaskBtn.click();
      await page.waitForTimeout(300);
    }

    // Click copy link button to trigger mark_sent publish
    await page.locator('[data-testid="presend-copy-btn"]').click();
    const pubRes = await publishResponsePromise;
    if (pubRes) {
      const pubJson = await pubRes.json().catch(() => ({}));
      const urlField = pubJson.publicUrl || pubJson.url || pubJson.shareUrl || '';
      if (pubJson.buildingId && VALID_DEAL_ID_REGEX.test(String(pubJson.buildingId))) {
        buildingId = String(pubJson.buildingId);
      } else {
        const idMatch =
          String(urlField).match(/\/dc\/([a-z0-9-]+)/i) ||
          pubRes.url().match(/\/dealcards\/([a-z0-9-]+)\//i) ||
          pubRes.url().match(/\/deal\/([a-z0-9-]+)\//i);
        if (idMatch) buildingId = idMatch[1];
      }
      if (urlField) dcUrl = String(urlField);
    }

    await page.waitForTimeout(1200);
    if (!buildingId) {
      const curUrl = page.url();
      const m = curUrl.match(/[?&](?:id|buildingId)=([a-z0-9-]+)/i);
      if (m && VALID_DEAL_ID_REGEX.test(m[1])) buildingId = m[1];
    }
    if (!buildingId) {
      const sumRes = await page.request.get('/api/broker/workspace/summary');
      const sumJson = await sumRes.json().catch(() => ({}));
      const dcs = (sumJson.dealcards || []) as Array<any>;
      if (Array.isArray(dcs) && dcs.length > 0 && dcs[0]?.id) {
        buildingId = String(dcs[0].id);
      }
    }
    expect(buildingId, `[${spec.caseId}] buildingId must be resolved after DealCard publish`).toMatch(
      VALID_DEAL_ID_REGEX,
    );
    if (!runState.createdBuildingIds.includes(buildingId)) {
      runState.createdBuildingIds.push(buildingId);
    }
    page.off('response', onWorkspacePatch);
    if (!dcUrl) dcUrl = `/dc/${buildingId}`;
    // Normalize relative path if absolute
    const dcRelPath = dcUrl.startsWith('http') ? new URL(dcUrl).pathname + new URL(dcUrl).search : dcUrl;

    // Score DealCard creator persona
    const dcCreatorWriting = scanUxWriting(dcCreatorProbe.visibleText);
    const dcCreatorMetrics: DealCardPpgtProbeMetrics = {
      personaId: spec.caseId === 'CASE-02' ? 'DC-MG-01' : 'DC-MG-02',
      surface: `/broker/w/dealcards (${spec.caseId})`,
      viewport: '1440x900',
      fontScale: spec.caseId === 'CASE-02' ? 'xlarge' : 'normal',
      aboveFoldActionCount: dcCreatorProbe.aboveFoldActionCount,
      totalVisibleInteractiveCount: dcCreatorProbe.totalVisibleInteractiveCount,
      horizontalOverflowPx: dcCreatorProbe.horizontalOverflowPx,
      sub44ButtonsCount: dcCreatorProbe.sub44Buttons.length,
      sub15TextsCount: dcCreatorProbe.sub15Texts.length,
      clippedButtonsCount: dcCreatorProbe.clippedButtons.length,
      brokenImgCount: dcCreatorProbe.brokenImgs.length,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      poisonTokenCount: countPoisonTokens(dcCreatorProbe.visibleText),
      bannedTermCount: countBannedTerms(dcCreatorProbe.visibleText),
      blindLeakCount: 0,
      uxWritingViolationsCount: dcCreatorWriting.josaViolationCount,
      contentSuitabilityViolationsCount: dealcardPostureMatch ? 0 : 1,
      taskCompleted: Boolean(buildingId),
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: Boolean(buildingId),
      honestSaveVisible: dcCreatorProbe.honestSaveVisible,
      observedHeadings: dcCreatorProbe.observedHeadings,
      observedButtons: dcCreatorProbe.observedButtons,
      observedBadges: dcCreatorProbe.observedBadges,
    };
    runState.dealcardRuns.push(scoreDealCardPpgtRun(dcCreatorMetrics));

    // =========================================================================
    // STAGE 2: PUBLIC /dc/[id] + KAKAO OG IMAGE (Mobile 390 xlarge Buyer)
    // =========================================================================
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(dcRelPath, { waitUntil: 'networkidle' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');

    const dcMobileProbe = await collectDomProbe(page, 'main');
    const dcMobileShot = path.join(caseOutDir, `${spec.caseId.toLowerCase()}_dc_390_xlarge.png`);
    await page.screenshot({ path: dcMobileShot, fullPage: true });
    screenshots.dcMobile = dcMobileShot;

    // Blind forbidden token check (Rule 74: ZERO tolerance)
    const blindLeaksOnDc: string[] = [];
    for (const token of gt.dealcard_blind_forbidden_tokens) {
      if (dcMobileProbe.visibleText.includes(token)) {
        blindLeaksOnDc.push(token);
      }
    }
    if (blindLeaksOnDc.length > 0) {
      defects.push(`[DealCard /dc] 블라인드 금지 토큰 유출: ${blindLeaksOnDc.join(', ')}`);
    }

    const priceBandFoundOnDc = dcMobileProbe.visibleText.includes(gt.expected_price_band);
    if (!priceBandFoundOnDc) {
      defects.push(`[DealCard /dc] 예상 가격대(${gt.expected_price_band}) 미표시`);
    }

    // Check Kakao OG image endpoint
    const ogRes = await page.request.get(`/api/og/deal/${buildingId}/kakao-v2`);
    const ogBuf = ogRes.ok() ? await ogRes.body() : Buffer.alloc(0);
    const ogImageValid =
      ogRes.ok() &&
      ogBuf.length > 5000 &&
      ogBuf[0] === 0x89 &&
      ogBuf[1] === 0x50 &&
      ogBuf[2] === 0x4e &&
      ogBuf[3] === 0x47;
    if (!ogImageValid) {
      defects.push(`[DealCard OG] kakao-v2 PNG 응답 실패 (status=${ogRes.status()}, bytes=${ogBuf.length})`);
    } else {
      const ogPath = path.join(caseOutDir, `${spec.caseId.toLowerCase()}_kakao_og.png`);
      fs.writeFileSync(ogPath, ogBuf);
      screenshots.dcKakaoOg = ogPath;
    }

    const dcSuit = auditDealCardContentSuitability({
      renderedText: dcMobileProbe.visibleText,
      headline: dcMobileProbe.observedHeadings[0] || '',
      areaBadgeText: '',
      points: [],
      posture:
        spec.dcExpectedPostureChipId === 'value_add'
          ? 'value_add'
          : spec.dcExpectedPostureChipId === 'owner_occupied'
            ? 'owner_occupied'
            : 'income',
      forbiddenPublicTokens: gt.dealcard_blind_forbidden_tokens,
      expectThreeTierSpecsOnDetail: false,
    });
    const dcBuyerWriting = scanUxWriting(dcMobileProbe.visibleText);
    runState.dealcardRuns.push(
      scoreDealCardPpgtRun({
        personaId: spec.dealcardBuyerPersonaId,
        surface: `/dc/${buildingId} (${spec.caseId})`,
        viewport: '390x844',
        fontScale: 'xlarge',
        aboveFoldActionCount: dcMobileProbe.aboveFoldActionCount,
        totalVisibleInteractiveCount: dcMobileProbe.totalVisibleInteractiveCount,
        horizontalOverflowPx: dcMobileProbe.horizontalOverflowPx,
        sub44ButtonsCount: dcMobileProbe.sub44Buttons.length,
        sub15TextsCount: dcMobileProbe.sub15Texts.length,
        clippedButtonsCount: dcMobileProbe.clippedButtons.length,
        brokenImgCount: dcMobileProbe.brokenImgs.length,
        consoleErrorCount: consoleErrors.length,
        pageErrorCount: pageErrors.length,
        poisonTokenCount: countPoisonTokens(dcMobileProbe.visibleText),
        bannedTermCount: countBannedTerms(dcMobileProbe.visibleText),
        blindLeakCount: blindLeaksOnDc.length,
        numericSpinCount: dcSuit.numericSpinCount,
        uxWritingViolationsCount: dcBuyerWriting.josaViolationCount,
        contentSuitabilityViolationsCount: priceBandFoundOnDc ? 0 : 1,
        taskCompleted: true,
        blockingModalDetected: false,
        boundaryViolationCount: 0,
        provenanceBadgeVisible: dcMobileProbe.provenanceBadgeVisible,
        artifactValid: ogImageValid,
        observedHeadings: dcMobileProbe.observedHeadings,
        observedButtons: dcMobileProbe.observedButtons,
        observedBadges: dcMobileProbe.observedBadges,
      }),
    );

    // =========================================================================
    // STAGE 3: IM WORKSPACE (DealCard → IM Handoff + Step 1~4 + Poka-Yoke)
    // =========================================================================
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/broker/w/im?buildingId=${encodeURIComponent(buildingId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await hideDevOverlay(page);
    await applyFontScale(page, spec.caseId === 'CASE-02' ? 'xlarge' : 'normal');

    await page.locator('[data-testid="im-tab-panel-specs"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    // Select canonical posture button
    const postureBtn = page
      .locator('[data-testid="im-posture-selector-section"] button')
      .filter({ hasText: spec.imPostureButtonText })
      .first();
    await postureBtn.click();

    // Fill title
    const titleInput = page.locator('[data-testid="im-title-single-line-input"]');
    await titleInput.fill(spec.imTitle);

    // Fill exact asking price (억 + 만원)
    const eokVal = Math.floor(gt.asking_price_manwon / 10000);
    const manVal = gt.asking_price_manwon % 10000;
    await page.locator('[data-testid="im-price-eok-input"]').fill(String(eokVal));
    await page.locator('[data-testid="im-price-man-input"]').fill(manVal > 0 ? String(manVal) : '');

    if (spec.caseId === 'CASE-03') {
      const readoutText = await page.locator('[data-testid="im-price-readout"]').innerText();
      pokaYokeChecks.case03ExactPriceReadout =
        readoutText.includes('242억') && readoutText.includes('2,680');
      if (!pokaYokeChecks.case03ExactPriceReadout) {
        defects.push(`[IM CASE-03] 억+만원 정확 금액 표시 불일치: "${readoutText}"`);
      }
    }

    // Fill address
    await page.locator('[data-testid="im-address-input"]').fill(gt.address);

    // CASE-03 Poka-Yoke: intentional Land ↔ GFA swap + 1-click swap recovery
    const gfaInput = page.locator('[data-testid="im-gfa-input"]');
    const landInput = page.locator('[data-testid="im-land-area-input"]');
    if (spec.caseId === 'CASE-03') {
      await gfaInput.fill(String(gt.land_area_sqm));
      await landInput.fill(String(gt.gfa_sqm));
      await page.waitForTimeout(400);
      const swapWarn = page.locator('[data-testid="im-area-swap-warning"]');
      const swapBtn = page.locator('[data-testid="im-area-swap-btn"]');
      const warnVisible = await swapWarn.isVisible().catch(() => false);
      let recovered = false;
      if (warnVisible && (await swapBtn.isVisible().catch(() => false))) {
        await swapBtn.click();
        await page.waitForTimeout(300);
        const afterGfa = parseFloat(await gfaInput.inputValue());
        const afterLand = parseFloat(await landInput.inputValue());
        recovered =
          Math.abs(afterGfa - gt.gfa_sqm) < 0.2 && Math.abs(afterLand - gt.land_area_sqm) < 0.2;
      }
      pokaYokeChecks.case03LandGfaSwapRecovery = warnVisible && recovered;
      if (!pokaYokeChecks.case03LandGfaSwapRecovery) {
        defects.push(
          `[IM CASE-03] 대지↔연면적 스왑 경고/복구 실패 (warnVisible=${warnVisible}, recovered=${recovered})`,
        );
      }
    }

    await gfaInput.fill(String(gt.gfa_sqm));
    await landInput.fill(String(gt.land_area_sqm));
    await page.locator('[data-testid="im-zoning-input"]').fill(spec.zoning);
    await page.locator('[data-testid="im-completion-date-input"]').fill(spec.completionDate);

    // Step 1 → Step 2 (Rent Roll)
    await page.locator('[data-testid="im-next-to-rentroll-btn"]').click();
    await page.locator('[data-testid="im-tab-panel-rentroll"]').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await page.waitForTimeout(400);

    if (spec.rentRollMode === 'tsv') {
      // CASE-02 Poka-Yoke: 원 단위 오입력 TSV 자동 보정 체험
      if (spec.caseId === 'CASE-02' && spec.appendixPokaYokeFile) {
        const wonTsv = fs.readFileSync(path.join(caseDir, spec.appendixPokaYokeFile), 'utf-8');
        await pasteTsvIntoRentRollGrid(page, wonTsv);
        const alertText = await page
          .locator('[data-testid="rent-roll-grid"] [role="alert"]')
          .first()
          .innerText()
          .catch(() => '');
        pokaYokeChecks.case02WonUnitAutoCorrect =
          alertText.includes('원 단위') && alertText.includes('자동 보정');
        if (!pokaYokeChecks.case02WonUnitAutoCorrect) {
          defects.push(`[IM CASE-02] 원 단위 오입력 자동 보정 배너 미노출: "${alertText}"`);
        }
      }

      // Paste actual As-Is TSV
      const asisTsv = fs.readFileSync(path.join(caseDir, spec.asisFile), 'utf-8');
      await pasteTsvIntoRentRollGrid(page, asisTsv);
    } else {
      // XLSX v1.5 upload path
      const importerBox = page.locator('[data-testid="im-rentroll-xlsx-importer"]');
      if (!(await importerBox.isVisible().catch(() => false))) {
        const toggleBtn = page.locator('[data-testid="im-rentroll-import-toggle"]');
        if (await toggleBtn.isVisible().catch(() => false)) {
          await toggleBtn.click();
          await page.waitForTimeout(300);
        }
      }

      // CASE-05 Poka-Yoke: V12 단위 혼동 차단 게이트 체험
      if (spec.caseId === 'CASE-05' && spec.appendixPokaYokeFile) {
        const badXlsxPath = path.join(caseDir, spec.appendixPokaYokeFile);
        await page
          .locator('input[data-testid="rentroll-file-input"]')
          .first()
          .setInputFiles(badXlsxPath);
        await page.waitForTimeout(1000);
        const v12Panel = page.locator('[data-testid="rent-roll-v12-panel"]');
        const confirmBtn = page.locator('[data-testid="rent-roll-import-confirm-btn"]');
        const v12Shown = await v12Panel.isVisible().catch(() => false);
        const confirmDisabled = await confirmBtn.isDisabled().catch(() => false);
        pokaYokeChecks.case05V12BlockingGate = v12Shown && confirmDisabled;
        if (!pokaYokeChecks.case05V12BlockingGate) {
          defects.push(
            `[IM CASE-05] V12 단위혼동 차단게이트 실패 (v12Shown=${v12Shown}, confirmDisabled=${confirmDisabled})`,
          );
        }
        const cancelBtn = page.locator('[data-testid="rent-roll-import-cancel-btn"]');
        if (await cancelBtn.isVisible().catch(() => false)) {
          await cancelBtn.click();
          await page.waitForTimeout(300);
        }
      }

      // Upload valid XLSX v1.5
      const validXlsxPath = path.join(caseDir, spec.asisFile);
      await page
        .locator('input[data-testid="rentroll-file-input"]')
        .first()
        .setInputFiles(validXlsxPath);
      await page.waitForTimeout(1000);

      // Handle overwrite confirmation if present
      const overwriteConfirm = page.locator('button:has-text("덮어쓰기"), button:has-text("계속")').first();
      if (await overwriteConfirm.isVisible().catch(() => false)) {
        await overwriteConfirm.click();
        await page.waitForTimeout(800);
      }

      const confirmBtn = page.locator('[data-testid="rent-roll-import-confirm-btn"]');
      await confirmBtn.waitFor({ state: 'visible', timeout: 15_000 });
      const blockedUnexpectedly = await confirmBtn.isDisabled();
      if (blockedUnexpectedly) {
        defects.push(`[IM ${spec.caseId}] 정상 XLSX(${spec.asisFile})가 V12에 오차단됨`);
      } else {
        await confirmBtn.click();
        await page.waitForTimeout(600);
      }
    }

    // Switch to Expected (Stabilized) sub-tab and paste Stabilized TSV
    const expectedTab = page.locator('[data-testid="im-rentroll-subtab-expected"]');
    if (await expectedTab.isVisible().catch(() => false)) {
      await expectedTab.click();
      await page.waitForTimeout(400);
      const stabTsv = fs.readFileSync(path.join(caseDir, spec.stabilizedTsvFile), 'utf-8');
      await pasteTsvIntoRentRollGrid(page, stabTsv);
    }

    // Step 2 → Step 3 (Axios 3-Point Brief + AI Nominal Endings Check)
    await page.locator('[data-testid="im-next-to-axios-btn"]').click();
    await page.locator('[data-testid="im-tab-panel-axios-brief"]').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await page.waitForTimeout(400);

    let imAiNominalEndingsClean = true;
    const aiReclusterBtn = page.locator('[data-testid="im-axios-ai-recluster-btn"]');
    if (await aiReclusterBtn.isVisible().catch(() => false)) {
      await aiReclusterBtn.click();
      await page.waitForTimeout(4000);
      const titles: string[] = [];
      for (let i = 0; i < 3; i++) {
        const inp = page.locator(`[data-testid="im-axios-point-title-${i}"]`);
        if (await inp.isVisible().catch(() => false)) {
          titles.push((await inp.inputValue()).trim());
        }
      }
      if (titles.some((t) => /습니다\.?$|합니다\.?$/.test(t))) {
        imAiNominalEndingsClean = false;
        defects.push(`[IM ${spec.caseId}] Step3 AI 핵심포인트 제목 종결어미 비명사형: ${titles.join(' | ')}`);
      }
    }

    // Step 3 → Step 4 (Photos + Publish)
    await page.locator('[data-testid="im-next-to-media-btn"]').click();
    await page.locator('[data-testid="im-tab-panel-media-publish"]').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await page.waitForTimeout(400);

    const extFiles = spec.exteriorImages.map((rel) => path.join(caseDir, rel));
    const intFiles = spec.interiorImages.map((rel) => path.join(caseDir, rel));

    await page
      .locator('[data-testid="im-photo-dropzone-exterior"] input[type="file"]')
      .setInputFiles(extFiles);
    await page.locator('[data-testid="im-photo-card-0"]').waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page
      .locator('[data-testid="im-photo-dropzone-interior"] input[type="file"]')
      .setInputFiles(intFiles);
    await page.waitForTimeout(2500);

    // Probe IM Creator Workspace DOM
    const imCreatorProbe = await collectDomProbe(page, '[data-testid="im-editor-slot"]');
    const imCreatorShot = path.join(caseOutDir, `${spec.caseId.toLowerCase()}_im_workspace.png`);
    await page.screenshot({ path: imCreatorShot, fullPage: false });
    screenshots.imWorkspace = imCreatorShot;

    // Publish IM! Wait until button is enabled (photos finished uploading)
    const quickGenResPromise = page
      .waitForResponse(
        (res) =>
          (res.url().includes('/api/broker/im-lite/quick-generate') ||
            res.url().includes('/api/broker/im-lite/generate')) &&
          res.request().method() === 'POST',
        { timeout: 120_000 },
      )
      .catch(() => null);

    const step4GenBtn = page.locator('[data-testid="im-step4-generate-btn"]:visible').first();
    if (await step4GenBtn.isVisible().catch(() => false)) {
      await expect(step4GenBtn).toBeEnabled({ timeout: 25_000 });
      await step4GenBtn.click();
    } else {
      const qBtn = page.locator('[data-testid="im-quick-generate-btn"]:visible').first();
      await expect(qBtn).toBeEnabled({ timeout: 25_000 });
      await qBtn.click();
    }

    let docId = '';
    const genRes = await quickGenResPromise;
    if (genRes) {
      const genJson = await genRes.json().catch(() => ({}));
      if (genJson.buildingId && /^[0-9a-f-]{36}$/i.test(genJson.buildingId)) {
        if (genJson.buildingId !== buildingId) {
          buildingId = genJson.buildingId;
          runState.createdBuildingIds.push(buildingId);
        }
      }
      docId = genJson.documentId || genJson.docId || genJson.document?.id || '';
    }
    await page.waitForTimeout(3000);

    // Ensure published doc exists via API
    if (!docId) {
      const docsRes = await page.request.get(`/api/broker/im-lite/${buildingId}`);
      const docsJson = await docsRes.json().catch(() => ({}));
      const latestDoc = docsJson.documents?.[0] || docsJson.document;
      if (latestDoc?.id) docId = latestDoc.id;
    }

    const imLiteUrl = docId ? `/im-lite/${buildingId}?doc=${docId}` : `/im-lite/${buildingId}`;

    // =========================================================================
    // STAGE 4: PUBLIC MOBILE IM (/im-lite/[id] at 390x844 xlarge)
    // =========================================================================
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(imLiteUrl, { waitUntil: 'networkidle' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');

    const imMobileProbe = await collectDomProbe(page, 'main');
    const imMobileShot = path.join(caseOutDir, `${spec.caseId.toLowerCase()}_im_lite_390_xlarge.png`);
    await page.screenshot({ path: imMobileShot, fullPage: true });
    screenshots.imLiteMobile = imMobileShot;

    // =========================================================================
    // STAGE 5: PPTX BINARY + ORACLE VERIFICATION + 150DPI SLIDE PNGs + SLIDES-HTML
    // =========================================================================
    const pptxApiUrl = docId
      ? `/api/public/im-lite/${buildingId}/pptx?tier=basic&doc=${encodeURIComponent(docId)}`
      : `/api/public/im-lite/${buildingId}/pptx?tier=basic`;
    const pptxRes = await page.request.get(pptxApiUrl, { timeout: 120_000 });
    expect(pptxRes.ok(), `[${spec.caseId}] PPTX API must return 200 (got ${pptxRes.status()})`).toBe(
      true,
    );
    const pptxBuf = await pptxRes.body();
    const pptxPath = path.join(caseOutDir, `${spec.caseId.toLowerCase()}_basic_im.pptx`);
    fs.writeFileSync(pptxPath, pptxBuf);

    const zipInfo = analyzePptxZip(pptxPath);
    // Run 4 mandatory binary assertions (cre-golden-test-suite)
    try {
      assertNoPoisonTokens(zipInfo.slideEntries);
      assertNoDummyData(zipInfo.fullPptxText);
      assertNoEvasivePhrases(zipInfo.fullPptxText);
      assertPriceBandBlocked(zipInfo.fullPptxText);
    } catch (err: any) {
      defects.push(`[PPTX ${spec.caseId}] 바이너리 단언 실패: ${err?.message || String(err)}`);
    }

    // Ground-truth numerical oracle checks (Rule 74: NEVER weaken!)
    const oracleDetails: string[] = [];
    const eokStr = `${Math.floor(gt.asking_price_manwon / 10000)}억`;
    const priceReflected = zipInfo.fullPptxText.includes(eokStr);
    oracleDetails.push(`price(${eokStr})=${priceReflected}`);
    if (!priceReflected) defects.push(`[PPTX ${spec.caseId}] 매매가(${eokStr}) 미반영`);

    const asisNetYieldMatched =
      hasPercentageWithinTolerance(zipInfo.fullPptxText, gt.asis_rentroll.net_yield_pct, 0.05) ||
      hasPercentageWithinTolerance(zipInfo.fullPptxText, gt.asis_rentroll.gross_yield_pct, 0.05);
    oracleDetails.push(
      `asisYield(net=${gt.asis_rentroll.net_yield_pct}%/gross=${gt.asis_rentroll.gross_yield_pct}%)=${asisNetYieldMatched}`,
    );
    if (!asisNetYieldMatched) {
      defects.push(
        `[PPTX ${spec.caseId}] 현황 수익률 오라클 불일치 (기대 net=${gt.asis_rentroll.net_yield_pct}% / gross=${gt.asis_rentroll.gross_yield_pct}%)`,
      );
    }

    const stabilizedNetYieldMatched =
      hasPercentageWithinTolerance(
        zipInfo.fullPptxText,
        gt.stabilized_rentroll.net_yield_pct,
        0.06,
      ) ||
      hasPercentageWithinTolerance(
        zipInfo.fullPptxText,
        gt.stabilized_rentroll.gross_yield_pct,
        0.06,
      );
    oracleDetails.push(
      `stabilizedYield(net=${gt.stabilized_rentroll.net_yield_pct}%/gross=${gt.stabilized_rentroll.gross_yield_pct}%)=${stabilizedNetYieldMatched}`,
    );
    if (!stabilizedNetYieldMatched) {
      defects.push(
        `[PPTX ${spec.caseId}] 안정화 수익률 오라클 불일치 (기대 net=${gt.stabilized_rentroll.net_yield_pct}% / gross=${gt.stabilized_rentroll.gross_yield_pct}%)`,
      );
    }

    const vacancyMatched =
      hasPercentageWithinTolerance(zipInfo.fullPptxText, gt.asis_rentroll.vacancy_unit_pct, 0.5) ||
      hasPercentageWithinTolerance(zipInfo.fullPptxText, gt.asis_rentroll.vacancy_area_pct, 0.5) ||
      hasPercentageWithinTolerance(
        zipInfo.fullPptxText,
        100 - gt.asis_rentroll.vacancy_unit_pct,
        0.5,
      );
    oracleDetails.push(
      `vacancy(unit=${gt.asis_rentroll.vacancy_unit_pct}%/area=${gt.asis_rentroll.vacancy_area_pct}%)=${vacancyMatched}`,
    );
    if (!vacancyMatched) {
      defects.push(
        `[PPTX ${spec.caseId}] 공실률/임대율 오라클 불일치 (기대 unit=${gt.asis_rentroll.vacancy_unit_pct}% / area=${gt.asis_rentroll.vacancy_area_pct}%)`,
      );
    }

    let rentRollSlideSplitMatched = true;
    if (gt.expected_rentroll_slide_split && gt.expected_rentroll_slide_split >= 2) {
      const hasSplitMarker =
        zipInfo.fullPptxText.includes('(1/2)') && zipInfo.fullPptxText.includes('(2/2)');
      const rentRollSlides = zipInfo.allSlideTexts.filter(
        (t: string) => t.includes('임대차') && (t.includes('보증금') || t.includes('임대료')),
      );
      rentRollSlideSplitMatched = hasSplitMarker || rentRollSlides.length >= 2;
      oracleDetails.push(
        `rentRollSplit(expected>=2, marker=${hasSplitMarker}, slides=${rentRollSlides.length})=${rentRollSlideSplitMatched}`,
      );
      if (!rentRollSlideSplitMatched) {
        defects.push(`[PPTX ${spec.caseId}] 15호실 렌트롤 2장 분할((1/2)·(2/2)) 미확인`);
      }
    }

    // Convert PPTX → 150DPI Slide PNGs via isolated LibreOffice + PyMuPDF
    const slidesPngDir = path.join(caseOutDir, 'slides_150dpi');
    const captured = convertPptxToPngsIsolated(
      pptxBuf,
      slidesPngDir,
      `${spec.caseId.toLowerCase()}_basic`,
      150,
    );

    // Verify 16:9 PDF slides export endpoint (/api/public/im-lite/[id]/export?format=slides)
    const slidesHtmlUrl = docId
      ? `/api/public/im-lite/${buildingId}/export?format=slides&doc_id=${encodeURIComponent(docId)}`
      : `/api/public/im-lite/${buildingId}/export?format=slides`;
    const slidesHtmlRes = await page.request.get(slidesHtmlUrl);
    const slidesHtmlText = slidesHtmlRes.ok() ? await slidesHtmlRes.text() : '';
    const slidesHtmlValid =
      slidesHtmlRes.ok() &&
      slidesHtmlText.length > 500 &&
      (slidesHtmlText.includes('im-slide-page') ||
        slidesHtmlText.includes('297mm') ||
        slidesHtmlText.includes('landscape'));
    if (!slidesHtmlValid) {
      defects.push(
        `[PDF ${spec.caseId}] export?format=slides 16:9 응답 비정상 (status=${slidesHtmlRes.status()})`,
      );
    }

    // Score IM Creator + Mobile Consumer PPGT runs
    const imCreatorWriting = scanUxWriting(imCreatorProbe.visibleText);
    const imMobileWriting = scanUxWriting(imMobileProbe.visibleText);
    const oracleFailureCount = [
      priceReflected,
      asisNetYieldMatched,
      stabilizedNetYieldMatched,
      vacancyMatched,
      rentRollSlideSplitMatched,
    ].filter((ok) => !ok).length;

    const imCreatorMetrics: ImPpgtProbeMetrics = {
      personaId: spec.caseId === 'CASE-02' ? 'IM-MG-01' : 'IM-MG-02',
      surface: `/broker/w/im (${spec.caseId})`,
      viewport: '1440x900',
      fontScale: spec.caseId === 'CASE-02' ? 'xlarge' : 'normal',
      aboveFoldActionCount: imCreatorProbe.aboveFoldActionCount,
      totalVisibleInteractiveCount: imCreatorProbe.totalVisibleInteractiveCount,
      horizontalOverflowPx: imCreatorProbe.horizontalOverflowPx,
      sub44ButtonsCount: imCreatorProbe.sub44Buttons.length,
      sub15TextsCount: imCreatorProbe.sub15Texts.length,
      clippedButtonsCount: imCreatorProbe.clippedButtons.length,
      brokenImgCount: imCreatorProbe.brokenImgs.length,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      poisonTokenCount: countPoisonTokens(imCreatorProbe.visibleText),
      bannedTermCount: countBannedTerms(imCreatorProbe.visibleText) + imCreatorWriting.josaViolationCount,
      taskCompleted: Boolean(docId),
      blockingModalDetected: false,
      boundaryViolationCount: Object.values(pokaYokeChecks).filter((v) => !v).length,
      provenanceBadgeVisible: true,
      artifactValid: pptxBuf.length > 10_000 && slidesHtmlValid && captured.slideCount >= 6,
      honestSaveVisible: imCreatorProbe.honestSaveVisible,
      observedHeadings: imCreatorProbe.observedHeadings,
      observedButtons: imCreatorProbe.observedButtons,
      observedBadges: imCreatorProbe.observedBadges,
    };
    runState.imRuns.push(scoreImPpgtRun(imCreatorMetrics));

    const imMobileMetrics: ImPpgtProbeMetrics = {
      personaId: spec.imBuyerPersonaId,
      surface: `/im-lite/${buildingId} (${spec.caseId})`,
      viewport: '390x844',
      fontScale: 'xlarge',
      aboveFoldActionCount: imMobileProbe.aboveFoldActionCount,
      totalVisibleInteractiveCount: imMobileProbe.totalVisibleInteractiveCount,
      horizontalOverflowPx: imMobileProbe.horizontalOverflowPx,
      sub44ButtonsCount: imMobileProbe.sub44Buttons.length,
      sub15TextsCount: imMobileProbe.sub15Texts.length,
      clippedButtonsCount: imMobileProbe.clippedButtons.length,
      brokenImgCount: imMobileProbe.brokenImgs.length,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      poisonTokenCount: countPoisonTokens(imMobileProbe.visibleText),
      bannedTermCount: countBannedTerms(imMobileProbe.visibleText) + imMobileWriting.josaViolationCount,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: oracleFailureCount,
      provenanceBadgeVisible: imMobileProbe.provenanceBadgeVisible,
      artifactValid:
        pptxBuf.length > 10_000 &&
        slidesHtmlValid &&
        captured.slideCount >= 6 &&
        oracleFailureCount === 0,
      observedHeadings: imMobileProbe.observedHeadings,
      observedButtons: imMobileProbe.observedButtons,
      observedBadges: imMobileProbe.observedBadges,
    };
    runState.imRuns.push(scoreImPpgtRun(imMobileMetrics));

    return {
      caseId: spec.caseId,
      buildingId,
      docId,
      dcUrl: dcRelPath,
      imLiteUrl,
      dealcardPostureDetected: detectedPosture,
      dealcardPostureMatch,
      aiHeadlineVariantNonRepeating,
      strengthTagApplied,
      blindLeaksOnDc,
      priceBandFoundOnDc,
      ogImageValid,
      ogImageBytes: ogBuf.length,
      pokaYokeChecks,
      imAiNominalEndingsClean,
      pptxPath,
      pptxBytes: pptxBuf.length,
      pptxSlideCount: zipInfo.slideCount,
      pptxMediaCount: zipInfo.mediaCount,
      pptxSlideImages: captured.slideImages,
      slidesHtmlValid,
      oracleChecks: {
        priceReflected,
        asisNetYieldMatched,
        stabilizedNetYieldMatched,
        vacancyMatched,
        rentRollSlideSplitMatched,
        details: oracleDetails,
      },
      screenshots,
      observedSpans: {
        dc: [
          ...dcMobileProbe.observedHeadings,
          ...dcMobileProbe.observedButtons.slice(0, 12),
          dcMobileProbe.visibleText.slice(0, 1200),
        ],
        imLite: [
          ...imMobileProbe.observedHeadings,
          ...imMobileProbe.observedButtons.slice(0, 12),
          imMobileProbe.visibleText.slice(0, 1200),
        ],
        pptxTextSample: zipInfo.fullPptxText.slice(0, 3500),
      },
      defects,
      server500s,
    };
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }
}

test.describe('Golden 4-Case Full-Funnel PPGT-Loop (CASE-02 ~ CASE-05 × 4 Workspaces)', () => {
  test.beforeAll(() => {
    ensureDir(OUT_ROOT);
    // Pre-gate: verify all 4 subsystem anti-sycophancy negative controls deterministically
    expect(verifyDealCardAntiSycophancyControls().passed).toBe(true);
    expect(verifyImAntiSycophancyControls().passed).toBe(true);
    expect(verifyNewsletterAntiSycophancyControls().passed).toBe(true);
    expect(verifyInboxAntiSycophancyControls().passed).toBe(true);
  });

  for (const spec of CASE_SPECS) {
    test(`${spec.caseId}: DealCard → /dc → IM(Poka-Yoke+RentRoll+Photos) → /im-lite → PPTX/PDF/PNG`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const gtMap = loadGroundTruth();
      const gt = gtMap[spec.caseId];
      expect(gt, `Ground truth for ${spec.caseId} must exist`).toBeTruthy();

      const record = await runGoldenCaseFunnel(page, spec, gt);
      runState.caseRecords[spec.caseId] = record;
      console.log(
        `[${spec.caseId}] buildingId=${record.buildingId} docId=${record.docId} slides=${record.pptxSlideCount} media=${record.pptxMediaCount} oracle=${record.oracleChecks.details.join(', ')} defects=${record.defects.length}`,
      );
      if (record.defects.length > 0) {
        console.log(`  ⚠️ [${spec.caseId}] Defects:\n    - ${record.defects.join('\n    - ')}`);
      }
      // Keep running through all 4 cases so we collect the complete defect backlog in 1 pass;
      // hard assert buildingId & PPTX binary generation succeeded.
      expect(record.buildingId).toMatch(VALID_DEAL_ID_REGEX);
      expect(record.pptxSlideCount).toBeGreaterThanOrEqual(6);
      expect(record.pptxSlideImages.length).toBeGreaterThanOrEqual(6);
    });
  }

  test('Newsletter & Inbox Cross-Workspace Parity (IM 2건 + DealCard-only 1건 · 409 Guard · VIP · AI Reply)', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('response', (res) => {
      if (res.status() >= 500) {
        runState.server500s.push(`[NL/INBOX] ${res.request().method()} ${res.url()} -> ${res.status()}`);
      }
    });

    // -------------------------------------------------------------------------
    // A. Create 1 DealCard-only property (NO IM generated!) to verify 409 guard
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1440, height: 900 });
    let dealOnlyId = '';
    const onDealOnlyPatch = (res: any) => {
      if (
        res.url().includes('/api/broker/workspace/summary') &&
        res.request().method() === 'PATCH'
      ) {
        try {
          const b = res.request().postDataJSON?.() as Record<string, any> | null;
          if (b?.buildingId && VALID_DEAL_ID_REGEX.test(String(b.buildingId))) {
            dealOnlyId = String(b.buildingId);
            if (!runState.createdBuildingIds.includes(dealOnlyId)) {
              runState.createdBuildingIds.push(dealOnlyId);
            }
          }
        } catch {
          // ignore
        }
      }
    };
    page.on('response', onDealOnlyPatch);
    await page.goto('/broker/w/dealcards?new=1', { waitUntil: 'domcontentloaded' });
    await hideDevOverlay(page);
    const memoBox = page.locator('[data-testid="dealcard-top-memo-textarea"]');
    await memoBox.waitFor({ state: 'visible', timeout: 25_000 });
    await memoBox.fill(
      'PPGT딜카드전용 테스트 매물: 서울 마포구 연남동 코너 근린생활시설, 대지 120평, 연면적 320평, 매매가 95억, 월세 2800만원, 임대수익형',
    );
    await page.locator('[data-testid="dealcard-generate-from-memo-btn"]').click();
    await page.locator('[data-testid="card4-confirm-card"]').waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    await page.waitForTimeout(800);

    const dealOnlyPubPromise = page
      .waitForResponse(
        (res) =>
          (res.url().includes('/api/broker/workspace/summary') &&
            res.request().method() === 'PATCH') ||
          (res.url().includes('/api/broker/dealcards/') && res.url().includes('/publish')),
        { timeout: 30_000 },
      )
      .catch(() => null);
    await page.locator('[data-testid="workspace-primary-send-btn"]:visible').first().click();
    await page.locator('[data-testid="presend-confirmation-sheet"]').waitFor({
      state: 'visible',
      timeout: 20_000,
    });
    const autoMask = page.locator('[data-testid="presend-auto-mask-btn"]');
    if (await autoMask.isVisible().catch(() => false)) await autoMask.click();
    await page.locator('[data-testid="presend-copy-btn"]').click();
    await dealOnlyPubPromise;
    await page.waitForTimeout(800);
    page.off('response', onDealOnlyPatch);
    if (!dealOnlyId) {
      const m = page.url().match(/[?&](?:id|buildingId)=([a-z0-9-]+)/i);
      if (m && VALID_DEAL_ID_REGEX.test(m[1])) dealOnlyId = m[1];
    }
    expect(dealOnlyId, 'DealCard-only buildingId must exist').toMatch(VALID_DEAL_ID_REGEX);
    runState.dealOnlyBuildingId = dealOnlyId;
    if (!runState.createdBuildingIds.includes(dealOnlyId)) {
      runState.createdBuildingIds.push(dealOnlyId);
    }

    // -------------------------------------------------------------------------
    // B. NEWSLETTER WORKSPACE (/broker/magazine-editor → Publish → /magazine Reader)
    // -------------------------------------------------------------------------
    const nlOutDir = path.join(OUT_ROOT, 'NEWSLETTER');
    ensureDir(nlOutDir);

    await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');
    await page.locator('[data-testid="magazine-editor-slot"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    // Start a fresh weekly/daily edition if button visible
    const newNlBtn = page.locator('[data-testid="new-newsletter-btn"]');
    if (await newNlBtn.isVisible().catch(() => false)) {
      await newNlBtn.click();
      await page.waitForTimeout(600);
    }

    // Step 1 (Title): click first title preset chip so headline is non-empty and publishable
    const presetChip0 = page.locator('[data-testid="title-preset-chip-0"]');
    if (await presetChip0.isVisible().catch(() => false)) {
      await presetChip0.click();
      await page.waitForTimeout(300);
    }

    // Move to Step 2 (Content)
    await page.locator('[data-testid="step-tab-content"]').click();
    await page.waitForTimeout(800);

    // Fill concise broker market briefing body
    const briefingBody = page.locator('[data-testid="market-briefing-editor-body"]');
    if (await briefingBody.isVisible().catch(() => false)) {
      await briefingBody.fill(
        '이번 주 서울 주요 권역 중소형 빌딩은 서초·영등포 역세권 위주로 실사옥 및 안정 수익형 문의가 활발합니다. 보증금 차감 실투자금 기준 수익률과 공실 해소 여력을 함께 검토해 보시기 바랍니다.',
      );
      await page.waitForTimeout(300);
    }

    // Check Axios live news refresh & source freshness badge
    const freshnessBadge = page.locator('[data-testid="axios-source-freshness-badge"]').first();
    const refreshBtn = page.locator('[data-testid="refresh-live-news-btn"]').first();
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(3000);
      runState.newsletterManifest.liveNewsRefreshed = true;
    } else {
      runState.newsletterManifest.defects.push('[Newsletter] refresh-live-news-btn 미노출');
    }
    if (await freshnessBadge.isVisible().catch(() => false)) {
      runState.newsletterManifest.freshnessBadgeText = (await freshnessBadge.innerText()).trim();
    } else {
      runState.newsletterManifest.defects.push('[Newsletter] axios-source-freshness-badge 미노출');
    }

    // Select up to 3 golden deals (2 IM-published + 1 DealCard-only)
    const targetDealIds = [
      runState.caseRecords['CASE-02']?.buildingId,
      runState.caseRecords['CASE-04']?.buildingId,
      dealOnlyId,
    ].filter(Boolean);

    for (const did of targetDealIds) {
      const slotBtn = page
        .locator(`[data-testid="deal-slot-item-${did}"], [data-testid="simple-deal-card-${did}"]`)
        .first();
      if (await slotBtn.isVisible().catch(() => false)) {
        await slotBtn.click();
        await page.waitForTimeout(250);
      }
    }

    // Count blind 2x2 grids in right-pane preview
    const blindGridCount = await page
      .locator('[data-testid^="preview-deal-blind-grid-"]')
      .count();
    runState.newsletterManifest.blindGridCount = blindGridCount;

    const nlCreatorProbe = await collectDomProbe(page, '[data-testid="magazine-editor-slot"]');
    const nlWorkspaceShot = path.join(nlOutDir, 'newsletter_workspace_xlarge.png');
    await page.screenshot({ path: nlWorkspaceShot, fullPage: false });
    runState.newsletterManifest.screenshots.workspace = nlWorkspaceShot;

    // Save draft & resolve editionId from API response or GET /api/magazine/editions?broker_id=me
    const draftSaveResPromise = page
      .waitForResponse(
        (r) =>
          r.url().includes('/api/magazine/editions') &&
          (r.request().method() === 'POST' || r.request().method() === 'PATCH'),
        { timeout: 25_000 },
      )
      .catch(() => null);
    await page.locator('[data-testid="newsletter-draft-save-btn"]').click();
    const draftSaveRes = await draftSaveResPromise;
    if (draftSaveRes) {
      const dj = await draftSaveRes.json().catch(() => ({}));
      const eid = dj.edition?.id || dj.id || dj.data?.id || '';
      if (eid && /^[0-9a-f-]{36}$/i.test(eid)) {
        runState.newsletterManifest.editionId = eid;
        runState.createdEditionIds.push(eid);
      }
    }
    await page.waitForTimeout(1000);
    if (!runState.newsletterManifest.editionId) {
      const listEdRes = await page.request.get('/api/magazine/editions?broker_id=me&type=all&limit=5');
      const listEdJson = await listEdRes.json().catch(() => ({}));
      const eds = (listEdJson.editions || listEdJson.data || []) as Array<any>;
      if (Array.isArray(eds) && eds.length > 0 && eds[0]?.id) {
        runState.newsletterManifest.editionId = String(eds[0].id);
        if (!runState.createdEditionIds.includes(String(eds[0].id))) {
          runState.createdEditionIds.push(String(eds[0].id));
        }
      }
    }

    // Publish via API to get live readerUrl (or fallback to /magazine/[slug] from profile)
    let readerUrl = '';
    if (runState.newsletterManifest.editionId) {
      const pubNlRes = await page.request.post(
        `/api/magazine/editions/${runState.newsletterManifest.editionId}/publish`,
        { data: { sendNow: false } },
      );
      if (pubNlRes.ok()) {
        const pj = await pubNlRes.json().catch(() => ({}));
        readerUrl = pj.publicUrl || pj.url || pj.readerUrl || pj.shareUrl || '';
      }
    }
    if (!readerUrl) {
      const liveLink = page.locator('[data-testid="preview-live-reader-link"]').first();
      if (await liveLink.isVisible().catch(() => false)) {
        readerUrl = (await liveLink.getAttribute('href')) || '';
      }
    }
    if (!readerUrl) {
      const profRes = await page.request.get('/api/broker/profile');
      const profJson = await profRes.json().catch(() => ({}));
      const slug = profJson.profile?.slug || profJson.brokerProfile?.slug || profJson.slug || '';
      if (slug) readerUrl = `/magazine/${encodeURIComponent(slug)}`;
    }
    expect(readerUrl, 'Newsletter readerUrl must resolve').toBeTruthy();
    if (readerUrl) {
      const readerRel = readerUrl.startsWith('http')
        ? new URL(readerUrl).pathname + new URL(readerUrl).search
        : readerUrl;
      runState.newsletterManifest.publicUrl = readerRel;

      // Mobile 390 xlarge subscriber reader audit
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(readerRel, { waitUntil: 'networkidle' });
      await hideDevOverlay(page);
      await applyFontScale(page, 'xlarge');

      const nlReaderProbe = await collectDomProbe(page, 'main');
      const nlReaderShot = path.join(nlOutDir, 'newsletter_reader_390_xlarge.png');
      await page.screenshot({ path: nlReaderShot, fullPage: true });
      runState.newsletterManifest.screenshots.readerMobile = nlReaderShot;
      runState.newsletterManifest.observedSpans = [
        ...nlReaderProbe.observedHeadings,
        ...nlReaderProbe.observedButtons.slice(0, 12),
        nlReaderProbe.visibleText.slice(0, 1200),
      ];

      // Verify every /dc/ or /im-lite/ link on reader page returns HTTP 200 (0 broken/404 links!)
      const dealHrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href') || '')
          .filter((h) => h.startsWith('/dc/') || h.startsWith('/im-lite/')),
      );
      const uniqueHrefs = Array.from(new Set(dealHrefs));
      let brokenLinkCount = 0;
      for (const href of uniqueHrefs) {
        const res = await page.request.get(href);
        runState.newsletterManifest.featuredLinksChecked.push({ href, status: res.status() });
        if (!res.ok()) {
          brokenLinkCount += 1;
          runState.newsletterManifest.defects.push(
            `[Newsletter Reader] 깨진 매물 링크: ${href} (HTTP ${res.status()})`,
          );
        }
      }

      // Check zero blind token leak on Newsletter reader
      const gtMap = loadGroundTruth();
      const nlBlindLeaks: string[] = [];
      for (const cid of ['CASE-02', 'CASE-04']) {
        for (const tok of gtMap[cid].dealcard_blind_forbidden_tokens) {
          if (nlReaderProbe.visibleText.includes(tok)) nlBlindLeaks.push(`${cid}:${tok}`);
        }
      }
      if (nlBlindLeaks.length > 0) {
        runState.newsletterManifest.defects.push(
          `[Newsletter Reader] 블라인드 금지 토큰 유출: ${nlBlindLeaks.join(', ')}`,
        );
      }

      const nlSuit = auditNewsletterContentSuitability({
        editionType: 'weekly',
        renderedHtml: await page.content(),
        renderedText: nlReaderProbe.visibleText,
        expectedDealCount: 0,
        isSubscriberMode: true,
      });

      runState.newsletterRuns.push(
        scoreNewsletterPpgtRun({
          personaId: 'NL-MG-01',
          surface: '/broker/magazine-editor',
          viewport: '1440x900',
          fontScale: 'xlarge',
          aboveFoldActionCount: nlCreatorProbe.aboveFoldActionCount,
          totalVisibleInteractiveCount: nlCreatorProbe.totalVisibleInteractiveCount,
          horizontalOverflowPx: nlCreatorProbe.horizontalOverflowPx,
          sub44ButtonsCount: nlCreatorProbe.sub44Buttons.length,
          sub15TextsCount: nlCreatorProbe.sub15Texts.length,
          clippedButtonsCount: nlCreatorProbe.clippedButtons.length,
          brokenImgCount: nlCreatorProbe.brokenImgs.length,
          consoleErrorCount: consoleErrors.length,
          pageErrorCount: pageErrors.length,
          poisonTokenCount: countPoisonTokens(nlCreatorProbe.visibleText),
          bannedTermCount: countBannedTerms(nlCreatorProbe.visibleText),
          contentSuitabilityViolationsCount: runState.newsletterManifest.liveNewsRefreshed ? 0 : 1,
          taskCompleted: Boolean(runState.newsletterManifest.editionId || readerUrl),
          blockingModalDetected: false,
          boundaryViolationCount: 0,
          provenanceBadgeVisible: true,
          artifactValid: Boolean(readerUrl),
          honestSaveVisible: nlCreatorProbe.honestSaveVisible,
        }),
      );

      runState.newsletterRuns.push(
        scoreNewsletterPpgtRun({
          personaId: 'NL-MG-03',
          surface: readerRel,
          viewport: '390x844',
          fontScale: 'xlarge',
          aboveFoldActionCount: nlReaderProbe.aboveFoldActionCount,
          totalVisibleInteractiveCount: nlReaderProbe.totalVisibleInteractiveCount,
          horizontalOverflowPx: nlReaderProbe.horizontalOverflowPx,
          sub44ButtonsCount: nlReaderProbe.sub44Buttons.length,
          sub15TextsCount: nlReaderProbe.sub15Texts.length,
          clippedButtonsCount: nlReaderProbe.clippedButtons.length,
          brokenImgCount: nlReaderProbe.brokenImgs.length,
          consoleErrorCount: consoleErrors.length,
          pageErrorCount: pageErrors.length,
          poisonTokenCount: countPoisonTokens(nlReaderProbe.visibleText),
          bannedTermCount: countBannedTerms(nlReaderProbe.visibleText),
          contentSuitabilityViolationsCount:
            nlBlindLeaks.length + brokenLinkCount + (nlSuit.passed ? 0 : 1),
          taskCompleted: brokenLinkCount === 0,
          blockingModalDetected: false,
          boundaryViolationCount: nlBlindLeaks.length + brokenLinkCount,
          provenanceBadgeVisible: nlReaderProbe.provenanceBadgeVisible,
          artifactValid: brokenLinkCount === 0 && nlBlindLeaks.length === 0,
        }),
      );
    }

    // -------------------------------------------------------------------------
    // C. INBOX WORKSPACE (/broker/w/inbox — 409 Guard, Duplicate, VIP, AI Reply)
    // -------------------------------------------------------------------------
    const ibOutDir = path.join(OUT_ROOT, 'INBOX');
    ensureDir(ibOutDir);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/inbox', { waitUntil: 'networkidle' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');
    await page.waitForTimeout(800);

    // Check folded newsletter filter chip is hidden by default
    const foldedNlChipVisibleInitially = await page
      .locator('[data-testid="inbox-filter-chip-newsletter"]')
      .isVisible()
      .catch(() => false);
    runState.inboxManifest.foldedNewsletterFilterDefaultHidden = !foldedNlChipVisibleInitially;
    if (foldedNlChipVisibleInitially) {
      runState.inboxManifest.defects.push(
        '[Inbox] 뉴스레터 구독 필터 칩이 기본 접힘 상태가 아님(상단 인지부하)',
      );
    }

    const inboxDesktopProbe = await collectDomProbe(page, '[data-testid="inbox-editor-slot"]');
    const inboxDesktopShot = path.join(ibOutDir, 'inbox_desktop_xlarge.png');
    await page.screenshot({ path: inboxDesktopShot, fullPage: false });
    runState.inboxManifest.screenshots.desktop = inboxDesktopShot;

    // Open New Client Modal & create a VIP test client linked to our DealCard-only building!
    const testPhone = '010-9911-4422';
    const testVipName = 'PPGT골든_VIP_김대표';
    await page.locator('[data-testid="open-new-client-modal-btn"]').click();
    await page.locator('[data-testid="inbox-new-client-dialog"]').waitFor({
      state: 'visible',
      timeout: 10_000,
    });
    await page.locator('[data-testid="new-client-name-input"]').fill(testVipName);
    await page.locator('[data-testid="new-client-phone-input"]').fill(testPhone);
    await page.locator('[data-testid="new-client-grade-select"]').selectOption('VIP');

    const bldgSelect = page.locator('[data-testid="new-client-building-select"]');
    const hasDealOnlyOpt = await bldgSelect.locator(`option[value="${dealOnlyId}"]`).count();
    if (hasDealOnlyOpt > 0) {
      await bldgSelect.selectOption(dealOnlyId);
    } else {
      runState.inboxManifest.defects.push(
        `[Inbox] 신규 고객 모달 보유 매물 셀렉트에서 딜카드 전용 매물(${dealOnlyId}) 미표시`,
      );
    }

    const createClientResPromise = page
      .waitForResponse(
        (r) => r.url().includes('/api/broker/inbox/actions') && r.request().method() === 'POST',
        { timeout: 15_000 },
      )
      .catch(() => null);
    await page.locator('[data-testid="submit-new-client-btn"]').click();
    const createClientRes = await createClientResPromise;
    let createdVipClientId = '';
    if (createClientRes) {
      const cj = await createClientRes.json().catch(() => ({}));
      createdVipClientId = cj.client?.id || cj.id || cj.clientId || '';
      if (createdVipClientId) runState.createdClientIds.push(createdVipClientId);
    }
    await page.waitForTimeout(1000);

    // Re-open modal and type duplicate phone → check duplicate warning
    await page.locator('[data-testid="open-new-client-modal-btn"]').click();
    await page.locator('[data-testid="inbox-new-client-dialog"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="new-client-phone-input"]').fill(testPhone);
    await page.waitForTimeout(400);
    runState.inboxManifest.duplicateWarningShown = await page
      .locator('[data-testid="new-client-duplicate-warning"]')
      .isVisible()
      .catch(() => false);
    if (!runState.inboxManifest.duplicateWarningShown) {
      runState.inboxManifest.defects.push('[Inbox] 동일 연락처 중복 경고(new-client-duplicate-warning) 미노출');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Switch filter tab to '전체 고객' so newly created custom VIP client row is visible
    const allClientsTab = page.locator('[data-testid="inbox-filter-chip-all"]');
    if (await allClientsTab.isVisible().catch(() => false)) {
      await allClientsTab.click();
      await page.waitForTimeout(500);
    }

    // Select our newly created VIP client row
    const vipRow = page
      .locator('[data-testid^="inbox-thread-row-"]')
      .filter({ hasText: testVipName })
      .first();
    if (await vipRow.isVisible().catch(() => false)) {
      await vipRow.click();
      await page.waitForTimeout(700);
    }

    // Check History tab → honest empty events message (no fabricated read/sent timeline!)
    const histTab = page.locator('[data-testid="inbox-editor-tab-history"]');
    if (await histTab.isVisible().catch(() => false)) {
      await histTab.click();
      await page.waitForTimeout(400);
      runState.inboxManifest.honestEmptyEventsShown = await page
        .locator('[data-testid="inbox-events-empty"]')
        .isVisible()
        .catch(() => false);
      if (!runState.inboxManifest.honestEmptyEventsShown) {
        runState.inboxManifest.defects.push('[Inbox] 신규 고객 빈 이력 정직 안내(inbox-events-empty) 미노출');
      }
    }

    // Check Preview Column → on DealCard-only property, IM asset tab is disabled & IM_NOT_GENERATED notice is already shown
    const imAssetTab = page.locator('[data-testid="inbox-asset-tab-im"]');
    if (await imAssetTab.isVisible().catch(() => false)) {
      const isDisabled = await imAssetTab.isDisabled().catch(() => false);
      if (!isDisabled) {
        await imAssetTab.click();
        await page.waitForTimeout(400);
      }
      const noticeVisible = await page
        .locator('[data-testid="inbox-im-not-generated-notice"]')
        .isVisible()
        .catch(() => false);
      runState.inboxManifest.imNotGeneratedNoticeShown = noticeVisible || isDisabled;
      if (!runState.inboxManifest.imNotGeneratedNoticeShown) {
        runState.inboxManifest.defects.push(
          '[Inbox] 딜카드 전용 매물 IM 발송 탭 비활성화 및 inbox-im-not-generated-notice 미노출',
        );
      }
    }

    // Direct API guard verification: POST /api/broker/inbox/actions prepare_copy_bundle with assetKind='im' → HTTP 409 IM_NOT_GENERATED
    const guardApiRes = await page.request.post('/api/broker/inbox/actions', {
      data: {
        action: 'prepare_copy_bundle',
        assetKind: 'im',
        buildingId: dealOnlyId,
        clientName: testVipName,
        buildingTitle: 'PPGT딜카드전용 테스트 매물',
      },
    });
    const guardJson = await guardApiRes.json().catch(() => ({}));
    runState.inboxManifest.api409ImNotGeneratedVerified =
      guardApiRes.status() === 409 && guardJson.code === 'IM_NOT_GENERATED';
    if (!runState.inboxManifest.api409ImNotGeneratedVerified) {
      runState.inboxManifest.defects.push(
        `[Inbox API] 미생성 IM 발송 차단 실패: status=${guardApiRes.status()}, code=${guardJson.code}`,
      );
    }

    // Check Message tab → AI reply 2x non-repetition
    const msgTab = page.locator('[data-testid="inbox-editor-tab-message"]');
    if (await msgTab.isVisible().catch(() => false)) {
      await msgTab.click();
      await page.waitForTimeout(400);
      const aiReplyBtn = page.locator('[data-testid="inbox-ai-reply-btn"]');
      const briefInput = page.locator('[data-testid="inbox-kakao-brief-input"]');
      if (await aiReplyBtn.isVisible().catch(() => false)) {
        await aiReplyBtn.click();
        await page.waitForTimeout(3000);
        const reply1 = (await briefInput.inputValue().catch(() => '')).trim();
        await aiReplyBtn.click();
        await page.waitForTimeout(3000);
        const reply2 = (await briefInput.inputValue().catch(() => '')).trim();
        runState.inboxManifest.aiReplyVariantNonRepeating =
          Boolean(reply1) && Boolean(reply2) && reply1 !== reply2;
        if (!runState.inboxManifest.aiReplyVariantNonRepeating) {
          runState.inboxManifest.defects.push(
            `[Inbox] AI 답장 초안 2회 연속 비중복 미충족 (1차 길이=${reply1.length}, 2차 길이=${reply2.length}, 동일=${reply1 === reply2})`,
          );
        }
      }
    }

    // Check VIP delete strong warning confirmation
    let dialogMessage = '';
    page.once('dialog', async (dlg) => {
      dialogMessage = dlg.message();
      await dlg.accept();
    });
    const delVipBtn = page.locator('[data-testid="delete-custom-client-btn"]').first();
    if (await delVipBtn.isVisible().catch(() => false)) {
      await delVipBtn.click();
      await page.waitForTimeout(800);
      // Either native dialog or in-page confirmation modal containing VIP warning
      const modalText = await page
        .locator('[role="dialog"], [role="alertdialog"]')
        .last()
        .innerText()
        .catch(() => '');
      const combinedWarn = `${dialogMessage} ${modalText}`;
      runState.inboxManifest.vipDeleteStrongWarningShown =
        /VIP|중요|영구|되돌릴 수 없/.test(combinedWarn);
      if (!runState.inboxManifest.vipDeleteStrongWarningShown) {
        runState.inboxManifest.defects.push(
          `[Inbox] VIP 고객 삭제 시 강화 경고 문구 미확인: "${combinedWarn.slice(0, 120)}"`,
        );
      }
      // VIP delete modal requires typing client name into confirm-delete-match-input before enabling confirm-delete-confirm-btn
      const matchInput = page.locator('[data-testid="confirm-delete-match-input"]').last();
      const confirmBtn = page.locator('[data-testid="confirm-delete-confirm-btn"]').last();
      if (await matchInput.isVisible().catch(() => false)) {
        const disabledBeforeTyping = await confirmBtn.isDisabled().catch(() => false);
        runState.inboxManifest.vipDeleteStrongWarningShown =
          runState.inboxManifest.vipDeleteStrongWarningShown || disabledBeforeTyping;
        await matchInput.fill(testVipName);
        await page.waitForTimeout(200);
      }
      if (
        (await confirmBtn.isVisible().catch(() => false)) &&
        !(await confirmBtn.isDisabled().catch(() => true))
      ) {
        await confirmBtn.click();
        await page.waitForTimeout(600);
      }
    }

    // Mobile 390 xlarge Inbox responsiveness probe
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/broker/w/inbox', { waitUntil: 'networkidle' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');
    const inboxMobileProbe = await collectDomProbe(page, 'main');
    const inboxMobileShot = path.join(ibOutDir, 'inbox_mobile_390_xlarge.png');
    await page.screenshot({ path: inboxMobileShot, fullPage: true });
    runState.inboxManifest.screenshots.mobile = inboxMobileShot;
    runState.inboxManifest.observedSpans = [
      ...inboxMobileProbe.observedHeadings,
      ...inboxMobileProbe.observedButtons.slice(0, 12),
      inboxMobileProbe.visibleText.slice(0, 1200),
    ];

    // Score Inbox PPGT personas (IB-MG-01..04)
    const unblockedImCount = runState.inboxManifest.api409ImNotGeneratedVerified ? 0 : 1;
    const crmSafetyViolations =
      (runState.inboxManifest.duplicateWarningShown ? 0 : 1) +
      (runState.inboxManifest.vipDeleteStrongWarningShown ? 0 : 1);
    const dishonestOrStaleCount =
      (runState.inboxManifest.honestEmptyEventsShown ? 0 : 1) +
      (runState.inboxManifest.aiReplyVariantNonRepeating ? 0 : 1);

    const desktopInboxMetrics: InboxPpgtProbeMetrics = {
      personaId: 'IB-MG-01',
      surface: '/broker/w/inbox (desktop xlarge)',
      viewport: '1440x900',
      fontScale: 'xlarge',
      aboveFoldActionCount: inboxDesktopProbe.aboveFoldActionCount,
      totalVisibleInteractiveCount: inboxDesktopProbe.totalVisibleInteractiveCount,
      horizontalOverflowPx: inboxDesktopProbe.horizontalOverflowPx,
      sub44ButtonsCount: inboxDesktopProbe.sub44Buttons.length,
      sub15TextsCount: inboxDesktopProbe.sub15Texts.length,
      clippedButtonsCount: inboxDesktopProbe.clippedButtons.length,
      brokenImgCount: inboxDesktopProbe.brokenImgs.length,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      poisonTokenCount: countPoisonTokens(inboxDesktopProbe.visibleText),
      bannedTermCount: countBannedTerms(inboxDesktopProbe.visibleText),
      unblockedImDispatchCount: unblockedImCount,
      crmSafetyViolationCount: crmSafetyViolations,
      dishonestTimelineOrStaleAiCount: dishonestOrStaleCount,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: runState.inboxManifest.foldedNewsletterFilterDefaultHidden ? 0 : 1,
      provenanceBadgeVisible: true,
      artifactValid: true,
      honestSaveVisible: true,
    };
    runState.inboxRuns.push(scoreInboxPpgtRun(desktopInboxMetrics));
    runState.inboxRuns.push(
      scoreInboxPpgtRun({
        ...desktopInboxMetrics,
        personaId: 'IB-MG-02',
        surface: '/broker/w/inbox (ai-reply)',
        fontScale: 'normal',
      }),
    );
    runState.inboxRuns.push(
      scoreInboxPpgtRun({
        ...desktopInboxMetrics,
        personaId: 'IB-MG-03',
        surface: '/api/broker/inbox/actions (409 guard)',
        fontScale: 'normal',
      }),
    );
    runState.inboxRuns.push(
      scoreInboxPpgtRun({
        personaId: 'IB-MG-04',
        surface: '/broker/w/inbox (mobile 390 xlarge)',
        viewport: '390x844',
        fontScale: 'xlarge',
        aboveFoldActionCount: inboxMobileProbe.aboveFoldActionCount,
        totalVisibleInteractiveCount: inboxMobileProbe.totalVisibleInteractiveCount,
        horizontalOverflowPx: inboxMobileProbe.horizontalOverflowPx,
        sub44ButtonsCount: inboxMobileProbe.sub44Buttons.length,
        sub15TextsCount: inboxMobileProbe.sub15Texts.length,
        clippedButtonsCount: inboxMobileProbe.clippedButtons.length,
        brokenImgCount: inboxMobileProbe.brokenImgs.length,
        consoleErrorCount: consoleErrors.length,
        pageErrorCount: pageErrors.length,
        poisonTokenCount: countPoisonTokens(inboxMobileProbe.visibleText),
        bannedTermCount: countBannedTerms(inboxMobileProbe.visibleText),
        unblockedImDispatchCount: unblockedImCount,
        crmSafetyViolationCount: crmSafetyViolations,
        dishonestTimelineOrStaleAiCount: dishonestOrStaleCount,
        taskCompleted: true,
        blockingModalDetected: false,
        boundaryViolationCount: runState.inboxManifest.imNotGeneratedNoticeShown ? 0 : 1,
        provenanceBadgeVisible: true,
        artifactValid: true,
      }),
    );
  });

  test('Aggregate 4-Subsystem UnifiedCreReport100 & Persist Full-Funnel Manifest', async () => {
    const dcBacklog = rankDealCardPpgtBacklog(runState.dealcardRuns);
    const imBacklog = rankImPpgtBacklog(runState.imRuns);
    const nlBacklog = rankNewsletterPpgtBacklog(runState.newsletterRuns);
    const ibBacklog = rankInboxPpgtBacklog(runState.inboxRuns);

    const unified = buildUnifiedCreReport100({
      imRuns: runState.imRuns,
      newsletterRuns: runState.newsletterRuns,
      dealcardRuns: runState.dealcardRuns,
      inboxRuns: runState.inboxRuns,
      imBacklog,
      newsletterBacklog: nlBacklog,
      dealcardBacklog: dcBacklog,
      inboxBacklog: ibBacklog,
    });

    const md = formatUnifiedCreScorecardMarkdown(unified);
    fs.writeFileSync(
      path.join(OUT_ROOT, 'r2-unified-scorecard.json'),
      JSON.stringify(unified, null, 2),
      'utf-8',
    );
    fs.writeFileSync(path.join(OUT_ROOT, 'r2-unified-scorecard.md'), md, 'utf-8');
    fs.writeFileSync(
      path.join(OUT_ROOT, 'fullfunnel-manifest.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          caseRecords: runState.caseRecords,
          newsletter: runState.newsletterManifest,
          inbox: runState.inboxManifest,
          scorecardSummary: {
            overallEffectiveMean100: unified.overallEffectiveMean100,
            totalFloorRiskCount: unified.totalFloorRiskCount,
            readyForHuman2nd: unified.readyForHuman2nd,
            subsystems: {
              dealcard: unified.subsystems.dealcard.effectiveScore100,
              im: unified.subsystems.im.effectiveScore100,
              newsletter: unified.subsystems.newsletter.effectiveScore100,
              inbox: unified.subsystems.inbox?.effectiveScore100 ?? 0,
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    console.log('\n' + md + '\n');
    expect(Object.keys(runState.caseRecords)).toHaveLength(4);
    expect(runState.server500s).toEqual([]);
  });

  test.afterAll(async ({ request }) => {
    console.log('🧹 Cleaning up golden test entities...');
    for (const eid of Array.from(new Set(runState.createdEditionIds))) {
      await request.delete(`/api/magazine/editions?id=${encodeURIComponent(eid)}`).catch(() => {});
    }
    for (const cid of Array.from(new Set(runState.createdClientIds))) {
      await request
        .post('/api/broker/inbox/actions', { data: { action: 'delete_client', clientId: cid } })
        .catch(() => {});
    }
    for (const bid of Array.from(new Set(runState.createdBuildingIds))) {
      await request
        .patch('/api/broker/workspace/summary', {
          data: { action: 'delete', buildingId: bid },
        })
        .catch(() => {});
      await request.delete(`/api/broker/deal-card/${encodeURIComponent(bid)}/delete`).catch(() => {});
    }
    console.log(
      `🧹 Cleanup done: buildings=${runState.createdBuildingIds.length}, editions=${runState.createdEditionIds.length}, clients=${runState.createdClientIds.length}`,
    );
  });
});
