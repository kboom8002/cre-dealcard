/**
 * Milestone M2 Adversarial Challenge: Extended Stress Testing for POST /api/broker/lease-match
 *
 * Verifies that ZERO adversarial inputs trigger an uncaught HTTP 500 server crash.
 */
import fs from 'node:fs';
import path from 'node:path';

(process.env as any).NODE_ENV = 'test';
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
}

async function runAdversarialStress() {
  const { NextRequest } = await import('next/server');
  const { POST: leaseMatchPost } = await import('../src/app/api/broker/lease-match/route');

  interface TestCase {
    id: string;
    description: string;
    body: string | undefined;
    contentType?: string;
  }

  const testCases: TestCase[] = [
    // 1. Empty and whitespace bodies
    { id: 'EMPTY-01', description: 'Completely undefined body', body: undefined },
    { id: 'EMPTY-02', description: 'Empty string body', body: '' },
    { id: 'EMPTY-03', description: 'Whitespace string body', body: '   \n\t  ' },
    { id: 'EMPTY-04', description: 'Empty JSON object', body: '{}' },

    // 2. Non-object bodies (primitives and arrays)
    { id: 'PRIMITIVE-01', description: 'String primitive body', body: '"just a string"' },
    { id: 'PRIMITIVE-02', description: 'Number primitive body', body: '12345' },
    { id: 'PRIMITIVE-03', description: 'Boolean primitive body (true)', body: 'true' },
    { id: 'PRIMITIVE-04', description: 'Boolean primitive body (false)', body: 'false' },
    { id: 'PRIMITIVE-05', description: 'Null primitive body', body: 'null' },
    { id: 'PRIMITIVE-06', description: 'Empty array body', body: '[]' },
    { id: 'PRIMITIVE-07', description: 'Array of numbers body', body: '[1, 2, 3]' },
    { id: 'PRIMITIVE-08', description: 'Array of empty objects body', body: '[{}, {}]' },

    // 3. Malformed JSON
    { id: 'MALFORMED-01', description: 'Unclosed JSON object', body: '{"space": "foo"' },
    { id: 'MALFORMED-02', description: 'Trailing comma / broken JSON syntax', body: '{"space": { "id": 1, },}' },
    { id: 'MALFORMED-03', description: 'Non-JSON text string', body: 'this is completely not json' },
    { id: 'MALFORMED-04', description: 'HTML content instead of JSON', body: '<!DOCTYPE html><html><body>Error</body></html>', contentType: 'text/html' },
    { id: 'MALFORMED-05', description: 'Binary-like escaped byte string', body: '{"data": "\x00\x01\x02\xFF"}' },

    // 4. Missing required schema fields
    { id: 'MISSING-01', description: 'Missing intent (only space provided)', body: JSON.stringify({ space: { space_type: 'office' } }) },
    { id: 'MISSING-02', description: 'Missing space (only intent provided)', body: JSON.stringify({ intent: { business_type: 'retail' } }) },
    { id: 'MISSING-03', description: 'Space missing space_type', body: JSON.stringify({ space: { id: 's1' }, intent: { business_type: 'retail' } }) },
    { id: 'MISSING-04', description: 'Intent missing business_type', body: JSON.stringify({ space: { space_type: 'office' }, intent: { id: 'i1' } }) },
    { id: 'MISSING-05', description: 'Persisted schema missing tenantIntentId', body: JSON.stringify({ leaseSpaceId: 'space-1' }) },
    { id: 'MISSING-06', description: 'Persisted schema missing leaseSpaceId', body: JSON.stringify({ tenantIntentId: 'intent-1' }) },
    { id: 'MISSING-07', description: 'Both persisted IDs empty strings', body: JSON.stringify({ leaseSpaceId: '', tenantIntentId: '' }) },
    { id: 'MISSING-08', description: 'Space and intent both null', body: JSON.stringify({ space: null, intent: null }) },

    // 5. Type mismatch / Hostile payload structures
    { id: 'TYPEMISMATCH-01', description: 'Persisted IDs are arrays instead of strings', body: JSON.stringify({ leaseSpaceId: ['s1'], tenantIntentId: ['i1'] }) },
    { id: 'TYPEMISMATCH-02', description: 'Persisted IDs are numbers instead of strings', body: JSON.stringify({ leaseSpaceId: 9999, tenantIntentId: 8888 }) },
    { id: 'TYPEMISMATCH-03', description: 'Persisted IDs are objects instead of strings', body: JSON.stringify({ leaseSpaceId: {}, tenantIntentId: {} }) },
    { id: 'TYPEMISMATCH-04', description: 'Space space_type is boolean', body: JSON.stringify({ space: { space_type: true }, intent: { business_type: 'retail' } }) },
    { id: 'TYPEMISMATCH-05', description: 'Intent business_type is null', body: JSON.stringify({ space: { space_type: 'office' }, intent: { business_type: null } }) },
    { id: 'TYPEMISMATCH-06', description: 'Intent preferred_regions is string instead of array', body: JSON.stringify({ space: { space_type: 'office' }, intent: { business_type: 'retail', preferred_regions: 'Gangnam' } }) },
    { id: 'TYPEMISMATCH-07', description: 'Space restrictions is string instead of array', body: JSON.stringify({ space: { space_type: 'office', restrictions: 'none' }, intent: { business_type: 'retail' } }) },
    { id: 'TYPEMISMATCH-08', description: 'Space area_sqm is null (expected number | string | undefined)', body: JSON.stringify({ space: { space_type: 'office', area_sqm: null }, intent: { business_type: 'retail' } }) },
    { id: 'TYPEMISMATCH-09', description: 'Space area_sqm is NaN-producing string', body: JSON.stringify({ space: { space_type: 'office', area_sqm: 'not-a-number' }, intent: { business_type: 'retail' } }) },
    { id: 'TYPEMISMATCH-10', description: 'Negative values in numeric fields', body: JSON.stringify({ space: { space_type: 'office', deposit: -1000, monthly_rent: -500 }, intent: { business_type: 'retail' } }) },

    // 6. Security, Injection & Boundary stress
    { id: 'SECURITY-01', description: 'SQL injection payload in space fields', body: JSON.stringify({ space: { space_type: "office'; DROP TABLE lease_spaces; --", fit_summary: "test" }, intent: { business_type: 'retail' } }) },
    { id: 'SECURITY-02', description: 'XSS script tag in summaries', body: JSON.stringify({ space: { space_type: 'office', fit_summary: "<script>alert('xss')</script>" }, intent: { business_type: 'retail' } }) },
    { id: 'SECURITY-03', description: 'Prototype pollution payload', body: JSON.stringify({ __proto__: { admin: true }, space: { space_type: 'office' }, intent: { business_type: 'retail' } }) },
    { id: 'SECURITY-04', description: 'Deeply nested arbitrary object', body: JSON.stringify({ a: { b: { c: { d: { e: { f: 123 } } } } } }) },
    { id: 'SECURITY-05', description: '100KB large string payload', body: JSON.stringify({ space: { space_type: 'office', fit_summary: 'X'.repeat(100000) }, intent: { business_type: 'retail' } }) },

    // 7. Persisted record not found (should return 404, NOT 500)
    { id: 'NOTFOUND-01', description: 'Valid persisted UUIDs that do not exist in DB', body: JSON.stringify({ leaseSpaceId: '00000000-0000-0000-0000-000000000001', tenantIntentId: '00000000-0000-0000-0000-000000000002' }) },
  ];

  console.log('================================================================');
  console.log(`RUNNING ADVERSARIAL STRESS SUITE: ${testCases.length} ATTACK VECTORS`);
  console.log('ENDPOINT: POST /api/broker/lease-match');
  console.log('OBJECTIVE: Zero HTTP 500 crashes, robust error handling');
  console.log('================================================================\n');

  let passedCount = 0;
  let serverCrashCount = 0;

  for (const tc of testCases) {
    try {
      const req = new NextRequest('http://localhost:3000/api/broker/lease-match', {
        method: 'POST',
        headers: {
          'Content-Type': tc.contentType || 'application/json',
          'Authorization': 'Bearer test-token-001',
        },
        body: tc.body,
      });

      const res = await leaseMatchPost(req);
      const status = res.status;
      let bodyText = '';
      try {
        const json = await res.json();
        bodyText = JSON.stringify(json);
      } catch {
        bodyText = await res.text().catch(() => '<no body>');
      }

      if (status === 500) {
        serverCrashCount++;
        console.error(`❌ [CRASH 500] [${tc.id}] ${tc.description}`);
        console.error(`   Response: ${bodyText}\n`);
      } else {
        passedCount++;
        const statusLabel = status >= 200 && status < 300 ? '2xx OK' : status === 400 ? '400 Bad Request' : status === 404 ? '404 Not Found' : `${status}`;
        console.log(`✅ [PASS] [${tc.id}] (${statusLabel}) ${tc.description}`);
      }
    } catch (err: any) {
      serverCrashCount++;
      console.error(`💥 [UNCAUGHT EXCEPTION] [${tc.id}] ${tc.description}:`, err?.message || err);
    }
  }

  console.log('\n================================================================');
  console.log('EXTENDED ADVERSARIAL STRESS TEST SUMMARY');
  console.log('================================================================');
  console.log(`Total Attack Vectors: ${testCases.length}`);
  console.log(`Passed (Handled Gracefully, No 500): ${passedCount}`);
  console.log(`Server Crashes (HTTP 500 / Uncaught): ${serverCrashCount}`);
  console.log('================================================================');

  if (serverCrashCount > 0) {
    process.exit(1);
  }
}

runAdversarialStress().catch((err) => {
  console.error('Fatal stress suite failure:', err);
  process.exit(1);
});
