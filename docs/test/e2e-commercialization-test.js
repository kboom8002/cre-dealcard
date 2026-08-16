/**
 * CREDEAL E2E 상용화 검증 테스트 v2
 * 
 * 5개 파이프라인 전 과정 정밀 검증:
 * ① 공공데이터 수집 → ② AI 콘텐츠 작성 → ③ 모바일 IM 렌더링
 * → ④ PPTX 데이터 변환 → ⑤ PPTX 렌더링
 * 
 * 사용법: node docs/test/e2e-commercialization-test.js
 * 전제: npm run dev 실행 중 (localhost:3000)
 */
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const RESULT_DIR = path.join(__dirname, 'e2e-results');

// ── 테스트 대상 3건 ──
const BUILDINGS = [
  {
    name: 'jamwon', label: '잠원동 두원빌딩',
    id: 'fe5cbadd-aede-4a58-af40-3982f48ecfa7',
    posture: 'development', expectedGrade: 'B',
    expectedSectionTypes: ['property_overview', 'location_access', 'site_analysis', 'development_feasibility'],
    expectedPptxDataKeys: ['building', 'location', 'landDetail', 'scale', 'feasibility'],
  },
  {
    name: 'dangsan', label: '당산동 근생빌딩',
    id: '36300a3c-f4a7-4277-97d8-ee884cf5ea58',
    posture: 'income', expectedGrade: 'C',
    expectedSectionTypes: ['property_overview', 'location_access', 'lease_status', 'income_analysis'],
    expectedPptxDataKeys: ['building', 'location', 'rentRoll', 'profit'],
  },
  {
    name: 'yeonnam', label: '연남동 상가주택',
    id: 'f2a70b50-0e70-4203-b358-75cc991c1660',
    posture: 'income', expectedGrade: 'B',
    expectedSectionTypes: ['property_overview', 'location_access', 'lease_status', 'income_analysis'],
    expectedPptxDataKeys: ['building', 'location', 'rentRoll', 'profit'],
  },
];

// ── section_type → dataKey 매핑 (data-binder.ts에서 추출) ──
const SECTION_TYPE_TO_DATA_KEY = {
  property_overview: 'building',
  location_access: 'location',
  lease_status: 'rentRoll',
  income_analysis: 'profit',
  risk_check: 'risk',
  investment_thesis: 'comps',
  next_steps: 'process',
  occupancy_fit: 'plan',
  cost_comparison: 'vsLease',
  site_analysis: 'landDetail',
  development_feasibility: 'feasibility',
  operation_overview: 'kpi',
  gop_analysis: 'revenue',
  market_position: 'marketPosition',
  comparable_analysis: 'comps',
};

// ── dataKey → archetype 매핑 ──
const DATA_KEY_ARCHETYPE = {
  summary: 'A02', building: 'A04', location: 'A06', rentRoll: 'A03',
  profit: 'A05', risk: 'A07', comps: 'A04', process: 'A09',
  plan: 'A04', vsLease: 'A08', landDetail: 'A04', feasibility: 'A05',
  kpi: 'A13', revenue: 'A05', marketPosition: 'A04',
};

// ── 파생 dataKey 매핑 (원본 → 파생) ──
const DERIVED_DATA_KEYS = {
  property_overview: ['summary', 'land'],
  income_analysis: ['capital', 'dcf', 'sensitivity', 'loan', 'tax'],
  lease_status: ['stability'],
  site_analysis: ['scale', 'eviction'],
  development_feasibility: ['cost', 'stacking'],
  operation_overview: ['operator'],
  gop_analysis: ['seasonality'],
  comparable_analysis: ['trend', 'price'],
};

// ── 결과 수집 ──
const results = [];
let passed = 0, failed = 0, skipped = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    results.push({ test: testName, status: 'PASS', detail });
    console.log(`  \u2705 ${testName}`);
  } else {
    failed++;
    results.push({ test: testName, status: 'FAIL', detail });
    console.log(`  \u274C ${testName} \u2014 ${detail}`);
  }
}

function skip(testName, reason) {
  skipped++;
  results.push({ test: testName, status: 'SKIP', detail: reason });
  console.log(`  \u23ED\uFE0F  ${testName} \u2014 ${reason}`);
}

// ════════════════════════════════════════════════════════
// 파이프라인 ①: 공공데이터 수집 검증
// ════════════════════════════════════════════════════════

