/**
 * @file src/tests/foundations/readbuilding-no-write.test.ts
 * @description P0.5 Foundation Automated Verification Suite:
 * 1. Static Analysis: Verify public GET routes never import or invoke `readWithMigration`.
 * 2. Static Analysis: Verify pure `readBuilding` executes strictly SELECT queries with zero DB mutations.
 * 3. Runtime Unit Test: Verify `readBuilding` executes only SELECTs and zero writes on invocation.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §1.3, §5.1, WP-P05-02
 * - ORIGINAL_REQUEST.md (§ 2026-10-27T04:28:40Z)
 * - PROJECT.md (Milestone 1, Feature 7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('P0.5 Foundation Verification: Pure readBuilding() vs readWithMigration()', () => {
  const publicRoutes = [
    'src/app/(public)/dc/[id]/page.tsx',
    'src/app/api/og/deal/[id]/kakao/route.tsx',
    'src/app/api/og/deal/[id]/route.tsx',
    'src/app/api/public/im-lite/[buildingId]/route.ts',
    'src/app/api/public/im-lite/[buildingId]/pptx/route.ts',
    'src/app/api/public/im-lite/[buildingId]/views/route.ts',
  ];

  describe('Static Analysis: Public GET Routes Must Never Use readWithMigration', () => {
    publicRoutes.forEach((routeRelPath) => {
      it(`route ${routeRelPath} does not import readWithMigration`, () => {
        const fullPath = path.resolve(process.cwd(), routeRelPath);
        if (!fs.existsSync(fullPath)) {
          // Route doesn't exist, skip
          return;
        }

        const content = fs.readFileSync(fullPath, 'utf8');

        // Check for import of readWithMigration
        const hasImport =
          /import\s*\{[^}]*readWithMigration[^}]*\}\s*from/m.test(content) ||
          /readWithMigration\s*\(/m.test(content);

        expect(
          hasImport,
          `Security violation: ${routeRelPath} imports or calls readWithMigration! Public routes must use pure readBuilding().`
        ).toBe(false);
      });
    });

    it('public routes use pure readBuilding instead of readWithMigration', () => {
      const kakaoOgPath = path.resolve(process.cwd(), 'src/app/api/og/deal/[id]/kakao/route.tsx');
      if (fs.existsSync(kakaoOgPath)) {
        const content = fs.readFileSync(kakaoOgPath, 'utf8');
        expect(content).not.toContain('readWithMigration');
        expect(content).toContain('readBuilding');
      }
    });
  });

  describe('Static Analysis: readBuilding Implementation Purity', () => {
    it('readBuilding source code contains zero mutation calls (upsert, delete, insert, update)', () => {
      const candidates = [
        path.resolve(process.cwd(), 'src/domain/building/im-core/read-building.ts'),
        path.resolve(process.cwd(), 'src/domain/im-core/facts/read-building.ts'),
        path.resolve(process.cwd(), 'src/lib/read-building.ts'),
      ];

      const existingPath = candidates.find((p) => fs.existsSync(p));
      expect(
        existingPath,
        `Expected readBuilding implementation file to exist at one of: ${candidates.join(', ')}`
      ).toBeDefined();

      if (existingPath) {
        const content = fs.readFileSync(existingPath, 'utf8');

        // Verify zero mutations
        expect(content).not.toMatch(/\.upsert\s*\(/);
        expect(content).not.toMatch(/\.delete\s*\(/);
        expect(content).not.toMatch(/\.insert\s*\(/);
        expect(content).not.toMatch(/\.update\s*\(/);

        // Verify SELECT is present
        expect(content).toMatch(/\.select\s*\(/);

        // Verify React.cache wrapping
        expect(content).toMatch(/cache\s*\(/);
      }
    });
  });

  describe('Runtime Unit Test: readBuilding Database Interaction Purity', () => {
    it('readBuilding executes strictly SELECTs and zero writes', async () => {
      const candidates = [
        '@/domain/building/im-core/read-building',
        '@/domain/im-core/facts/read-building',
        '@/lib/read-building',
      ];

      let readBuildingFn: any = null;
      for (const modPath of candidates) {
        try {
          const mod = await import(/* @vite-ignore */ modPath);
          if (mod?.readBuilding) {
            readBuildingFn = mod.readBuilding;
            break;
          }
        } catch {
          // continue
        }
      }

      expect(
        readBuildingFn,
        'readBuilding function must be exported from @/domain/building/im-core/read-building'
      ).toBeTruthy();

      // Spy on database operations
      const operations: string[] = [];

      const mockSupabase = {
        from: vi.fn((table: string) => {
          operations.push(`FROM:${table}`);
          return {
            select: vi.fn((cols: string) => {
              operations.push(`SELECT:${table}:${cols}`);
              return {
                eq: vi.fn((col: string, val: string) => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: val,
                      name: '테스트 빌딩',
                      address: '서울시 강남구 테헤란로',
                      raw_register: {},
                      attrs: { areaSignal: '강남구' },
                    },
                    error: null,
                  }),
                  single: vi.fn().mockResolvedValue({
                    data: { id: val },
                    error: null,
                  }),
                })),
              };
            }),
            insert: vi.fn(() => {
              operations.push('MUTATION:INSERT');
              return { select: vi.fn() };
            }),
            upsert: vi.fn(() => {
              operations.push('MUTATION:UPSERT');
              return { select: vi.fn() };
            }),
            delete: vi.fn(() => {
              operations.push('MUTATION:DELETE');
              return { eq: vi.fn() };
            }),
            update: vi.fn(() => {
              operations.push('MUTATION:UPDATE');
              return { eq: vi.fn() };
            }),
          };
        }),
      };

      if (readBuildingFn) {
        // Test invocation with mock client (supporting client or supabase options)
        const result = await readBuildingFn('bld-test-999', { client: mockSupabase, supabase: mockSupabase });

        // Assert operations contain NO mutations
        const mutations = operations.filter((op) => op.startsWith('MUTATION:'));
        expect(mutations).toEqual([]);

        // Assert select operations occurred
        const selects = operations.filter((op) => op.startsWith('SELECT:'));
        expect(selects.length).toBeGreaterThanOrEqual(1);

        expect(result).toBeDefined();
      }
    });

    it('readBuilding returns null safely for non-existent building ID with zero side-effects', async () => {
      let readBuildingFn: any = null;
      try {
        const mod = await import(/* @vite-ignore */ '@/domain/building/im-core/read-building');
        readBuildingFn = mod?.readBuilding;
      } catch {
        // Handled in previous test
      }

      expect(
        readBuildingFn,
        'readBuilding must be exported from @/domain/building/im-core/read-building'
      ).toBeTruthy();

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
          insert: vi.fn(),
          upsert: vi.fn(),
          delete: vi.fn(),
          update: vi.fn(),
        })),
      };

      const result = await readBuildingFn('non-existent-id', { client: mockSupabase, supabase: mockSupabase });
      expect(result).toBeNull();
      // Queries building_ssot_lite first, then falls back to assets (both pure SELECTs)
      expect(mockSupabase.from).toHaveBeenCalledTimes(2);
    });
  });
});
