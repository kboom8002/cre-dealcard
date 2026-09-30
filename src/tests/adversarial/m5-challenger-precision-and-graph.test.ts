/**
 * @file m5-challenger-precision-and-graph.test.ts
 * @description Adversarial stress challenge for Milestone 5:
 * 1. Financial precision boundaries: exact KRW sub-unit preservation in ssot-to-im-bridge.ts and financial-calculator.ts.
 * 2. Complete circular dependency cycle detection across the domain module graph.
 * 3. Architecture boundary reverse-import governance check.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import ts from 'typescript';

import { bridgeDealCardToIM } from '@/domain/building/mobile-im/ssot-to-im-bridge';
import {
  FinancialCalculator,
  calculateFinancials,
  type FinancialInputs,
} from '@/domain/building/im-core/financial-calculator';
import { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import {
  scanDomainReverseImports,
  scanTransitiveDomainImports,
} from '@/tests/governance/architecture-boundaries.test';

describe('Adversarial Challenge: KRW Sub-Unit Precision Preservation', () => {
  it('ssot-to-im-bridge: preserves exact sub-unit KRW values without manwon rounding in supplemental', () => {
    const testCases = [
      { rawKrw: 21_543_219, expectedManwonRound: 2154 },
      { rawKrw: 1, expectedManwonRound: 0 },
      { rawKrw: 99_999_999, expectedManwonRound: 10000 },
      { rawKrw: 12_345_678, expectedManwonRound: 1235 },
      { rawKrw: 5_000_000, expectedManwonRound: 500 },
    ];

    for (const { rawKrw, expectedManwonRound } of testCases) {
      const output = bridgeDealCardToIM({
        ssot: {
          lease_summary: {
            monthly_rent_total_krw: rawKrw,
          },
        },
      });

      // Supplemental must strictly preserve exact won precision
      expect(output.supplemental.monthly_rent_total_krw).toBe(rawKrw);
      if (rawKrw % 10000 !== 0) {
        expect(output.supplemental.monthly_rent_total_krw).not.toBe(expectedManwonRound * 10000);
      }

      // Pre-fill data in manwon can round for human input display, but supplemental retains exact won
      expect(output.prefillData.monthlyRent).toBe(expectedManwonRound);
    }
  });

  it('financial-calculator: preserves exact sub-unit KRW in annualGross, NOI, and ClaimRegistry', () => {
    const exactMonthlyRentKrw = 21_543_219;
    const exactPurchasePriceKrw = 11_543_210_987;

    const registry = new ClaimRegistry();
    const calculator = new FinancialCalculator(registry, '2026-09-30');

    const inputs: FinancialInputs = {
      posture: 'income',
      monthlyRentKrw: exactMonthlyRentKrw,
      purchasePriceKrw: exactPurchasePriceKrw,
      opexRatioPct: 15,
      vacancyRatePct: 5,
    };

    const { claims, outputs, violations } = calculator.calculate(inputs);

    // 1. Output NOI arithmetic verification (exact won calculation)
    const expectedAnnualGross = exactMonthlyRentKrw * 12; // 258_518_628
    expect(expectedAnnualGross).toBe(258_518_628);

    // NOI base = annualGross * (1 - 0.05) - annualGross * 0.15 = 258_518_628 * 0.80 = 206_814_902.4 -> 206_814_902
    const expectedEffectiveOpex = expectedAnnualGross * 0.15; // 38_777_794.2
    const expectedNoiBase = Math.round(expectedAnnualGross * (1 - 0.05) - expectedEffectiveOpex);
    expect(outputs.annualNoi.base).toBe(expectedNoiBase);

    // If it had been rounded to manwon (2154만 * 10000 = 215_400_000):
    const degradedAnnualGross = 2154 * 10000 * 12; // 258_480_000
    const degradedNoiBase = Math.round(degradedAnnualGross * (1 - 0.05) - degradedAnnualGross * 0.15);
    // Confirm that our outputs did NOT suffer precision loss from manwon truncation
    expect(outputs.annualNoi.base).not.toBe(degradedNoiBase);
    expect(Math.abs(outputs.annualNoi.base - degradedNoiBase)).toBeGreaterThan(20000);

    // 2. ClaimRegistry verification
    const rentClaim = claims.find(c => c.subject === 'monthly_rent_total');
    expect(rentClaim).toBeDefined();
    expect(rentClaim?.value).toBe(exactMonthlyRentKrw);
    expect(rentClaim?.unit).toBe('원/월');

    const priceClaim = claims.find(c => c.subject === 'asking_price');
    expect(priceClaim).toBeDefined();
    expect(priceClaim?.value).toBe(exactPurchasePriceKrw);
    expect(priceClaim?.unit).toBe('원');

    const noiClaim = claims.find(c => c.subject === 'noi_base');
    expect(noiClaim).toBeDefined();
    expect(noiClaim?.value).toBe(expectedNoiBase);
  });

  it('calculateFinancials handles non-integer or exact won values across all postures without NaN', () => {
    const postures = ['income', 'development', 'operating', 'owner_occupied', 'trading'] as const;

    for (const posture of postures) {
      const result = calculateFinancials({
        posture,
        purchasePriceKrw: 8_765_432_109,
        monthlyRentKrw: 17_654_321,
        totalAreaSqm: 1234.56,
        platAreaSqm: 567.89,
        devProfitMarginPct: 12.34,
        annualRevenueKrw: 321_654_987,
        gopMarginPct: 34.5,
        adrKrw: 123_456,
        occPct: 78.9,
      });

      expect(result).toBeDefined();
      if (result.pricePerSqm !== null) {
        expect(Number.isFinite(result.pricePerSqm)).toBe(true);
        expect(Number.isNaN(result.pricePerSqm)).toBe(false);
      }
      if (result.pricePerPyeong !== null) {
        expect(Number.isFinite(result.pricePerPyeong)).toBe(true);
        expect(Number.isNaN(result.pricePerPyeong)).toBe(false);
      }
      if (result.annualNoi?.base !== undefined) {
        expect(Number.isFinite(result.annualNoi.base)).toBe(true);
      }
    }
  });
});

describe('Adversarial Challenge: Module Dependency Graph & Circular Dependency Cycle Detection', () => {
  const projectRoot = process.cwd();
  const domainDir = path.resolve(projectRoot, 'src/domain');

  function getAllTsFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAllTsFiles(fullPath));
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        results.push(fullPath);
      }
    }
    return results;
  }

  function resolveModulePath(fromFile: string, specifier: string): string | null {
    const candidates = (base: string) => [
      base + '.ts',
      base + '.tsx',
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ];

    let targetBase: string | null = null;
    if (specifier.startsWith('.')) {
      targetBase = path.resolve(path.dirname(fromFile), specifier);
    } else if (specifier.startsWith('@/')) {
      targetBase = path.resolve(projectRoot, 'src', specifier.slice(2));
    }

    if (targetBase) {
      for (const c of candidates(targetBase)) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          return c;
        }
      }
    }
    return null;
  }

  function extractImports(filePath: string): string[] {
    const code = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
    const imports: string[] = [];

    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push(node.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push(node.moduleSpecifier.text);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return imports;
  }

  it('builds full dependency graph across src/domain and detects EXACTLY 0 circular dependency cycles', () => {
    const files = getAllTsFiles(domainDir);
    expect(files.length).toBeGreaterThan(30);

    // Adjacency list: file -> array of imported files
    const graph = new Map<string, string[]>();

    for (const file of files) {
      const normalizedFile = path.resolve(file).replace(/\\/g, '/');
      const importSpecifiers = extractImports(file);
      const resolvedDeps: string[] = [];

      for (const spec of importSpecifiers) {
        const resolved = resolveModulePath(file, spec);
        if (resolved && resolved.startsWith(path.resolve(projectRoot, 'src').replace(/\\/g, '/'))) {
          resolvedDeps.push(path.resolve(resolved).replace(/\\/g, '/'));
        }
      }

      graph.set(normalizedFile, resolvedDeps);
    }

    // Cycle detection via DFS with recursion stack
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycles: string[][] = [];

    function dfs(node: string, currentPath: string[]) {
      visited.add(node);
      recStack.add(node);
      currentPath.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...currentPath]);
        } else if (recStack.has(neighbor)) {
          // Cycle found!
          const cycleStartIndex = currentPath.indexOf(neighbor);
          const cycle = currentPath.slice(cycleStartIndex).concat(neighbor);
          cycles.push(cycle);
        }
      }

      recStack.delete(node);
    }

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    if (cycles.length > 0) {
      console.error('Circular dependency cycles found:', cycles);
    }

    // 단언: 발견된 순환 의존성 사이클이 정확히 0건이어야 함
    expect(cycles).toEqual([]);
    expect(cycles.length).toBe(0);
  });

  it('verifies im-core domain has EXACTLY 0 reverse or transitive reverse dependencies', () => {
    const imCoreDir = path.resolve(projectRoot, 'src/domain/building/im-core');
    const directViolations = scanDomainReverseImports(imCoreDir);
    expect(directViolations).toEqual([]);
    expect(directViolations.length).toBe(0);

    const transitiveViolations = scanTransitiveDomainImports(imCoreDir, projectRoot);
    expect(transitiveViolations).toEqual([]);
    expect(transitiveViolations.length).toBe(0);
  });
});
