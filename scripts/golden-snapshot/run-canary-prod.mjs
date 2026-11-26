#!/usr/bin/env node
/**
 * @file scripts/golden-snapshot/run-canary-prod.mjs
 * @description Ring 3 Production Server Canary Runner (`next start` + Playwright Full-Loop).
 *
 * Usage:
 *   node scripts/golden-snapshot/run-canary-prod.mjs --dry-run
 *   node scripts/golden-snapshot/run-canary-prod.mjs [--build]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SCRIPT_DIR, '..', '..');
export const DEFAULT_CANARY_SPEC = 'e2e/qa-full-loop-ppgt-2cases.auth.spec.ts';

export function buildCanaryProdPlan({
  rootDir = ROOT_DIR,
  env = process.env,
  argv = process.argv.slice(2),
} = {}) {
  const dryRun = argv.includes('--dry-run');
  const forceBuild = argv.includes('--build');
  const e2ePort = String(env.E2E_PORT || '3100').trim();
  const distDir = (env.NEXT_DIST_DIR || '.next').trim();
  const buildIdPath = path.join(rootDir, distDir, 'BUILD_ID');
  const specPath = path.join(rootDir, DEFAULT_CANARY_SPEC);
  const playwrightConfigPath = path.join(rootDir, 'playwright.config.ts');

  const hasBuildId = fs.existsSync(buildIdPath);
  const buildId = hasBuildId ? fs.readFileSync(buildIdPath, 'utf8').trim() : null;
  const hasSpec = fs.existsSync(specPath);
  const hasPlaywrightConfig = fs.existsSync(playwrightConfigPath);
  const needsBuild = forceBuild || !hasBuildId;

  return {
    dryRun,
    forceBuild,
    needsBuild,
    e2ePort,
    distDir,
    buildIdPath,
    hasBuildId,
    buildId,
    specRelative: DEFAULT_CANARY_SPEC,
    specPath,
    hasSpec,
    playwrightConfigPath,
    hasPlaywrightConfig,
    serverCommand: `npx next start -p ${e2ePort}`,
    playwrightArgs: [
      'playwright',
      'test',
      DEFAULT_CANARY_SPEC,
      '--project=authenticated',
      '--workers=1',
    ],
    childEnv: {
      PLAYWRIGHT_PROD_SERVER: '1',
      E2E_PORT: e2ePort,
    },
  };
}

function runShellStep(cmd, args, cwd, envOverrides) {
  const isWin = process.platform === 'win32';
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: isWin,
    env: {
      ...process.env,
      ...envOverrides,
    },
  });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

export function main(argv = process.argv.slice(2)) {
  const plan = buildCanaryProdPlan({ argv });

  if (!plan.hasPlaywrightConfig) {
    console.error(`❌ [canary-prod] Missing playwright.config.ts at ${plan.playwrightConfigPath}`);
    return 1;
  }
  if (!plan.hasSpec) {
    console.error(`❌ [canary-prod] Missing Playwright canary spec at ${plan.specPath}`);
    return 1;
  }

  if (plan.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          serverCommand: plan.serverCommand,
          reuseExistingServer: false,
          e2ePort: Number(plan.e2ePort),
          playwrightProdServer: plan.childEnv.PLAYWRIGHT_PROD_SERVER,
          buildIdPath: plan.buildIdPath,
          hasBuildId: plan.hasBuildId,
          buildId: plan.buildId,
          willRunBuildOnExecute: plan.needsBuild,
          spec: plan.specRelative,
          hasSpec: plan.hasSpec,
          playwrightCommand: `npx ${plan.playwrightArgs.join(' ')}`,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const envLocalPath = path.join(ROOT_DIR, '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const rawEnv = fs.readFileSync(envLocalPath, 'utf8');
    for (const line of rawEnv.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[k] === undefined) {
        process.env[k] = v;
      }
    }
  }

  if (plan.needsBuild) {
    console.log(
      `🔨 [canary-prod] ${plan.forceBuild ? '--build requested' : 'Missing .next/BUILD_ID'} -> running 'npm run build'...`,
    );
    const buildCode = runShellStep('npm', ['run', 'build'], ROOT_DIR, {});
    if (buildCode !== 0) {
      console.error(`❌ [canary-prod] 'npm run build' exited with code ${buildCode}`);
      return buildCode;
    }
    if (!fs.existsSync(plan.buildIdPath)) {
      console.error(`❌ [canary-prod] Expected ${plan.buildIdPath} after build, but it is still missing.`);
      return 1;
    }
  }

  console.log(
    `🚀 [canary-prod] Launching Playwright canary against '${plan.serverCommand}' (PLAYWRIGHT_PROD_SERVER=1, E2E_PORT=${plan.e2ePort})...`,
  );
  return runShellStep('npx', plan.playwrightArgs, ROOT_DIR, plan.childEnv);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isDirectRun) {
  process.exit(main());
}
