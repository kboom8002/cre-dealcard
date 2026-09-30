/**
 * architecture-boundaries.test.ts
 *
 * Automated Rule 12 Clean Architecture Boundary Test
 * Spec: .agents/rules/03-im-core-domain.md Rule 12
 *
 * Assertions:
 * 1. im-core is pure domain logic: ZERO reverse imports from presentation/view (mobile-im, pptx).
 * 2. im-core is framework-isolated: ZERO imports from @supabase, next, react, or components/app.
 * 3. Uses TypeScript Compiler API (ts.createSourceFile) for native, reliable AST analysis.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

export interface BoundaryViolation {
  file: string;
  importedModule: string;
  line: number;
}

// Prohibited import patterns into pure domain im-core
const FORBIDDEN_IMPORT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'mobile-im view layer', pattern: /mobile-im/ },
  { name: 'pptx presentation layer', pattern: /(?:^|[\\/])pptx(?:[\\/]|$)/ },
  { name: 'ui components', pattern: /(?:^|[\\/])components(?:[\\/]|$)/ },
  { name: 'application router', pattern: /(?:^|[\\/])app(?:[\\/]|$)/ },
  { name: 'supabase client/auth', pattern: /^@supabase(?:[\\/]|$)/ },
  { name: 'next.js framework', pattern: /^next(?:[\\/]|$)/ },
  { name: 'react framework', pattern: /^react(?:[\\/]|$)/ },
];

/**
 * Checks if an imported module specifier violates pure domain boundaries.
 */
export function isForbiddenImport(moduleSpecifier: string): boolean {
  return FORBIDDEN_IMPORT_PATTERNS.some(({ pattern }) => pattern.test(moduleSpecifier));
}

/**
 * Parses a TypeScript source file into an AST and extracts all boundary violations.
 */
