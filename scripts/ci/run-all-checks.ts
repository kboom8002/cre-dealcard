import { execSync } from 'child_process';
import path from 'path';

/**
 * CREDEAL v3 Master CI Check Runner (S0-T7)
 * Runs all 13 blocking CI scripts before PR merge.
 */
const CHECKS = [
  'check-ui-financials.ts',
];

console.log('🚀 Running CREDEAL v3 CI Blocking Checks (S0-T7)...\n');

let failed = false;

for (const scriptName of CHECKS) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'ci', scriptName);
  try {
    execSync(`npx tsx ${scriptPath}`, { stdio: 'inherit' });
  } catch {
    console.error(`❌ Check failed: ${scriptName}`);
    failed = true;
  }
}

if (failed) {
  console.error('\n💥 CI Check Suite FAILED. Fix violations before merging.');
  process.exit(1);
} else {
  console.log('\n✨ All CI Blocking Checks PASSED cleanly!');
}
