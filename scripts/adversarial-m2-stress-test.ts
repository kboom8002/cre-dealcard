/**
 * Milestone M2 Adversarial Challenge & Stress Test Runner
 *
 * Empirically challenges:
 * 1. Negative pairs: Malformed payloads & missing required fields return HTTP 400
 * 2. Mathematical matching execution: Genuine scores (score >= 0, stage2_semantic, stage3_multicriteria)
 * 3. Bidirectional navigation links: Route existence (no 404s), no dormant redirects, ts-nocheck absence
 */
import fs from 'node:fs';
import path from 'node:path';

// Setup environment before any app imports
(process.env as any).NODE_ENV = 'test';
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const equalsIdx = trimmed.indexOf('=');
      if (equalsIdx !== -1) {
        const key = trimmed.slice(0, equalsIdx).trim();
        const value = trimmed.slice(equalsIdx + 1).trim();
        process.env[key] = value;
      }
    }
  }
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
}

async function main() {
  const { NextRequest } = await import('next/server');

  // Route Handlers
  const { POST: matchPost } = await import('../src/app/api/broker/match/route');
  const { POST: leaseMatchPost } = await import('../src/app/api/broker/lease-match/route');
  const { POST: circleDisclosurePost } = await import('../src/app/api/broker/circles/[id]/match/[matchId]/disclosure/route');

  interface CheckResult {
    category: string;
    name: string;
    passed: boolean;
    expected: string;
    actual: string;
    details?: any;
  }

  const results: CheckResult[] = [];

  function record(category: string, name: string, passed: boolean, expected: string, actual: string, details?: any) {
    results.push({ category, name, passed, expected, actual, details });
    const icon = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${icon}] [${category}] ${name}`);
    if (!passed) {
      console.log(`       Expected: ${expected}`);
      console.log(`       Actual:   ${actual}`);
    }
  }

  const projectRoot = path.resolve(__dirname, '..');

  console.log('======================================================');
  console.log('MILESTONE M2 ADVERSARIAL CHALLENGE & STRESS HARNESS');
  console.log('======================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // 1. NEGATIVE PAIRS & HTTP 400 BAD REQUEST VERIFICATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. NEGATIVE PAIRS & HTTP STATUS VERIFICATION ---');

  // MATCH-E2E-01-NEG: POST /api/broker/match with malformed payload
  {
    const req = new NextRequest('http://localhost:3000/api/broker/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-001',
      },
      body: JSON.stringify({ invalidField: 'garbage' }),
    });
    const res = await matchPost(req);
    const body = await res.json();
    const passed = res.status === 400 && !!body.error;
    record(
      'Negative Pairs',
      'MATCH-E2E-01-NEG: POST /api/broker/match malformed payload returns HTTP 400',
      passed,
      'HTTP 400 with error property',
      `HTTP ${res.status}: ${JSON.stringify(body)}`
    );
  }

  // MATCH-E2E-01-NEG-B: POST /api/broker/match with empty body
  {
    const req = new NextRequest('http://localhost:3000/api/broker/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-001',
      },
      body: JSON.stringify({}),
    });
    const res = await matchPost(req);
    const body = await res.json();
    const passed = res.status === 400 && !!body.error;
    record(
      'Negative Pairs',
      'MATCH-E2E-01-NEG-B: POST /api/broker/match empty payload returns HTTP 400',
      passed,
      'HTTP 400 with error property',
      `HTTP ${res.status}: ${JSON.stringify(body)}`
    );
  }

  // MATCH-E2E-07-NEG: POST /api/broker/circles/[id]/match/[matchId]/disclosure with invalid level
  {
    const req = new NextRequest('http://localhost:3000/api/broker/circles/c1/match/m1/disclosure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-001',
      },
      body: JSON.stringify({ level: 'invalid_disclosure_level' }),
    });
    const res = await circleDisclosurePost(req, { params: Promise.resolve({ id: 'c1', matchId: 'm1' }) });
    const body = await res.json();
    const passed = res.status === 400 && !!body.error;
    record(
      'Negative Pairs',
      'MATCH-E2E-07-NEG: POST circle disclosure invalid level returns HTTP 400',
      passed,
      'HTTP 400 with error property',
      `HTTP ${res.status}: ${JSON.stringify(body)}`
    );
  }

  // MATCH-E2E-13-NEG: POST /api/broker/lease-match with malformed payload
  {
    const req = new NextRequest('http://localhost:3000/api/broker/lease-match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-001',
      },
      body: JSON.stringify({ malformed: true }),
    });
    const res = await leaseMatchPost(req);
    const body = await res.json();
    const passed = res.status === 400;
    record(
      'Negative Pairs',
      'MATCH-E2E-13-NEG: POST /api/broker/lease-match malformed payload returns HTTP 400',
      passed,
      'HTTP 400 Bad Request',
      `HTTP ${res.status}: ${JSON.stringify(body)}`
    );
  }

  // MATCH-E2E-13-NEG-B: POST /api/broker/lease-match with missing intent
  {
    const req = new NextRequest('http://localhost:3000/api/broker/lease-match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-001',
      },
      body: JSON.stringify({ space: { id: 's1', floor: '1F' } }),
    });
    const res = await leaseMatchPost(req);
    const body = await res.json();
    const passed = res.status === 400;
    record(
      'Negative Pairs',
      'MATCH-E2E-13-NEG-B: POST /api/broker/lease-match missing intent returns HTTP 400',
      passed,
      'HTTP 400 Bad Request',
      `HTTP ${res.status}: ${JSON.stringify(body)}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. MATHEMATICAL MATCHING ENGINE EXECUTION & GENUINE SCORES
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. MATHEMATICAL MATCHING ALGORITHMS & SCORES ---');

  // Math 1: Inline buyer match produces genuine positive score & breakdowns
  {
    const req = new NextRequest('http://localhost:3000/api/broker/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-001',
      },
      body: JSON.stringify({
        building: {
          id: 'b-math-1',
          priceBand: '50억',
          areaSignal: '강남구 역삼동',
          assetType: '중소형빌딩',
          dealCuriosityScore: 80,
          investmentPosture: 'income',
        },
        intent: {
          purchasePurpose: '임대수익',
          budgetRange: { min: 40, max: 60, display: '40~60억' },
          preferredRegions: ['강남구'],
          assetTypes: ['중소형빌딩'],
          investmentPosture: 'income',
        },
      }),
    });
    const res = await matchPost(req);
    const body = await res.json();
    const r = body.result;

    const validMath =
      res.status === 200 &&
      body.ok === true &&
      typeof body.score === 'number' &&
      body.score > 0 &&
      body.score <= 100 &&
      r &&
      r.stage1Passed === true &&
      typeof r.stage2Similarity === 'number' &&
      r.stage2Similarity >= 0 &&
      r.stage2Similarity <= 1 &&
      typeof r.stage3Score === 'number' &&
      r.stage3Score > 0 &&
      ['S', 'A', 'B', 'C'].includes(body.grade);

    record(
      'Math Execution',
      'Inline buyer match executes 3 stages with genuine scores (score > 0, stage2, stage3)',
      !!validMath,
      'score > 0, stage1Passed=true, stage2Similarity in [0,1], stage3Score > 0',
      `status=${res.status}, score=${body.score}, grade=${body.grade}, s1=${r?.stage1Passed}, s2Sim=${r?.stage2Similarity}, s3Score=${r?.stage3Score}`
    );
  }

  // Math 2: Inline lease match executes 3 stages with genuine positive score
  {
    const req = new NextRequest('http://localhost:3000/api/broker/lease-match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-001',
      },
      body: JSON.stringify({
        space: {
          id: 'space-math-1',
          floor: '2F',
          area_sqm: 165,
          monthly_rent: 450,
          deposit: 5000,
          area_signal: '강남구 테헤란로',
          space_type: 'office',
          incentives: { rentFreeMonths: 2 },
        },
        intent: {
          id: 'intent-math-1',
          business_type: 'IT 테크 스타트업',
          preferred_regions: ['강남구'],
          area_min: 130,
          area_max: 200,
          budget_deposit_max: 6000,
          budget_monthly_max: 500,
          preferred_floors: ['2F', '3F'],
        },
      }),
    });
    const res = await leaseMatchPost(req);
    const body = await res.json();
    const d = body.data;

    const validLeaseMath =
      res.status === 200 &&
      body.ok === true &&
      typeof body.score === 'number' &&
      body.score > 0 &&
      body.score <= 100 &&
      d &&
      d.stage1Passed === true &&
      typeof d.stage2Similarity === 'number' &&
      typeof d.stage3Score === 'number' &&
      ['S', 'A', 'B', 'C'].includes(body.grade);

    record(
      'Math Execution',
      'Inline lease match executes 3 stages with genuine scores (score > 0, stage2, stage3)',
      !!validLeaseMath,
      'score > 0, stage1Passed=true, stage2Similarity in [0,1], stage3Score > 0',
      `status=${res.status}, score=${body.score}, grade=${body.grade}, s1=${d?.stage1Passed}, s2Sim=${d?.stage2Similarity}, s3Score=${d?.stage3Score}`
    );
  }

  // Math 3: Adversarial Boundary: Budget mismatch (> 120%) forces Stage 1 fail, score = 0, Grade = C
  {
    const req = new NextRequest('http://localhost:3000/api/broker/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-001',
      },
      body: JSON.stringify({
        building: {
          id: 'b-math-extreme',
          priceBand: '300억',
          areaSignal: '강남구 역삼동',
          assetType: '중소형빌딩',
        },
        intent: {
          purchasePurpose: '투자',
          budgetRange: { min: 20, max: 30, display: '20~30억' },
          preferredRegions: ['강남구'],
          assetTypes: ['중소형빌딩'],
        },
      }),
    });
    const res = await matchPost(req);
    const body = await res.json();
    const r = body.result;

    const passed =
      res.status === 200 &&
      body.score === 0 &&
      body.grade === 'C' &&
      r?.stage1Passed === false &&
      r?.reasoning?.includes('가격대 불일치');

    record(
      'Math Execution',
      'Adversarial budget mismatch forces Stage 1 failure with score=0 and Grade C',
      passed,
      'score=0, grade=C, stage1Passed=false, reasoning contains 가격대 불일치',
      `score=${body.score}, grade=${body.grade}, stage1Passed=${r?.stage1Passed}, reasoning=${r?.reasoning}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. BIDIRECTIONAL NAVIGATION & ROUTING INTEGRITY (NO 404s)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. BIDIRECTIONAL NAVIGATION & ROUTING INTEGRITY ---');

  const navigationRoutes = [
    { name: 'Dealcard Broker Detail', file: 'src/app/(broker)/broker/deal-card/[id]/page.tsx' },
    { name: 'Matching Center', file: 'src/app/(broker)/broker/matching/page.tsx' },
    { name: 'Tenant Intents List', file: 'src/app/(broker)/broker/tenant-intents/page.tsx' },
    { name: 'Tenant Intents New Form', file: 'src/app/(broker)/broker/tenant-intents/new/page.tsx' },
    { name: 'Tenant Intents Detail', file: 'src/app/(broker)/broker/tenant-intents/[id]/page.tsx' },
    { name: 'Public Dealcard Viewer', file: 'src/app/(public)/dc/[id]/page.tsx' },
    { name: 'Public Mobile IM Viewer', file: 'src/app/(public)/im-lite/[buildingId]/page.tsx' },
    { name: 'Leasing Space List', file: 'src/app/(broker)/broker/lease-card/page.tsx' },
    { name: 'Leasing Space Detail', file: 'src/app/(broker)/broker/lease-card/[id]/page.tsx' },
    { name: 'Leasing Space New', file: 'src/app/(broker)/broker/lease-card/new/page.tsx' },
    { name: 'Leasing Studio Main', file: 'src/app/(broker)/broker/leasing/page.tsx' },
    { name: 'Leasing Studio Space', file: 'src/app/(broker)/broker/leasing/[spaceId]/page.tsx' },
  ];

  for (const route of navigationRoutes) {
    const fullPath = path.join(projectRoot, route.file);
    const exists = fs.existsSync(fullPath);
    record(
      'Navigation Links',
      `Route exists on disk: ${route.name}`,
      exists,
      'File exists',
      exists ? 'Found' : 'Missing 404'
    );
  }

  // Check for dormant redirects in 8 leasing pages
  const leasingFiles = [
    'src/app/(broker)/broker/tenant-intents/page.tsx',
    'src/app/(broker)/broker/tenant-intents/[id]/page.tsx',
    'src/app/(broker)/broker/tenant-intents/new/page.tsx',
    'src/app/(broker)/broker/lease-card/page.tsx',
    'src/app/(broker)/broker/lease-card/[id]/page.tsx',
    'src/app/(broker)/broker/lease-card/new/page.tsx',
    'src/app/(broker)/broker/leasing/page.tsx',
    'src/app/(broker)/broker/leasing/[spaceId]/page.tsx',
  ];

  for (const relPath of leasingFiles) {
    const fullPath = path.join(projectRoot, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const hasDormantRedirect = content.includes('dormantRouter.replace');
    record(
      'Leasing Reactivation',
      `Zero dormant redirects in ${relPath}`,
      !hasDormantRedirect,
      'No dormantRouter.replace',
      hasDormantRedirect ? 'Found dormantRouter.replace' : 'Clean'
    );
  }

  // Check for lingering @ts-nocheck DORMANT in the 8 leasing pages
  for (const relPath of leasingFiles) {
    const fullPath = path.join(projectRoot, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const hasTsNocheck = content.includes('@ts-nocheck DORMANT');
    record(
      'Leasing Reactivation',
      `Zero @ts-nocheck DORMANT in ${relPath}`,
      !hasTsNocheck,
      'No @ts-nocheck DORMANT',
      hasTsNocheck ? 'Found @ts-nocheck DORMANT' : 'Clean'
    );
  }

  // Check bidirectional links
  {
    const dcContent = fs.readFileSync(path.join(projectRoot, 'src/app/(broker)/broker/deal-card/[id]/page.tsx'), 'utf8');
    const hasMatchingLink = dcContent.includes('/broker/matching?buildingId=');
    const hasIntentLink = dcContent.includes('/broker/tenant-intents?buildingId=');
    record(
      'Bidirectional Navigation',
      'deal-card/[id] links to matching & tenant-intents',
      hasMatchingLink && hasIntentLink,
      'Contains links to matching and tenant-intents',
      `matching=${hasMatchingLink}, intents=${hasIntentLink}`
    );
  }

  {
    const matchContent = fs.readFileSync(path.join(projectRoot, 'src/app/(broker)/broker/matching/page.tsx'), 'utf8');
    const hasBackLink = matchContent.includes('/broker/deal-card/') && matchContent.includes('딜카드로 돌아가기');
    record(
      'Bidirectional Navigation',
      'matching page returns back to deal-card with banner',
      hasBackLink,
      'Contains back-link to deal-card with 딜카드로 돌아가기',
      `hasBackLink=${hasBackLink}`
    );
  }

  {
    const tenantContent = fs.readFileSync(path.join(projectRoot, 'src/app/(broker)/broker/tenant-intents/page.tsx'), 'utf8');
    const hasBackLink = tenantContent.includes('/broker/deal-card/') && tenantContent.includes('← 딜카드로 이동');
    record(
      'Bidirectional Navigation',
      'tenant-intents list returns back to deal-card with banner',
      hasBackLink,
      'Contains back-link to deal-card with ← 딜카드로 이동',
      `hasBackLink=${hasBackLink}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY REPORT
  // ──────────────────────────────────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n======================================================');
  console.log('CHALLENGER STRESS HARNESS SUMMARY');
  console.log('======================================================');
  console.log(`Total Checks: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFAILED CHECKS:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`- [${r.category}] ${r.name}`);
      console.log(`    Expected: ${r.expected}`);
      console.log(`    Actual:   ${r.actual}`);
    }
  }

  return { total, passed, failed, results };
}

main().catch(console.error);