export function scanSourceFileImports(filePath: string, sourceText: string): BoundaryViolation[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );

  const violations: BoundaryViolation[] = [];

  function visit(node: ts.Node) {
    let moduleSpecifier: string | undefined;

    // 1. Static import: import ... from '...'
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      moduleSpecifier = node.moduleSpecifier.text;
    }
    // 2. Export declaration with from: export ... from '...'
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      moduleSpecifier = node.moduleSpecifier.text;
    }
    // 3. Dynamic import() or require()
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length > 0
    ) {
      const firstArg = node.arguments[0];
      if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
        moduleSpecifier = firstArg.text;
      } else if (ts.isTemplateExpression(firstArg)) {
        moduleSpecifier = firstArg.head.text;
      }
    }
    // 4. Type import: import('...').Type
    else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      const literal = node.argument.literal;
      if (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)) {
        moduleSpecifier = literal.text;
      }
    }

    if (moduleSpecifier && isForbiddenImport(moduleSpecifier)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      violations.push({
        file: filePath,
        importedModule: moduleSpecifier,
        line: line + 1,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

/**
 * Recursively retrieves all TypeScript source files in a directory.
 */
export function getFilesRecursively(dir: string, extension = '.ts'): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getFilesRecursively(fullPath, extension));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(extension) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Scans all source files under im-core domain directory for reverse imports.
 */
export function scanDomainReverseImports(domainDir: string): BoundaryViolation[] {
  const files = getFilesRecursively(domainDir, '.ts');
  const allViolations: BoundaryViolation[] = [];

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const fileViolations = scanSourceFileImports(relativePath, code);
    allViolations.push(...fileViolations);
  }

  return allViolations;
}

/**
 * Resolves an internal relative or alias import to an absolute file path.
 */
export function resolveInternalModule(fromFile: string, specifier: string, projectRoot: string = process.cwd()): string | null {
  const tryCandidates = (basePath: string): string | null => {
    const candidates = [
      basePath + '.ts',
      basePath + '.tsx',
      basePath + '.js',
      basePath + '.mjs',
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx'),
      path.join(basePath, 'index.js'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  };

  if (specifier.startsWith('.')) {
    return tryCandidates(path.resolve(path.dirname(fromFile), specifier));
  }
  if (specifier.startsWith('@/')) {
    return tryCandidates(path.resolve(projectRoot, 'src', specifier.slice(2)));
  }
  return null;
}

export interface TransitiveBoundaryViolation {
  chain: string[];
  forbiddenSpecifier: string;
}

/**
 * Scans transitive internal dependencies reachable from im-core to ensure no leaks into presentation or framework.
 */
export function scanTransitiveDomainImports(domainDir: string, projectRoot: string = process.cwd()): TransitiveBoundaryViolation[] {
  const files = getFilesRecursively(domainDir, '.ts');
  const visited = new Set<string>();
  const violations: TransitiveBoundaryViolation[] = [];

  function walk(currentFile: string, chain: string[]) {
    const normalizedPath = path.resolve(currentFile);
    if (visited.has(normalizedPath)) return;
    visited.add(normalizedPath);

    const code = fs.readFileSync(normalizedPath, 'utf-8');
    const relativePath = path.relative(projectRoot, normalizedPath).replace(/\\/g, '/');
    const fileViolations = scanSourceFileImports(relativePath, code);

    for (const v of fileViolations) {
      violations.push({
        chain: [...chain, relativePath],
        forbiddenSpecifier: v.importedModule,
      });
    }

    const sourceFile = ts.createSourceFile(normalizedPath, code, ts.ScriptTarget.Latest, true);

    function visitChild(node: ts.Node) {
      let spec: string | undefined;
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        spec = node.moduleSpecifier.text;
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        spec = node.moduleSpecifier.text;
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          spec = arg.text;
        }
      }

      if (spec) {
        const resolved = resolveInternalModule(normalizedPath, spec, projectRoot);
        if (resolved && !visited.has(path.resolve(resolved))) {
          walk(resolved, [...chain, relativePath]);
        }
      }

      ts.forEachChild(node, visitChild);
    }

    visitChild(sourceFile);
  }

  for (const f of files) {
    walk(f, []);
  }

  return violations;
}

describe('Rule 12 Clean Architecture Boundaries: im-core Domain Isolation', () => {
  const imCoreDir = path.resolve(process.cwd(), 'src/domain/building/im-core');

  it('should verify im-core directory exists and contains domain source files', () => {
    expect(fs.existsSync(imCoreDir)).toBe(true);
    const files = getFilesRecursively(imCoreDir, '.ts');
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('should find EXACTLY 0 reverse imports from im-core into mobile-im or pptx', () => {
    const violations = scanDomainReverseImports(imCoreDir);
    const viewViolations = violations.filter(
      v => v.importedModule.includes('mobile-im') || v.importedModule.includes('pptx')
    );

    if (viewViolations.length > 0) {
      console.error('Reverse view violations detected in im-core:', viewViolations);
    }

    expect(viewViolations).toEqual([]);
    expect(viewViolations).toHaveLength(0);
  });

  it('should find EXACTLY 0 framework imports (@supabase, next, react, components, app) in im-core', () => {
    const violations = scanDomainReverseImports(imCoreDir);
    const frameworkViolations = violations.filter(
      v => !v.importedModule.includes('mobile-im') && !v.importedModule.includes('pptx')
    );

    if (frameworkViolations.length > 0) {
      console.error('Framework violations detected in im-core:', frameworkViolations);
    }

    expect(frameworkViolations).toEqual([]);
    expect(frameworkViolations).toHaveLength(0);
  });

  it('should report total violations as exactly 0 across entire im-core domain tree', () => {
    const violations = scanDomainReverseImports(imCoreDir);
    expect(violations).toHaveLength(0);
    expect(violations).toEqual([]);
  });

  it('should find EXACTLY 0 transitive reverse imports from im-core into presentation or framework', () => {
    const transitiveViolations = scanTransitiveDomainImports(imCoreDir);
    if (transitiveViolations.length > 0) {
      console.error('Transitive violations detected reachable from im-core:', transitiveViolations);
    }
    expect(transitiveViolations).toEqual([]);
    expect(transitiveViolations).toHaveLength(0);
  });

  it('should correctly detect simulated violations in synthetic test source code (negative-check)', () => {
    const syntheticCode = `
      import type { Foo } from '../mobile-im/pptx/imlib';
      import { bar } from '@/domain/building/mobile-im/financials';
      import React, { useState } from 'react';
      import { createClient } from '@supabase/supabase-js';
      import { NextRequest } from 'next/server';
      import { Card } from '@/components/ui/card';
      import { page } from '@/app/page';

      // Allowed imports
      import { ClaimRegistry } from './claim-registry';
      import type { ProvenanceKind } from '@/domain/ontology/provenance';
      import { sqmToPyeong } from '@/lib/utils/area-conversion';
      import { randomUUID } from 'crypto';
    `;

    const detected = scanSourceFileImports('synthetic-test.ts', syntheticCode);

    expect(detected.length).toBe(7);
    const modules = detected.map(d => d.importedModule);
    expect(modules).toContain('../mobile-im/pptx/imlib');
    expect(modules).toContain('@/domain/building/mobile-im/financials');
    expect(modules).toContain('react');
    expect(modules).toContain('@supabase/supabase-js');
    expect(modules).toContain('next/server');
    expect(modules).toContain('@/components/ui/card');
    expect(modules).toContain('@/app/page');
  });

  it('should detect template literal dynamic imports and requires (negative-check)', () => {
    const templateCode = `
      // Dynamic import with template literal
      const m1 = import(\`../mobile-im/foo\`);
      const m2 = import(\`@/domain/building/mobile-im/bar\`);
      // Require with template literal
      const m3 = require(\`react\`);
      const m4 = require(\`@supabase/supabase-js\`);

      // Allowed template literal
      const safe = import(\`./safe-domain-helper\`);
    `;

    const detected = scanSourceFileImports('synthetic-template.ts', templateCode);

    expect(detected.length).toBe(4);
    const modules = detected.map(d => d.importedModule);
    expect(modules).toContain('../mobile-im/foo');
    expect(modules).toContain('@/domain/building/mobile-im/bar');
    expect(modules).toContain('react');
    expect(modules).toContain('@supabase/supabase-js');
  });
});
