import { runIncomeE2ESuite } from './suites/income-e2e-suite';
import { runDevelopmentE2ESuite } from './suites/development-e2e-suite';
import { runMultiPostureE2ESuite } from './suites/multiposture-e2e-suite';
import type { FullReport } from './infra/e2e-report-generator';

async function runAll() {
  const args = process.argv.slice(2);
  let suiteArg = 'all';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--suite' && args[i + 1]) {
      suiteArg = args[i + 1];
      i++;
    } else if (args[i] === '--skip-llm') {
      process.env.SKIP_LLM = 'true';
    }
  }

  console.log('[E2E Runner] suite: ' + suiteArg + ', SKIP_LLM: ' + (process.env.SKIP_LLM === 'true'));

  const results: Array<{ suite: string; report: FullReport }> = [];
  let hasFailures = false;

  try {
    if (suiteArg === 'all' || suiteArg === 'income') {
      console.log('\n[E2E Runner] Income suite...');
      const res = await runIncomeE2ESuite();
      results.push({ suite: 'Income', report: res });
      if (res.totalFail > 0) hasFailures = true;
    }
    if (suiteArg === 'all' || suiteArg === 'development') {
      console.log('\n[E2E Runner] Development suite...');
      const res = await runDevelopmentE2ESuite();
      results.push({ suite: 'Development', report: res });
      if (res.totalFail > 0) hasFailures = true;
    }
    if (suiteArg === 'all' || suiteArg === 'multiposture') {
      console.log('\n[E2E Runner] Multiposture suite...');
      const res = await runMultiPostureE2ESuite();
      results.push({ suite: 'Multiposture', report: res });
      if (res.totalFail > 0) hasFailures = true;
    }
  } catch (error) {
    console.error('\n[E2E Runner] FATAL:', error);
    hasFailures = true;
  }

  console.log('\n=== E2E Summary ===');
  for (const { suite, report } of results) {
    console.log(suite + ': ' + report.totalPass + ' PASS / ' + report.totalFail + ' FAIL');
  }
  
  if (hasFailures) {
    console.error('\n[E2E Runner] Some tests failed.');
    process.exit(1);
  } else {
    console.log('\n[E2E Runner] All tests passed.');
    process.exit(0);
  }
}

if (require.main === module) {
  runAll().catch(error => {
    console.error('예기치 않은 오류 발생:', error);
    process.exit(1);
  });
}
