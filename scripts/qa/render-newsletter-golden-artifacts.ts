/**
 * @file scripts/qa/render-newsletter-golden-artifacts.ts
 * @description Layer B · 뉴스레터 3대 골든 호수(NL-G1 월간, NL-G3 일간 무매물, NL-G4 호외 세무)의
 *              이메일 HTML(3종), 1200×630 OG PNG(3종), 및 Editorial R3 텍스트 코퍼스(golden-3issues-corpus.json)를
 *              LLM 호출 0회로 e2e/golden-snapshots/out/newsletter-ppgt/ 에 오프라인 생성한다.
 *
 * Usage: npx tsx --env-file=.env.local scripts/qa/render-newsletter-golden-artifacts.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import { renderMagazineEmail } from '../../src/domain/magazine/email-template';
import { renderMagazineKakaoText } from '../../src/domain/magazine/templates/kakao-text';
import { buildDefaultMonthlyGraphicPair } from '../../src/domain/magazine/monthly-stats-hydration';
import { buildImageModel, type BrokerImageInfo } from '../../src/lib/magazine/og-image-data';
import { renderMagazineImage } from '../../src/lib/magazine/og-image-response';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'e2e', 'golden-snapshots', 'out', 'newsletter-ppgt');

const BROKER = {
  id: 'hanseong-cre',
  name: '박준영',
  company: '한성빌딩부동산중개법인',
  officeAddress: '서울특별시 강남구 테헤란로 318',
  phone: '010-3482-9104',
  officeRegNumber: '11680-2025-04719',
  representativeName: '박준영',
};

const BROKER_IMAGE_INFO: BrokerImageInfo = {
  name: BROKER.name,
  display_name: BROKER.name,
  company: BROKER.company,
  phone: BROKER.phone,
  specialty_regions: ['강남구', '서초구', '성동구'],
};

const GOLDEN_ISSUES = [
  {
    id: 'iss-1',
    title: '테헤란로 이면 꼬마빌딩 매매 호가 안정세 전환',
    brief: '급매 소진 후 우량 근생 위주 실수요 문의가 꾸준히 유입되고 있습니다.',
    source: '한국경제 부동산',
    channel: 'real_estate',
  },
  {
    id: 'iss-2',
    title: '기준금리 동결 기조 속 시중은행 담보대출 금리 완만 하락',
    brief: '조달 금리 안정으로 보수적 레버리지 매수 검토가 재개되는 흐름입니다.',
    source: '매일경제 금융',
    channel: 'economy_finance',
  },
  {
    id: 'iss-3',
    title: '꼬마빌딩 가족법인·증여 승계 시 감정평가 활용 상담 증가',
    brief: '취득세와 양도세 부담을 비교해 보유 구조를 점검하는 건물주가 늘고 있습니다.',
    source: '세무·자산 저널',
    channel: 'tax_wealth',
  },
  {
    id: 'iss-4',
    title: '성수·한남 1층 리테일 체험형 플래그십 장기 임차 강세',
    brief: '층고와 전면 노출을 갖춘 단독 건물의 브랜드 임대 선호가 이어지고 있습니다.',
    source: '리테일 트렌드',
    channel: 'commercial_trend',
  },
  {
    id: 'iss-5',
    title: '노후 근생 벽돌 리모델링으로 공실 해소 및 임차 수준 상향',
    brief: '과도한 신축 대신 외관과 출입구 동선만 손봐도 건물 경쟁력이 높아집니다.',
    source: '건축·디자인 저널',
    channel: 'culture_lifestyle',
  },
];

const MONTHLY_DEALS = [
  {
    title: '역삼역 도보 4분 올근생 코너 빌딩',
    address: '서울특별시 강남구 역삼동 736-1',
    price: 14_500_000_000,
    comment: '병의원·카페 장기 임차로 공실 위험이 낮으며 안정적인 임대수익률(Cap Rate) 확보가 가능한 핵심 코너 자산입니다.',
  },
  {
    title: '서초교대역 이면 사옥형 근생 빌딩',
    address: '서울특별시 서초구 서초동 1672-9',
    price: 18_200_000_000,
    comment: '전 층 명도 협의가 가능해 법인 사옥 이전 수요 및 장기 자산 보존 목적에 적합합니다.',
  },
];

interface GoldenArtifactSpec {
  id: string;
  cadence: 'monthly' | 'daily' | 'special';
  emailFile: string;
  ogFile: string;
  title: string;
  briefing: string;
  marketTemp: '선별 매수' | '관망';
  keywords: string[];
  deals: typeof MONTHLY_DEALS;
  keyStats: Array<{ label: string; value: string; accent: string }>;
  taxClinic: {
    title: string;
    scenario: string;
    conclusion: string;
  } | null;
}

const SPECS: readonly GoldenArtifactSpec[] = [
  {
    id: 'NL-G1',
    cadence: 'monthly',
    emailFile: 'email-nl-g1-monthly.html',
    ogFile: 'og-nl-g1-monthly.png',
    title: '11월 강남·서초 중소형 빌딩 월간 자산관리 리포트',
    briefing:
      '강남·서초 핵심 상권은 우량 임차인을 확보한 근생 빌딩 위주로 실수요 문의가 이어지고 있습니다.\n보수적 대출 조건에서도 임대수익률(Cap Rate)과 순영업소득(NOI)이 안정적인 자산이 선별 거래되는 흐름입니다.',
    marketTemp: '선별 매수',
    keywords: ['강남·서초', '실거래 추이', '우량 근생'],
    deals: MONTHLY_DEALS,
    keyStats: [
      { label: '강남·서초 평균 Cap Rate', value: '4.4%', accent: 'indigo' },
      { label: '중소형 담보대출 금리', value: '4.3%', accent: 'emerald' },
    ],
    taxClinic: null,
  },
  {
    id: 'NL-G3',
    cadence: 'daily',
    emailFile: 'email-nl-g3-daily.html',
    ogFile: 'og-nl-g3-daily.png',
    title: '오늘의 강남권 상업용 부동산 일간 핵심 요약',
    briefing:
      '한은 기준금리 동결 이후 주요 역세권 근생 빌딩의 매수 상담이 점진적으로 회복되는 분위기입니다.\n무리한 레버리지보다 임차 안정성과 공실 리스크를 우선 점검하는 흐름이 뚜렷합니다.',
    marketTemp: '관망',
    keywords: ['일간 브리핑', '기준금리', '임차 안정성'],
    deals: [],
    keyStats: [],
    taxClinic: null,
  },
  {
    id: 'NL-G4',
    cadence: 'special',
    emailFile: 'email-nl-g4-special.html',
    ogFile: 'og-nl-g4-special.png',
    title: '2026년 꼬마빌딩 증여·가족법인 세무 전략 호외 특집',
    briefing:
      '2026년 기준 꼬마빌딩 승계 시 일반 증여와 부담부증여, 가족법인 활용 간 세 부담 차이가 큽니다.\n보유 기간과 대출 잔액에 따라 양도세·증여세 합산 구조를 먼저 점검해 보시기 바랍니다.',
    marketTemp: '관망',
    keywords: ['호외 특집', '빌딩 증여', '2026 세법'],
    deals: [],
    keyStats: [],
    taxClinic: {
      title: '2026 상업용 빌딩 승계 세무 체크',
      scenario: '시가 80억 원 근생 빌딩 자녀 승계 시 일반 증여 vs 부담부증여 비교',
      conclusion:
        '담보대출 승계분에 대한 양도소득세율과 증여세 누진 구간을 함께 계산해야 유리합니다. 본 안내는 일반 참고용이며 최종 세무 신고 전 담당 세무사 검토가 필요합니다.',
    },
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const monthlyCharts = buildDefaultMonthlyGraphicPair('gbd', 'molit_bok');
  const corpus: Record<string, unknown>[] = [];

  for (const spec of SPECS) {
    const emailInput = {
      brokerName: BROKER.name,
      officeName: BROKER.company,
      brokerContact: BROKER.phone,
      senderAddress: BROKER.officeAddress,
      officeRegNumber: BROKER.officeRegNumber,
      representativeName: BROKER.representativeName,
      subscriberName: '김건물주',
      edition: {
        cadence: spec.cadence,
        title: spec.title,
        headline: spec.briefing,
        marketTemp: spec.marketTemp,
        date: '2026-11-19',
        url: `https://credeal.kr/magazine/${BROKER.id}/2026-11-19`,
        deals: spec.deals.map((d) => ({ title: d.title, address: d.address, price: d.price })),
        topNews: GOLDEN_ISSUES.map((n) => ({ title: n.title, source: n.source })),
        taxClinic: spec.taxClinic,
      },
      unsubscribeUrl: `https://credeal.kr/unsubscribe?t=${spec.id.toLowerCase()}`,
      isAd: true as const,
    };

    const emailRendered = renderMagazineEmail(emailInput);
    const kakaoRendered = renderMagazineKakaoText(emailInput);

    const emailOutPath = path.join(OUT_DIR, spec.emailFile);
    fs.writeFileSync(emailOutPath, emailRendered.html, 'utf8');

    const ogModel = buildImageModel(
      {
        headline: spec.title,
        briefing: spec.briefing,
        market_temp: spec.marketTemp,
        cover_keywords: spec.keywords,
        keyStats: spec.keyStats,
        featured_deals: spec.deals,
        monthlyCharts: spec.cadence === 'monthly' ? monthlyCharts : [],
      },
      BROKER_IMAGE_INFO,
      '2026-11-19',
    );
    if (!ogModel) {
      throw new Error(`[render-newsletter-golden-artifacts] buildImageModel returned null for ${spec.id}`);
    }

    const ogResponse = await renderMagazineImage({
      format: 'og',
      brokerId: BROKER.id,
      date: '2026-11-19',
      loadModel: async () => ogModel,
    });
    const pngBuf = Buffer.from(await ogResponse.arrayBuffer());
    const meta = await sharp(pngBuf).metadata();
    if (meta.format !== 'png' || meta.width !== 1200 || meta.height !== 630) {
      throw new Error(
        `[render-newsletter-golden-artifacts] Invalid OG PNG for ${spec.id}: ${JSON.stringify(meta)}`,
      );
    }

    const ogOutPath = path.join(OUT_DIR, spec.ogFile);
    fs.writeFileSync(ogOutPath, pngBuf);

    corpus.push({
      goldenId: spec.id,
      cadence: spec.cadence,
      headline: spec.title,
      briefing: spec.briefing,
      marketTemp: spec.marketTemp,
      hasDeals: spec.deals.length > 0,
      hasVerifiedLedgerBadge: spec.deals.length > 0 || spec.cadence === 'monthly',
      issues: GOLDEN_ISSUES,
      deals: spec.deals.map((d) => ({
        title: d.title,
        maskedAddress: d.address.replace(/\s+\d+(?:-\d+)?$/, ''),
        comment: d.comment,
      })),
      taxClinic: spec.taxClinic,
      emailSubject: emailRendered.subject,
      emailHasAdLabel: emailRendered.hasAdLabel,
      emailHasUnsubscribe: emailRendered.hasUnsubscribeLink,
      emailText: emailRendered.text,
      kakaoText: kakaoRendered.text,
      ogImageFile: spec.ogFile,
      ogDimensions: `${meta.width}x${meta.height}`,
      emailHtmlFile: spec.emailFile,
    });

    console.log(
      `[OK] ${spec.id}: ${spec.emailFile} (${emailRendered.html.length}B), ${spec.ogFile} (${meta.width}x${meta.height}, ${pngBuf.length}B)`,
    );
  }

  const corpusPath = path.join(OUT_DIR, 'golden-3issues-corpus.json');
  fs.writeFileSync(corpusPath, JSON.stringify({ generatedAt: new Date().toISOString(), issues: corpus }, null, 2), 'utf8');
  console.log(`[OK] golden-3issues-corpus.json -> ${corpusPath}`);
}

main().catch((err) => {
  console.error('[render-newsletter-golden-artifacts] FAILED:', err);
  process.exit(1);
});