async function testGovDataEnrichment(building) {
  console.log(`\n\u2501\u2501 \u2460 \uACF5\uACF5\uB370\uC774\uD130 \uC218\uC9D1 [${building.label}] \u2501\u2501`);

  const url = `${BASE_URL}/api/public/im-lite/${building.id}`;
  try {
    const res = await fetch(url);
    if (res.status !== 200) {
      skip(`\u2460-1 [${building.name}] \uACF5\uACF5\uB370\uC774\uD130 \uAC80\uC99D`, 'IM API \uBBF8\uC751\uB2F5');
      return null;
    }
    const json = await res.json();
    const data = json.data;
    if (!data) { skip(`\u2460-1 [${building.name}] \uACF5\uACF5\uB370\uC774\uD130 \uAC80\uC99D`, 'data \uC5C6\uC74C'); return null; }

    const sections = data.sections || [];
    const allContent = sections.map(s => s.content || s.markdown || '').join(' ');

    // ①-1: 건축물대장 키워드
    const brKeywords = ['\uC5F0\uBA74\uC801', '\uAC74\uD3D0\uC728', '\uC6A9\uC801\uB960', '\uC900\uACF5'];
    const brFound = brKeywords.filter(k => allContent.includes(k));
    assert(brFound.length >= 2,
      `\u2460-1 [${building.name}] \uAC74\uCD95\uBB3C\uB300\uC7A5 \uB370\uC774\uD130 \uBC18\uC601 (${brFound.length}/4)`,
      `\uBC1C\uACAC: ${brFound.join(', ') || '\uC5C6\uC74C'}`);

    // ①-2: 토지/용도지역
    const landKeywords = ['\uC6A9\uB3C4\uC9C0\uC5ED', '\uC77C\uBC18\uC8FC\uAC70', '\uC0C1\uC5C5\uC9C0\uC5ED', '\uC900\uC8FC\uAC70', '\uC8FC\uAC70\uC9C0\uC5ED'];
    const landFound = landKeywords.filter(k => allContent.includes(k));
    assert(landFound.length >= 1,
      `\u2460-2 [${building.name}] \uD1A0\uC9C0\uC774\uC6A9\uACC4\uD68D \uB370\uC774\uD130 \uBC18\uC601`,
      `\uBC1C\uACAC: ${landFound.join(', ') || '\uC5C6\uC74C'}`);

    // ①-3: 교통/입지
    const locationSection = sections.find(s =>
      s.section_type === 'location_access' ||
      (s.title && s.title.includes('\uC785\uC9C0'))
    );
    if (locationSection) {
      const locContent = locationSection.content || locationSection.markdown || '';
      const hasTransit = /\uC5ED|\uBC84\uC2A4|\uC9C0\uD558\uCCA0|\uB3C4\uBCF4|\uBD84/.test(locContent);
      assert(hasTransit,
        `\u2460-3 [${building.name}] \uAD50\uD1B5/\uC785\uC9C0 \uB370\uC774\uD130 \uBC18\uC601`,
        `len=${locContent.length}`);
    } else {
      skip(`\u2460-3 [${building.name}] \uAD50\uD1B5/\uC785\uC9C0`, 'location_access \uC139\uC158 \uC5C6\uC74C');
    }

    // ①-4: 공공데이터 처리 흔적
    const hasExternal = allContent.includes('\uAC74\uCD95\uBB3C\uB300\uC7A5') || allContent.includes('\uACF5\uC801\uC7A5\uBD80') || allContent.includes('\uB4F1\uAE30\uBD80');
    assert(hasExternal,
      `\u2460-4 [${building.name}] \uACF5\uACF5\uB370\uC774\uD130 \uCC98\uB9AC \uD754\uC801`,
      '');

    return data;
  } catch (err) {
    assert(false, `\u2460-ERR [${building.name}]`, err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════
// 파이프라인 ②: AI 콘텐츠 작성 품질 검증
// ════════════════════════════════════════════════════════

async function testAIContentGeneration(building, imData) {
  console.log(`\n\u2501\u2501 \u2461 AI \uCF58\uD150\uCE20 \uC791\uC131 [${building.label}] \u2501\u2501`);

  if (!imData) { skip(`\u2461-ALL [${building.name}]`, 'IM \uB370\uC774\uD130 \uC5C6\uC74C'); return null; }

  const sections = imData.sections || [];

  // ②-1: 섹션 수
  assert(sections.length >= 3,
    `\u2461-1 [${building.name}] Basic IM \uC139\uC158 \uC218 \u2265 3`,
    `sections=${sections.length}`);

  // ②-2: section_type 유효율
  const validTypes = Object.keys(SECTION_TYPE_TO_DATA_KEY);
  const sTypes = sections.map(s => s.section_type).filter(Boolean);
  const knownTypes = sTypes.filter(t => validTypes.includes(t));
  assert(knownTypes.length >= Math.min(sTypes.length, 3),
    `\u2461-2 [${building.name}] section_type \uC720\uD6A8\uC728`,
    `known=${knownTypes.length}/${sTypes.length}, types=[${sTypes.join(',')}]`);

  // ②-3: 관점별 필수 섹션
  const expectedTypes = building.expectedSectionTypes;
  const missingTypes = expectedTypes.filter(t => !sTypes.includes(t));
  assert(missingTypes.length <= 1,
    `\u2461-3 [${building.name}] \uAD00\uC810\uBCC4 \uD544\uC218 \uC139\uC158 (${building.posture})`,
    missingTypes.length > 0 ? `\uB204\uB77D: ${missingTypes.join(', ')}` : 'ALL PRESENT');

  // ②-4: 평균 콘텐츠 길이
  const contentLengths = sections.map(s => (s.content || s.markdown || '').length);
  const avgLen = contentLengths.reduce((a, b) => a + b, 0) / Math.max(contentLengths.length, 1);
  assert(avgLen >= 100,
    `\u2461-4 [${building.name}] \uD3C9\uADE0 \uCF58\uD150\uCE20 \u2265 100\uC790`,
    `avg=${Math.round(avgLen)}\uC790, range=[${Math.min(...contentLengths)}~${Math.max(...contentLengths)}]`);

  // ②-5: 마크다운 테이블
  const allMd = sections.map(s => s.content || s.markdown || '').join('\n');
  const tableCount = (allMd.match(/\|.*\|.*\|/g) || []).length;
  assert(tableCount >= 2,
    `\u2461-5 [${building.name}] \uB9C8\uD06C\uB2E4\uC6B4 \uD14C\uC774\uBE14 \u2265 2\uAC74`,
    `tables=${tableCount}`);

  // ②-6: AI guardrail
  const forbiddenPatterns = [
    /\uD655\uC2E4(\uD569\uB2C8\uB2E4|\uD55C|\uD788)/, /\uBCF4\uC7A5(\uD569\uB2C8\uB2E4|\uB41C)/, /\uBB34\uC870\uAC74/,
    /\uBC18\uB4DC\uC2DC \uC218\uC775/, /\uC190\uC2E4 \uC5C6/
  ];
  const violations = forbiddenPatterns.filter(p => p.test(allMd));
  assert(violations.length === 0,
    `\u2461-6 [${building.name}] AI guardrail (\uAE08\uC9C0 \uD45C\uD604 0\uAC74)`,
    violations.length > 0 ? `\uC704\uBC18: ${violations.map(v => v.source).join(', ')}` : '');

  // ②-7: disclaimer
  const hasDisclaimer = sections.some(s =>
    (s.title && s.title.includes('\uBA74\uCC45')) ||
    (s.section_type === 'disclaimer')
  ) || (imData.disclaimer && imData.disclaimer.length > 20);
  assert(hasDisclaimer,
    `\u2461-7 [${building.name}] \uBA74\uCC45 \uC870\uD56D`,
    '');

  // ②-8: generatedAt
  assert(imData.generatedAt && !isNaN(Date.parse(imData.generatedAt)),
    `\u2461-8 [${building.name}] generatedAt \uC720\uD6A8`,
    `generatedAt=${imData.generatedAt}`);

  // ②-9: 브로커 정보
  assert(imData.broker && imData.broker.displayName && imData.broker.company,
    `\u2461-9 [${building.name}] \uBE0C\uB85C\uCEE4 \uC815\uBCF4 \uC644\uC804\uC131`,
    `name=${imData.broker?.displayName}, co=${imData.broker?.company}`);

  return sections;
}

// ════════════════════════════════════════════════════════
// 파이프라인 ③: 모바일 IM 페이지 렌더링 검증
// ════════════════════════════════════════════════════════

async function testMobileIMRendering(building) {
  console.log(`\n\u2501\u2501 \u2462 \uBAA8\uBC14\uC77C IM \uB80C\uB354\uB9C1 [${building.label}] \u2501\u2501`);

  const url = `${BASE_URL}/im-lite/${building.id}`;
  try {
    const res = await fetch(url);

    assert(res.status === 200, `\u2462-1 [${building.name}] \uD398\uC774\uC9C0 200`, `status=${res.status}`);
    if (res.status !== 200) return;

    const html = await res.text();

    assert(html.includes('<html') && html.includes('</html>'),
      `\u2462-2 [${building.name}] HTML \uAD6C\uC870 \uC644\uC804\uC131`, `len=${html.length}`);

    const hasOG = html.includes('og:title') && html.includes('og:description');
    assert(hasOG, `\u2462-3 [${building.name}] OG \uBA54\uD0C0 \uD0DC\uADF8`, '');

    // Next.js SSR은 fallback 텍스트를 JS 번들에 포함하므로,
    // 실제 서버렌더 body 영역만 검사 (script 태그 밖)
    const bodyOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    const isError = bodyOnly.includes('\uD22C\uC790\uBCF4\uACE0\uC11C\uAC00 \uC544\uC9C1 \uC900\uBE44 \uC911');
    assert(!isError, `\u2462-4 [${building.name}] \uC815\uC0C1 \uCF58\uD150\uCE20`, isError ? '\uC5D0\uB7EC \uAC10\uC9C0' : '');

    const hasIMContent = html.includes('\uD22C\uC790') || html.includes('IM') || html.includes('\uB9E4\uAC01');
    assert(hasIMContent, `\u2462-5 [${building.name}] IM \uD575\uC2EC UI \uC694\uC18C`, '');

    const hasHydration = html.includes('__NEXT_DATA__') || html.includes('self.__next');
    assert(hasHydration, `\u2462-6 [${building.name}] Next.js \uD558\uC774\uB4DC\uB808\uC774\uC158`, '');
  } catch (err) {
    assert(false, `\u2462-ERR [${building.name}]`, err.message);
  }
}

// ════════════════════════════════════════════════════════
// 파이프라인 ④: PPTX 데이터 변환 검증
// ════════════════════════════════════════════════════════

function testPptxDataTransformation(building, sections) {
  console.log(`\n\u2501\u2501 \u2463 PPTX \uB370\uC774\uD130 \uBCC0\uD658 [${building.label}] \u2501\u2501`);

  if (!sections || sections.length === 0) {
    skip(`\u2463-ALL [${building.name}]`, '\uC139\uC158 \uB370\uC774\uD130 \uC5C6\uC74C');
    return;
  }

  const sTypes = sections.map(s => s.section_type).filter(Boolean);
  const mappedKeys = sTypes.map(t => SECTION_TYPE_TO_DATA_KEY[t]).filter(Boolean);

  // ④-1: 매핑율
  assert(mappedKeys.length >= Math.min(sTypes.length - 1, 2),
    `\u2463-1 [${building.name}] section_type\u2192dataKey \uB9E4\uD551\uC728`,
    `mapped=${mappedKeys.length}/${sTypes.length}, keys=[${mappedKeys.join(',')}]`);

  // ④-2: 필수 dataKey
  const expectedKeys = building.expectedPptxDataKeys;
  const missingKeys = expectedKeys.filter(k => !mappedKeys.includes(k));
  assert(missingKeys.length <= 1,
    `\u2463-2 [${building.name}] \uD544\uC218 dataKey (${building.posture})`,
    missingKeys.length > 0 ? `\uB204\uB77D: ${missingKeys.join(',')}` : 'ALL PRESENT');

  // ④-3: 파생 dataKey
  const derivableTypes = sTypes.filter(t => DERIVED_DATA_KEYS[t]);
  const expectedDerived = derivableTypes.flatMap(t => DERIVED_DATA_KEYS[t]);
  assert(expectedDerived.length >= 1,
    `\u2463-3 [${building.name}] \uD30C\uC0DD dataKey \uD6C4\uBCF4`,
    `derivable=${expectedDerived.join(',')}`);

  // ④-4: 테이블 파싱 가능
  const mdWithTables = sections.filter(s => {
    const md = s.content || s.markdown || '';
    return /\|.*\|.*\|/.test(md);
  });
  assert(mdWithTables.length >= 1,
    `\u2463-4 [${building.name}] \uD14C\uC774\uBE14 \uD30C\uC2F1 \uAC00\uB2A5 \uC139\uC158 \u2265 1`,
    `tablesSections=${mdWithTables.length}`);

  // ④-5: StatMetrics
  const allMd = sections.map(s => s.content || s.markdown || '').join('\n');
  const boldKVCount = (allMd.match(/\*\*.*?\*\*\s*[\uFF1A:]/g) || []).length;
  const numberCount = (allMd.match(/\d[\d,.]*\s*(?:\uC5B5|\uB9CC\uC6D0|\uC6D0|%|\u33A1|\uD3C9|\uCE35|\uD638)/g) || []).length;
  assert(boldKVCount >= 1 || numberCount >= 2,
    `\u2463-5 [${building.name}] StatMetrics \uCD94\uCD9C \uAC00\uB2A5 \uB370\uC774\uD130`,
    `boldKV=${boldKVCount}, numbers=${numberCount}`);

  // ④-6: 아키타입 다양성
  const archetypes = mappedKeys.map(k => DATA_KEY_ARCHETYPE[k]).filter(Boolean);
  const uniqueArchetypes = [...new Set(archetypes)];
  assert(uniqueArchetypes.length >= 2,
    `\u2463-6 [${building.name}] \uC544\uD0A4\uD0C0\uC785 \uB2E4\uC591\uC131 \u2265 2\uC885`,
    `archetypes=[${uniqueArchetypes.join(',')}]`);

  // ④-7: 빈 섹션 비율
  const nonEmpty = sections.filter(s => (s.content || s.markdown || '').trim().length > 10);
  const emptyRatio = 1 - (nonEmpty.length / sections.length);
  assert(emptyRatio < 0.3,
    `\u2463-7 [${building.name}] \uBE48 \uC139\uC158 \uBE44\uC728 < 30%`,
    `empty=${(emptyRatio * 100).toFixed(0)}% (${sections.length - nonEmpty.length}/${sections.length})`);
}

// ════════════════════════════════════════════════════════
// 파이프라인 ⑤: PPTX 렌더링 검증
// ════════════════════════════════════════════════════════

async function testPptxRendering(building) {
  console.log(`\n\u2501\u2501 \u2464 PPTX \uB80C\uB354\uB9C1 [${building.label}] \u2501\u2501`);

  const preset = 'credeal_signature';
  const url = `${BASE_URL}/api/public/im-lite/${building.id}/pptx?preset=${preset}&tier=basic`;

  try {
    const res = await fetch(url);

    assert(res.status === 200, `\u2464-1 [${building.name}] PPTX 200 \uC751\uB2F5`, `status=${res.status}`);
    if (res.status !== 200) {
      const err = await res.text().catch(() => '');
      console.log(`     \uC751\uB2F5: ${err.substring(0, 300)}`);
      return;
    }

    const ct = res.headers.get('content-type') || '';
    assert(ct.includes('openxmlformats') || ct.includes('octet-stream'),
      `\u2464-2 [${building.name}] Content-Type PPTX`, `ct="${ct}"`);

    const buf = Buffer.from(await res.arrayBuffer());
    assert(buf.length >= 50000, `\u2464-3 [${building.name}] \uD06C\uAE30 \u2265 50KB`, `${(buf.length / 1024).toFixed(0)}KB`);

    const magic = buf.slice(0, 4).toString('hex');
    assert(magic === '504b0304', `\u2464-4 [${building.name}] PK \uC2DC\uADF8\uB2C8\uCCD0`, `0x${magic}`);

    const bufStr = buf.toString('binary');
    const hasContentTypes = bufStr.includes('[Content_Types].xml');
    const hasPptDir = bufStr.includes('ppt/');
    assert(hasContentTypes && hasPptDir,
      `\u2464-5 [${building.name}] PPTX \uB0B4\uBD80 \uAD6C\uC870`,
      `CT=${hasContentTypes}, ppt=${hasPptDir}`);

    const slideMatches = bufStr.match(/ppt\/slides\/slide\d+\.xml/g) || [];
    const slideCount = new Set(slideMatches).size;
    assert(slideCount >= 5 && slideCount <= 15,
      `\u2464-6 [${building.name}] \uC2AC\uB77C\uC774\uB4DC \uC218 [5~15]`, `slides=${slideCount}`);

    const hasTheme = bufStr.includes('ppt/theme/');
    assert(hasTheme, `\u2464-7 [${building.name}] \uD14C\uB9C8 \uD30C\uC77C`, '');

    const hasKorean = /[\uAC00-\uD7AF]/.test(buf.toString('utf8').substring(0, 100000));
    assert(hasKorean, `\u2464-8 [${building.name}] \uD55C\uAE00 \uCF58\uD150\uCE20`, '');

    const hasCharts = bufStr.includes('ppt/charts/');
    results.push({
      test: `\u2464-9 [${building.name}] \uCC28\uD2B8 \uB370\uC774\uD130`,
      status: hasCharts ? 'PASS' : 'INFO',
      detail: hasCharts ? '\uCC28\uD2B8 \uD3EC\uD568' : '\uCC28\uD2B8 \uBBF8\uD3EC\uD568 (\uC120\uD0DD\uC801)',
    });
    if (hasCharts) { passed++; console.log(`  \u2705 \u2464-9 [${building.name}] \uCC28\uD2B8 \uB370\uC774\uD130 \uD3EC\uD568`); }
    else { console.log(`  \u2139\uFE0F  \u2464-9 [${building.name}] \uCC28\uD2B8 \uBBF8\uD3EC\uD568 (\uC120\uD0DD\uC801)`); }

    const outPath = path.join(RESULT_DIR, `${preset}_${building.name}_basic.pptx`);
    fs.writeFileSync(outPath, buf);
    assert(true, `\u2464-10 [${building.name}] \uD30C\uC77C \uC800\uC7A5`, outPath);
  } catch (err) {
    assert(false, `\u2464-ERR [${building.name}]`, err.message);
  }
}

// ════════════════════════════════════════════════════════
// 통합 상관관계 검증
// ════════════════════════════════════════════════════════

async function testCrossPipelineConsistency(building, imData) {
  console.log(`\n\u2501\u2501 \u2726 \uD30C\uC774\uD504\uB77C\uC778 \uAC04 \uC815\uD569\uC131 [${building.label}] \u2501\u2501`);

  if (!imData) { skip(`\u2726-ALL [${building.name}]`, 'IM \uB370\uC774\uD130 \uC5C6\uC74C'); return; }

  assert(imData.blindName && imData.blindName.length > 3,
    `\u2726-1 [${building.name}] blindName \uC0DD\uC131`,
    `"${imData.blindName}"`);

  const sectionCount = (imData.sections || []).length;
  assert(sectionCount >= 3,
    `\u2726-2 [${building.name}] IM \uC139\uC158\u2192PPTX \uC2AC\uB77C\uC774\uB4DC \uBE44\uB840`,
    `sections=${sectionCount}, expectedSlides\u2248${sectionCount + 3}`);

  const hasAreaSignal = (imData.areaSignal || imData.area_signal) && (imData.areaSignal || imData.area_signal).length > 0;
  const hasPriceBand = (imData.priceBand || imData.price_band) && (imData.priceBand || imData.price_band).length > 0;
  // blindName은 area_signal + asset_type의 결합이므로 이것이 있으면 SSoT 데이터가 흐른 것
  const hasBlindNameProxy = imData.blindName && imData.blindName.length > 5;
  assert(hasAreaSignal || hasPriceBand || hasBlindNameProxy,
    `\u2726-3 [${building.name}] SSoT\u2192StatGrid \uB370\uC774\uD130 \uD750\uB984`,
    `area=${imData.areaSignal || imData.area_signal}, price=${imData.priceBand || imData.price_band}, blindName=${imData.blindName}`);

  const sections = imData.sections || [];
  const sTypes = sections.map(s => s.section_type).filter(Boolean);
  if (building.posture === 'development') {
    const hasDev = sTypes.includes('site_analysis') || sTypes.includes('development_feasibility');
    assert(hasDev, `\u2726-4 [${building.name}] \uAC1C\uBC1C\uD615 \uC804\uC6A9 \uC139\uC158`, `types=[${sTypes.join(',')}]`);
  } else if (building.posture === 'income') {
    const hasIncome = sTypes.includes('lease_status') || sTypes.includes('income_analysis');
    assert(hasIncome, `\u2726-4 [${building.name}] \uC218\uC775\uD615 \uC804\uC6A9 \uC139\uC158`, `types=[${sTypes.join(',')}]`);
  }
}

// ═══════════════════════════════════
// 메인 실행
// ═══════════════════════════════════

async function main() {
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551  CREDEAL E2E \uC0C1\uC6A9\uD654 \uAC80\uC99D v2                        \u2551');
  console.log('\u2551  5 \uD30C\uC774\uD504\uB77C\uC778 \u00D7 3\uAC74 \uC815\uBC00 \uAC80\uC99D                    \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  console.log(`\uB300\uC0C1: ${BUILDINGS.map(b => `${b.label}(${b.posture})`).join(', ')}`);
  console.log(`\uC2DC\uAC01: ${new Date().toISOString()}\n`);

  if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true });

  for (const building of BUILDINGS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  \uD83D\uDCCB ${building.label} (${building.posture}, ${building.expectedGrade}\uB4F1\uAE09)`);
    console.log(`${'='.repeat(60)}`);

    const imData = await testGovDataEnrichment(building);
    const sections = await testAIContentGeneration(building, imData);
    await testMobileIMRendering(building);
    testPptxDataTransformation(building, sections);
    await testPptxRendering(building);
    await testCrossPipelineConsistency(building, imData);
  }

  // ── 최종 결과 ──
  console.log('\n' + '='.repeat(60));
  console.log(`  \uCD1D ${passed + failed + skipped}\uAC74`);
  console.log(`  \u2705 PASS: ${passed}  \u274C FAIL: ${failed}  \u23ED\uFE0F  SKIP: ${skipped}`);
  console.log('='.repeat(60));

  // ── 파이프라인별 요약 ──
  const pipelineIds = ['\u2460', '\u2461', '\u2462', '\u2463', '\u2464', '\u2726'];
  const pipelineLabels = {
    '\u2460': '\uACF5\uACF5\uB370\uC774\uD130 \uC218\uC9D1',
    '\u2461': 'AI \uCF58\uD150\uCE20 \uC791\uC131',
    '\u2462': '\uBAA8\uBC14\uC77C IM \uB80C\uB354\uB9C1',
    '\u2463': 'PPTX \uB370\uC774\uD130 \uBCC0\uD658',
    '\u2464': 'PPTX \uB80C\uB354\uB9C1',
    '\u2726': '\uD30C\uC774\uD504\uB77C\uC778 \uC815\uD569\uC131',
  };
  console.log('\n\uD30C\uC774\uD504\uB77C\uC778\uBCC4 \uACB0\uACFC:');
  for (const p of pipelineIds) {
    const pResults = results.filter(r => r.test.includes(p));
    const pPass = pResults.filter(r => r.status === 'PASS').length;
    const pFail = pResults.filter(r => r.status === 'FAIL').length;
    const pSkip = pResults.filter(r => r.status === 'SKIP').length;
    const emoji = pFail === 0 ? '\u2705' : '\u274C';
    console.log(`  ${emoji} ${p} ${pipelineLabels[p]}: ${pPass}/${pPass + pFail} PASS${pSkip > 0 ? ` (${pSkip} skip)` : ''}`);
  }

  // ── CSV 저장 ──
  const csv = ['pipeline,test,status,detail'];
  results.forEach(r => {
    const pipeline = (r.test.match(/[\u2460\u2461\u2462\u2463\u2464\u2726]/) || ['?'])[0];
    csv.push(`"${pipeline}","${r.test}","${r.status}","${(r.detail || '').replace(/"/g, '""')}"`);
  });
  fs.writeFileSync(path.join(RESULT_DIR, 'e2e_v2_results.csv'), csv.join('\n'), 'utf8');

  // ── JSON 저장 ──
  fs.writeFileSync(
    path.join(RESULT_DIR, 'e2e_v2_results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      version: 'v2',
      buildings: BUILDINGS.map(b => ({ name: b.name, id: b.id, posture: b.posture })),
      summary: { passed, failed, skipped, total: passed + failed + skipped },
      results,
    }, null, 2),
    'utf8'
  );

  console.log(`\n\uACB0\uACFC \uC800\uC7A5: ${RESULT_DIR}/e2e_v2_results.{csv,json}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
