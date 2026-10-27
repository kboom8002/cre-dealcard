/**
 * @file src/tests/adversarial/m1-backend-security-stress.test.ts
 * @description Empirical Challenger Milestone 1 Adversarial Stress Test Suite:
 * 1. Jobs v2 idempotency hashing: deeply nested dictionaries (depth 100+), array ordering,
 *    null/undefined properties, numeric string vs number keys, avalanche effect, and JSON serialization nuances.
 * 2. Feature flags tamper resistance: attempt client body overrides, query string injections,
 *    toxic cookies (%ZZ, truncated UTF-8, DoS vectors), and delimiter extremes.
 * 3. readBuilding query purity: non-existent IDs, SQLi strings, malformed types,
 *    and TypeScript AST mutation scan ensuring zero write operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ts from 'typescript';
import fs from 'fs';
import path from 'path';

describe('Adversarial Stress Test: Milestone 1 Backend & Security', () => {

  /* =========================================================================
   * SECTION 1: Jobs v2 Idempotency Hashing Stress Test
   * ========================================================================= */
  describe('1. Jobs v2 Idempotency Hashing Stress Tests', () => {
    it('handles deeply nested dictionaries (depth 100) with scrambled keys deterministically', async () => {
      const { canonicalizeJson, computeIdempotencyHash } = await import('@/lib/jobs/idempotency');

      // Construct a 100-level deep dictionary
      const DEPTH = 100;
      let deepObjA: any = { leaf: 'target-data', status: 'active', count: 42 };
      let deepObjB: any = { count: 42, status: 'active', leaf: 'target-data' };

      for (let i = DEPTH; i >= 1; i--) {
        deepObjA = {
          [`layer_${i}_z`]: `val_z_${i}`,
          [`layer_${i}_child`]: deepObjA,
          [`layer_${i}_a`]: `val_a_${i}`,
          [`layer_${i}_m`]: `val_m_${i}`,
        };
        // Reverse key insertion order for B
        deepObjB = {
          [`layer_${i}_m`]: `val_m_${i}`,
          [`layer_${i}_a`]: `val_a_${i}`,
          [`layer_${i}_child`]: deepObjB,
          [`layer_${i}_z`]: `val_z_${i}`,
        };
      }

      const canonicalA = canonicalizeJson(deepObjA);
      const canonicalB = canonicalizeJson(deepObjB);
      expect(canonicalA).toBe(canonicalB);

      const hashA = computeIdempotencyHash({ buildingId: 'bld-deep-stress', input: deepObjA });
      const hashB = computeIdempotencyHash({ buildingId: 'bld-deep-stress', input: deepObjB });
      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    });

    it('avalanche effect: deep leaf modification at depth 100 causes complete hash divergence', async () => {
      const { computeIdempotencyHash } = await import('@/lib/jobs/idempotency');

      const DEPTH = 100;
      let deepObj1: any = { leaf: 42 };
      let deepObj2: any = { leaf: 43 }; // 1-bit difference at innermost leaf

      for (let i = DEPTH; i >= 1; i--) {
        deepObj1 = { nest: deepObj1, step: i };
        deepObj2 = { nest: deepObj2, step: i };
      }

      const hash1 = computeIdempotencyHash({ buildingId: 'bld-avalanche', input: deepObj1 });
      const hash2 = computeIdempotencyHash({ buildingId: 'bld-avalanche', input: deepObj2 });

      expect(hash1).not.toBe(hash2);
    });

    it('array ordering: preserves sequential array order but canonicalizes objects within arrays', async () => {
      const { canonicalizeJson, computeIdempotencyHash } = await import('@/lib/jobs/idempotency');

      // 1. Array order difference MUST produce different hashes
      const seq1 = [1, 2, 3, 4, 5];
      const seq2 = [5, 4, 3, 2, 1];
      expect(canonicalizeJson(seq1)).not.toBe(canonicalizeJson(seq2));
      expect(
        computeIdempotencyHash({ buildingId: 'bld-arr', input: seq1 })
      ).not.toBe(
        computeIdempotencyHash({ buildingId: 'bld-arr', input: seq2 })
      );

      // 2. Nested sub-arrays: [[1, 2], [3, 4]] vs [[1, 2], [4, 3]]
      const nestedArr1 = [[1, 2], [3, 4]];
      const nestedArr2 = [[1, 2], [4, 3]];
      expect(canonicalizeJson(nestedArr1)).not.toBe(canonicalizeJson(nestedArr2));

      // 3. Array of objects with unordered keys MUST canonicalize to identical hash
      const arrOfObjs1 = [
        { z: 1, a: 2, inner: { k2: 'v2', k1: 'v1' } },
        { floor: 'B1', rent: 500, tenant: 'CU' },
      ];
      const arrOfObjs2 = [
        { inner: { k1: 'v1', k2: 'v2' }, a: 2, z: 1 },
        { tenant: 'CU', rent: 500, floor: 'B1' },
      ];
      expect(canonicalizeJson(arrOfObjs1)).toBe(canonicalizeJson(arrOfObjs2));
      expect(
        computeIdempotencyHash({ buildingId: 'bld-arr-obj', input: arrOfObjs1 })
      ).toBe(
        computeIdempotencyHash({ buildingId: 'bld-arr-obj', input: arrOfObjs2 })
      );
    });

    it('null vs undefined properties: tests canonicalization and hash behavior', async () => {
      const { canonicalizeJson, computeIdempotencyHash } = await import('@/lib/jobs/idempotency');

      // Top-level null vs undefined
      expect(canonicalizeJson(null)).toBe('null');
      expect(canonicalizeJson(undefined)).toBe('null');

      // In objects: { a: null } vs { a: undefined }
      const objWithNull = { a: null, b: 1 };
      const objWithUndef = { a: undefined, b: 1 };
      expect(canonicalizeJson(objWithNull)).toBe('{"a":null,"b":1}');
      expect(canonicalizeJson(objWithUndef)).toBe('{"a":null,"b":1}');
      expect(
        computeIdempotencyHash({ buildingId: 'bld-null', input: objWithNull })
      ).toBe(
        computeIdempotencyHash({ buildingId: 'bld-null', input: objWithUndef })
      );

      // Nuance check: in raw JS memory, { a: undefined } has key 'a' while {} has no key
      // canonicalizeJson({ a: undefined }) === '{"a":null}'
      // canonicalizeJson({}) === '{}'
      expect(canonicalizeJson({ a: undefined })).toBe('{"a":null}');
      expect(canonicalizeJson({})).toBe('{}');

      // However, after HTTP wire transmission (JSON.parse(JSON.stringify(input))),
      // undefined properties are stripped by JSON serialization standard
      const wireObj = JSON.parse(JSON.stringify({ a: undefined }));
      expect(canonicalizeJson(wireObj)).toBe('{}');

      // Primitive null vs string "null"
      const objNullVal = { a: null };
      const objStringNull = { a: 'null' };
      expect(canonicalizeJson(objNullVal)).toBe('{"a":null}');
      expect(canonicalizeJson(objStringNull)).toBe('{"a":"null"}');
      expect(
        computeIdempotencyHash({ buildingId: 'bld-null-str', input: objNullVal })
      ).not.toBe(
        computeIdempotencyHash({ buildingId: 'bld-null-str', input: objStringNull })
      );

      // Primitive undefined vs string "undefined"
      const objUndefVal = { a: undefined };
      const objStringUndef = { a: 'undefined' };
      expect(canonicalizeJson(objUndefVal)).toBe('{"a":null}');
      expect(canonicalizeJson(objStringUndef)).toBe('{"a":"undefined"}');
      expect(
        computeIdempotencyHash({ buildingId: 'bld-undef-str', input: objUndefVal })
      ).not.toBe(
        computeIdempotencyHash({ buildingId: 'bld-undef-str', input: objStringUndef })
      );

      // Arrays: [null] vs [undefined]
      expect(canonicalizeJson([null])).toBe('[null]');
      expect(canonicalizeJson([undefined])).toBe('[null]');
    });

    it('numeric string vs number keys and values: verifies JS key sorting and value differentiation', async () => {
      const { canonicalizeJson, computeIdempotencyHash } = await import('@/lib/jobs/idempotency');

      // 1. Numeric keys vs String numeric keys in objects
      // In JS, object keys are automatically converted to strings
      const objNumKeys = { 1: 'one', 2: 'two' };
      const objStrKeys = { '1': 'one', '2': 'two' };
      expect(canonicalizeJson(objNumKeys)).toBe(canonicalizeJson(objStrKeys));
      expect(
        computeIdempotencyHash({ buildingId: 'bld-keys', input: objNumKeys })
      ).toBe(
        computeIdempotencyHash({ buildingId: 'bld-keys', input: objStrKeys })
      );

      // 2. Lexicographical key sorting of numeric keys: '10' comes before '2'
      const objOrderA = { 10: 'ten', 2: 'two' };
      const objOrderB = { 2: 'two', 10: 'ten' };
      expect(canonicalizeJson(objOrderA)).toBe('{"10":"ten","2":"two"}');
      expect(canonicalizeJson(objOrderB)).toBe('{"10":"ten","2":"two"}');
      expect(
        computeIdempotencyHash({ buildingId: 'bld-num-sort', input: objOrderA })
      ).toBe(
        computeIdempotencyHash({ buildingId: 'bld-num-sort', input: objOrderB })
      );

      // 3. Values: Number value 100 vs String value "100" MUST produce different hashes
      const valNum = { id: 100 };
      const valStr = { id: '100' };
      expect(canonicalizeJson(valNum)).toBe('{"id":100}');
      expect(canonicalizeJson(valStr)).toBe('{"id":"100"}');
      expect(
        computeIdempotencyHash({ buildingId: 'bld-val-type', input: valNum })
      ).not.toBe(
        computeIdempotencyHash({ buildingId: 'bld-val-type', input: valStr })
      );

      // 4. Special numeric values: NaN, Infinity, -Infinity (JSON stringify maps to null)
      const objNaN = { val: NaN };
      const objInf = { val: Infinity };
      expect(canonicalizeJson(objNaN)).toBe('{"val":null}');
      expect(canonicalizeJson(objInf)).toBe('{"val":null}');
    });

    it('stress: broad dictionary with 1,000 keys canonicalizes quickly and deterministically', async () => {
      const { canonicalizeJson, computeIdempotencyHash } = await import('@/lib/jobs/idempotency');

      const broadObjA: Record<string, number> = {};
      const broadObjB: Record<string, number> = {};

      for (let i = 0; i < 1000; i++) {
        const key = `key_${(i * 37) % 1000}`;
        broadObjA[key] = i;
      }
      for (let i = 999; i >= 0; i--) {
        const key = `key_${(i * 37) % 1000}`;
        broadObjB[key] = i;
      }

      const start = performance.now();
      const hashA = computeIdempotencyHash({ buildingId: 'bld-broad', input: broadObjA });
      const hashB = computeIdempotencyHash({ buildingId: 'bld-broad', input: broadObjB });
      const duration = performance.now() - start;

      expect(hashA).toBe(hashB);
      expect(duration).toBeLessThan(100); // Must be fast (< 100ms for 1000 keys)
    });
  });


  /* =========================================================================
   * SECTION 2: Feature Flags Tamper Resistance Stress Test
   * ========================================================================= */
  describe('2. Feature Flags Tamper Resistance Stress Tests', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.FF_WS_SHELL;
      delete process.env.WS_SHELL;
      delete process.env.FF_QUICK_IM;
      delete process.env.QUICK_IM;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('tamper test: client body parameters cannot override flags under any circumstance', async () => {
      const { getServerFeatureFlag } = await import('@/lib/flags');

      const maliciousPayloads = [
        { ws_shell: true },
        { flags: { ws_shell: true, quick_im: true } },
        { ff_ws: 'true' },
        { quick_im: true },
        { query: { ws_shell: 'true' } },
        { headers: { ff_ws: 'true' } }, // body.headers fake injection
      ];

      for (const payload of maliciousPayloads) {
        const fakeContext = {
          body: payload,
          payload,
          requestHeaders: new Headers(), // empty legitimate headers
        } as any;

        const isEnabled = await getServerFeatureFlag('ws_shell', fakeContext);
        expect(isEnabled).toBe(false);

        const quickImEnabled = await getServerFeatureFlag('quick_im', fakeContext);
        expect(quickImEnabled).toBe(false);
      }
    });

    it('tamper test: prototype pollution in context or body does not leak or flip flags', async () => {
      const { getServerFeatureFlag } = await import('@/lib/flags');

      const pollutedContext: any = JSON.parse(
        '{"__proto__": {"ws_shell": true, "quick_im": true}}'
      );

      const isWsShell = await getServerFeatureFlag('ws_shell', pollutedContext);
      expect(isWsShell).toBe(false);

      const isQuickIm = await getServerFeatureFlag('quick_im', pollutedContext);
      expect(isQuickIm).toBe(false);
    });

    it('tamper test: URL query string parameters cannot override server feature flags', async () => {
      const { getServerFeatureFlag } = await import('@/lib/flags');

      // An attacker appends ?ff_ws=true or ?flag_ws_shell=true to the URL
      const attackUrls = [
        'https://cre-dealcard.vercel.app/broker/w/dealcards?ff_ws=true',
        'https://cre-dealcard.vercel.app/api/broker/im-lite/generate?quick_im=true',
        'https://cre-dealcard.vercel.app/broker?flags[ws_shell]=true',
      ];

      for (const urlStr of attackUrls) {
        const url = new URL(urlStr);
        const searchParams = url.searchParams;

        // Passing searchParams or query inside context
        const context = {
          query: Object.fromEntries(searchParams.entries()),
          searchParams,
          requestHeaders: new Headers(),
        } as any;

        const flagVal = await getServerFeatureFlag('ws_shell', context);
        expect(flagVal).toBe(false);
      }
    });

    it('toxic cookies vulnerability: demonstrates unhandled URIError on malformed percent-encoding (%ZZ, %, truncated UTF-8)', async () => {
      const { getServerFeatureFlag, getSyncFeatureFlag } = await import('@/lib/flags');

      // Malformed cookie payloads that trigger URIError in decodeURIComponent
      const malformedCookies = [
        'tracking=%ZZ',
        'ff_ws=%',
        'ff_ws=%E0%A4', // Truncated UTF-8 byte sequence
        'malformed=%80; ff_ws=quick_im', // Invalid leading byte in UTF-8
        'broken=%FF%FE%FD',
      ];

      for (const cookieStr of malformedCookies) {
        // Empirically verify that decodeURIComponent in parseCookieHeader throws URIError
        await expect(
          getServerFeatureFlag('ws_shell', { cookieString: cookieStr })
        ).rejects.toThrow(URIError);

        expect(() => {
          getSyncFeatureFlag('ws_shell', cookieStr);
        }).toThrow(URIError);
      }
    });

    it('extreme cookie inputs: handles large cookie strings and repeated delimiters safely when encoded properly', async () => {
      const { getServerFeatureFlag, getSyncFeatureFlag } = await import('@/lib/flags');

      const extremeCookies = [
        ';;;;;;;;====;;;;===;',
        '='.repeat(500),
        'ff_ws=' + 'A'.repeat(32768), // 32KB cookie
        'ff_ws=' + encodeURIComponent('ws_shell\x00extra'), // URL-encoded null byte
        'theme=dark; other=normal; ff_ws=ws_shell',
      ];

      for (const cookieString of extremeCookies) {
        // Pass via cookieString or plain record object
        const result = await getServerFeatureFlag('ws_shell', { cookieString });
        expect(typeof result).toBe('boolean');

        const syncResult = getSyncFeatureFlag('ws_shell', cookieString);
        expect(typeof syncResult).toBe('boolean');
      }
    });
  });


  /* =========================================================================
   * SECTION 3: readBuilding Query Purity, Non-Existent IDs & AST Scan
   * ========================================================================= */
  describe('3. readBuilding Safety, Non-Existent IDs & AST Mutation Scan', () => {
    it('safe return: returns null safely on non-existent, malformed, or malicious IDs', async () => {
      const { readBuildingPure } = await import('@/domain/building/im-core/read-building');

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
      };

      const hostileIds = [
        '00000000-0000-0000-0000-000000000000',
        'non-existent-bld-random-987654321',
        '', // empty string
        '   ', // whitespace
        'null',
        'undefined',
        '[object Object]',
        "' OR '1'='1",
        "'; DROP TABLE building_ssot_lite; --",
        "admin'--",
        "1 UNION SELECT * FROM users--",
        'bld-'.repeat(5000), // extreme length string
        null as any,
        undefined as any,
        12345 as any,
        {} as any,
        [] as any,
      ];

      for (const id of hostileIds) {
        const result = await readBuildingPure(id, { client: mockSupabase as any });
        expect(result).toBeNull();
      }
    });

    it('AST mutation scan: statically verifies read-building.ts contains ZERO DB mutation operations', () => {
      const targetFile = path.resolve(process.cwd(), 'src/domain/building/im-core/read-building.ts');
      expect(fs.existsSync(targetFile)).toBe(true);

      const sourceCode = fs.readFileSync(targetFile, 'utf8');
      const sourceFile = ts.createSourceFile(
        'read-building.ts',
        sourceCode,
        ts.ScriptTarget.Latest,
        true
      );

      const FORBIDDEN_MUTATIONS = new Set([
        'insert',
        'update',
        'upsert',
        'delete',
        'rpc',
        'mutate',
        'write',
        'execute',
        'drop',
        'alter',
        'truncate',
      ]);

      const foundMutations: { method: string; line: number }[] = [];

      function visit(node: ts.Node) {
        // Check method calls: obj.mutation(...)
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (ts.isPropertyAccessExpression(expr)) {
            const methodName = expr.name.text;
            if (FORBIDDEN_MUTATIONS.has(methodName)) {
              const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
              foundMutations.push({ method: methodName, line: line + 1 });
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);

      expect(
        foundMutations,
        `AST Mutation Scan Failed! Detected DB mutation methods in read-building.ts: ${JSON.stringify(foundMutations)}`
      ).toEqual([]);
    });

    it('runtime DB interaction: executes strictly SELECT queries with zero writes during concurrent load', async () => {
      const { readBuildingPure } = await import('@/domain/building/im-core/read-building');

      const operations: string[] = [];

      const mockSupabase = {
        from: vi.fn((table: string) => {
          operations.push(`FROM:${table}`);
          return {
            select: vi.fn((cols: string) => {
              operations.push(`SELECT:${table}:${cols}`);
              return {
                eq: vi.fn((col: string, val: string) => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
              };
            }),
            insert: vi.fn(() => {
              operations.push('MUTATION:INSERT');
              return { select: vi.fn() };
            }),
            update: vi.fn(() => {
              operations.push('MUTATION:UPDATE');
              return { eq: vi.fn() };
            }),
            upsert: vi.fn(() => {
              operations.push('MUTATION:UPSERT');
              return { select: vi.fn() };
            }),
            delete: vi.fn(() => {
              operations.push('MUTATION:DELETE');
              return { eq: vi.fn() };
            }),
            rpc: vi.fn(() => {
              operations.push('MUTATION:RPC');
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }),
      };

      // 50 concurrent requests
      const promises = Array.from({ length: 50 }, (_, i) =>
        readBuildingPure(`concurrent-bld-${i}`, { client: mockSupabase as any })
      );

      const results = await Promise.all(promises);

      // Verify all returned null safely
      expect(results.every((r) => r === null)).toBe(true);

      // Verify ZERO mutation calls
      const mutations = operations.filter((op) => op.startsWith('MUTATION:'));
      expect(mutations).toEqual([]);

      // Verify 100 SELECT calls occurred (50 building_ssot_lite + 50 assets fallback)
      const selects = operations.filter((op) => op.startsWith('SELECT:'));
      expect(selects.length).toBe(100);
    });
  });
});
