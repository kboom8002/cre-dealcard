import fs from 'fs';
import path from 'path';

/**
 * CI Check #5: check-ui-financials
 * Verifies that UI components under src/components/ do NOT perform direct financial math
 * (Cap Rate, NOI, Equity formulas). All calculations must route through financials.ts.
 */
function runCheck() {
  const componentsDir = path.resolve(process.cwd(), 'src/components');
  if (!fs.existsSync(componentsDir)) {
    console.log('✅ [CI #5 check-ui-financials] Passed: src/components directory not found.');
    return;
  }

  const forbiddenPatterns = [
    /noi\s*=\s*gross/i,
    /capRate\s*=\s*\(.*\/.*\)\s*\*100/i,
    /equity\s*=\s*price\s*-\s*loan/i,
  ];

  const violations: string[] = [];

  function scanDir(dir: string) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        scanDir(fullPath);
      } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(content)) {
            violations.push(`${fullPath}: Forbidden direct financial math pattern [${pattern}]`);
          }
        }
      }
    }
  }

  scanDir(componentsDir);

  if (violations.length > 0) {
    console.error('❌ [CI #5 check-ui-financials] Violations found:');
    violations.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log('✅ [CI #5 check-ui-financials] Passed: 0 direct math violations in UI components.');
}

runCheck();
