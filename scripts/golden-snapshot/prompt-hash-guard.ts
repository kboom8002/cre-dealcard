/**
 * @file scripts/golden-snapshot/prompt-hash-guard.ts
 * @description Ring 2 Prompt & Schema SHA-256 Cassette Staleness Guard.
 *
 * Scans all `.ts` files (excluding `*.test.ts`) under:
 *   - `src/ai/prompts/`
 *   - `src/ai/schemas/`
 *   - `src/ai/model-selector.ts`
 *
 * Normalizes CRLF -> LF (`\r\n` -> `\n`) prior to SHA-256 hashing so Windows
 * and Ubuntu Linux CI produce byte-for-byte identical digests.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, '..', '..');
export const DEFAULT_MANIFEST_PATH = path.join(
  DEFAULT_ROOT_DIR,
  'e2e',
  'golden-snapshots',
  'prompt-hash-manifest.json',
);

export interface PromptHashSnapshot {
  aggregateSha256: string;
  files: Record<string, string>;
}

export interface PromptHashManifest {
  schemaVersion: 1;
  updatedAt: string;
  aggregateSha256: string;
  files: Record<string, string>;
}

export interface PromptManifestDiff {
  matches: boolean;
  manifestMissing: boolean;
  aggregateChanged: boolean;
  changed: string[];
  added: string[];
  removed: string[];
  totalTracked: number;
}

/**
 * Normalizes Windows CRLF (`\r\n`) and lone CR (`\r`) line endings to POSIX LF (`\n`)
 * so SHA-256 digests are identical across Windows and Linux filesystems.
 */
export function normalizeLfContent(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function sha256NormalizedText(raw: string): string {
  const normalized = normalizeLfContent(raw);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function toPosixRelativePath(rootDir: string, targetPath: string): string {
  return path.relative(rootDir, targetPath).split(path.sep).join('/');
}

function compareLexicographic(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function collectPromptTsFilesInDir(absDir: string, acc: string[]): void {
  if (!fs.existsSync(absDir)) return;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectPromptTsFilesInDir(full, acc);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      acc.push(full);
    }
  }
}

/**
 * Computes deterministic CRLF-normalized SHA-256 hashes for all tracked AI prompt,
 * schema, and model-selector TypeScript source files under `rootDir`.
 */
export function computeCurrentPromptHashes(
  rootDir: string = DEFAULT_ROOT_DIR,
): PromptHashSnapshot {
  const absCandidates: string[] = [];

  collectPromptTsFilesInDir(path.join(rootDir, 'src', 'ai', 'prompts'), absCandidates);
  collectPromptTsFilesInDir(path.join(rootDir, 'src', 'ai', 'schemas'), absCandidates);

  const modelSelectorPath = path.join(rootDir, 'src', 'ai', 'model-selector.ts');
  if (fs.existsSync(modelSelectorPath) && fs.statSync(modelSelectorPath).isFile()) {
    absCandidates.push(modelSelectorPath);
  }

  const sortedEntries = absCandidates
    .map((absPath) => ({
      relPath: toPosixRelativePath(rootDir, absPath),
      absPath,
    }))
    .sort((a, b) => compareLexicographic(a.relPath, b.relPath));

  const files: Record<string, string> = {};
  const aggregateLines: string[] = [];

  for (const { relPath, absPath } of sortedEntries) {
    const raw = fs.readFileSync(absPath, 'utf8');
    const digest = sha256NormalizedText(raw);
    files[relPath] = digest;
    aggregateLines.push(`${relPath}:${digest}\n`);
  }

  const aggregateSha256 = crypto
    .createHash('sha256')
    .update(aggregateLines.join(''), 'utf8')
    .digest('hex');

  return {
    aggregateSha256,
    files,
  };
}

/**
 * Loads `e2e/golden-snapshots/prompt-hash-manifest.json` if it exists; returns `null` when missing.
 */
export function loadPromptManifest(
  manifestPath: string = DEFAULT_MANIFEST_PATH,
): PromptHashManifest | null {
  if (!fs.existsSync(manifestPath)) return null;
  const raw = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(raw) as PromptHashManifest;
  if (
    !parsed ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.aggregateSha256 !== 'string' ||
    !parsed.files ||
    typeof parsed.files !== 'object'
  ) {
    throw new Error(`Invalid prompt hash manifest schema at ${manifestPath}`);
  }
  return parsed;
}

/**
 * Compares current prompt/schema hashes against a loaded manifest.
 */
export function diffPromptManifest(
  current: PromptHashSnapshot,
  manifest: PromptHashManifest | null,
): PromptManifestDiff {
  const currentKeys = Object.keys(current.files).sort(compareLexicographic);
  if (!manifest) {
    return {
      matches: false,
      manifestMissing: true,
      aggregateChanged: true,
      changed: [],
      added: currentKeys,
      removed: [],
      totalTracked: currentKeys.length,
    };
  }

  const manifestKeys = Object.keys(manifest.files).sort(compareLexicographic);
  const currentSet = new Set(currentKeys);
  const manifestSet = new Set(manifestKeys);

  const added = currentKeys.filter((k) => !manifestSet.has(k));
  const removed = manifestKeys.filter((k) => !currentSet.has(k));
  const changed = currentKeys.filter(
    (k) => manifestSet.has(k) && current.files[k] !== manifest.files[k],
  );
  const aggregateChanged = current.aggregateSha256 !== manifest.aggregateSha256;
  const matches =
    !aggregateChanged &&
    changed.length === 0 &&
    added.length === 0 &&
    removed.length === 0;

  return {
    matches,
    manifestMissing: false,
    aggregateChanged,
    changed,
    added,
    removed,
    totalTracked: currentKeys.length,
  };
}

/**
 * Writes the deterministic prompt/schema SHA-256 manifest to disk (LF line endings).
 */
export function writePromptManifest(
  manifestPath: string = DEFAULT_MANIFEST_PATH,
  rootDir: string = DEFAULT_ROOT_DIR,
): PromptHashManifest {
  const current = computeCurrentPromptHashes(rootDir);
  const manifest: PromptHashManifest = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    aggregateSha256: current.aggregateSha256,
    files: current.files,
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export function formatPromptDiffWarning(diff: PromptManifestDiff): string {
  const parts: string[] = [];
  if (diff.manifestMissing) {
    parts.push('manifest missing');
  } else {
    if (diff.changed.length > 0) parts.push(`changed=[${diff.changed.join(', ')}]`);
    if (diff.added.length > 0) parts.push(`added=[${diff.added.join(', ')}]`);
    if (diff.removed.length > 0) parts.push(`removed=[${diff.removed.join(', ')}]`);
    if (parts.length === 0 && diff.aggregateChanged) parts.push('aggregateSha256 mismatch');
  }
  return `⚠️ [prompt-hash-guard] Prompt/schema changed since last golden review: ${parts.join('; ')}. Run 'npm run golden:judge' and '--update' if cassettes need re-recording.`;
}

function isDirectCliExecution(): boolean {
  if (process.env.VITEST === 'true') return false;
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return (
      path.resolve(entry).toLowerCase() ===
      path.resolve(fileURLToPath(import.meta.url)).toLowerCase()
    );
  } catch {
    return false;
  }
}

export function runPromptHashGuardCli(argv: readonly string[] = process.argv.slice(2)): number {
  const isUpdate = argv.includes('--update');
  const isStrict = argv.includes('--strict');

  if (isUpdate) {
    const written = writePromptManifest();
    const count = Object.keys(written.files).length;
    console.log(
      `✅ [prompt-hash-guard] Updated ${DEFAULT_MANIFEST_PATH} (${count} files, aggregate=${written.aggregateSha256.slice(0, 12)})`,
    );
    return 0;
  }

  const current = computeCurrentPromptHashes();
  const manifest = loadPromptManifest();
  const diff = diffPromptManifest(current, manifest);

  if (diff.matches) {
    console.log(
      `✅ [prompt-hash-guard] All ${diff.totalTracked} tracked AI prompt/schema files match manifest (${current.aggregateSha256.slice(0, 12)}).`,
    );
    return 0;
  }

  console.warn(formatPromptDiffWarning(diff));
  return isStrict ? 1 : 0;
}

if (isDirectCliExecution()) {
  const code = runPromptHashGuardCli();
  process.exit(code);
}
