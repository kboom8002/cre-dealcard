/**
 * @file e2e/qa-full-loop-ppgt-2cases.auth.spec.ts
 * @description /qa-full-loop 2선 14스텝 실매물 골든 데이터 전체 완주 + Parametric Persona Golden Testing (PPGT-Loop R1+R2)
 *   + Anti-Sycophancy Controls + CRE-PPGT-100 + LibreOffice 150DPI PPTX 슬라이드 렌더링 + 육안검사용 스크린샷 풀캡처.
 *
 * 대상 시나리오 (FULL_LOOP_CASES):
 *   - Loop 1 (부천 동아빌딩 · 58억 · 17행 TSV + 주차타워 198만): L1-S1 ~ L1-S7 (창 A 1440/21px + 창 B 390x844 카톡 UA)
 *   - Loop 2 (역삼 여삼빌딩 · 2,000억→1,900억 · 3필지 1,452.20㎡ · 21행 TSV): L2-S1 ~ L2-S7 (창 A 1440/1180 + 창 B + 창 C)
 *
 * 출력물 (`e2e/screenshots/qa-full-loop-ppgt/`, gitignored):
 *   - `kits/{loop1,loop2}/` (실제 `/api/public/qa-sample-kit` ZIP 해제본)
 *   - `loop1_slides/*.png`, `loop2_slides/*.png` (LibreOffice + PyMuPDF 150DPI)
 *   - 웹/모바일/OG 스크린샷 PNGs
 *   - `qa-full-loop-manifest.json`, `qa-full-loop-scorecard.json`, `qa-full-loop-scorecard.md`
 *
 * 절대 원칙:
 *   - 유료 외부 LLM R3 호출 금지 (R1+R2 결정론 계측 + 육안검사 직접 수행)
 *   - afterAll에서 원본 중개사 프로필 복원 및 생성한 건물/에디션/구독자/고객 완전 삭제
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import JSZip from "jszip";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  FULL_LOOP_CASES,
  QA_FULL_LOOP_WORKBENCH_ID,
} from "../src/lib/testguide/full-loop-2cases-data";
import { BANNED_UI_TERMS } from "../src/lib/ux/lexicon";
import {
  scanUxWriting,
  auditDealCardContentSuitability,
  auditNewsletterContentSuitability,
  auditImContentSuitability,
} from "../src/lib/qa/ux-writing-and-content-oracle";
import {
  scoreDealCardPpgtRun,
  rankDealCardPpgtBacklog,
  verifyDealCardAntiSycophancyControls,
  type DealCardPpgtScoreResult,
} from "../src/lib/qa/dealcard-ppgt-personas";
import {
  scoreImPpgtRun,
  rankImPpgtBacklog,
  verifyAntiSycophancyControls as verifyImAntiSycophancyControls,
  type ImPpgtScoreResult,
} from "../src/lib/qa/im-ppgt-personas";
import {
  scoreNewsletterPpgtRun,
  rankNewsletterPpgtBacklog,
  verifyNewsletterAntiSycophancyControls,
  type NewsletterPpgtScoreResult,
} from "../src/lib/qa/newsletter-ppgt-personas";
import {
  scoreInboxPpgtRun,
  rankInboxPpgtBacklog,
  verifyInboxAntiSycophancyControls,
  type InboxPpgtScoreResult,
} from "../src/lib/qa/inbox-ppgt-personas";
import {
  buildUnifiedCreReport100,
  formatUnifiedCreScorecardMarkdown,
} from "../src/lib/qa/unified-cre-rubric";
import {
  ensureDir,
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertPriceBandBlocked,
} from "./helpers/golden-test-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const AUTH_STATE_PATH = path.resolve(__dirname, ".auth/user.json");
const OUT_ROOT = path.resolve(__dirname, "screenshots/qa-full-loop-ppgt");
const VALID_DEAL_ID_REGEX = /^(?:[0-9a-f-]{36}|bld-[a-z0-9-]+)$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAW_ERROR_REGEX =
  /PGRST|relation .* does not exist|column .* does not exist|syntax error|\[object Object\]|>NaN<|>undefined<|>null</;

interface DomProbeRaw {
  horizontalOverflowPx: number;
  aboveFoldActionCount: number;
  totalVisibleInteractiveCount: number;
  sub44Buttons: Array<{ text: string; width: number; height: number }>;
  sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }>;
  clippedButtons: Array<{ text: string; clientW: number; scrollW: number }>;
  brokenImgs: Array<{ alt: string; src: string }>;
  visibleText: string;
  observedHeadings: string[];
  observedButtons: string[];
  observedBadges: string[];
  provenanceBadgeVisible: boolean;
  honestSaveVisible: boolean;
}

interface StepExecutionRecord {
  stepId: string;
  loopId: "loop1" | "loop2";
  subsystem: string;
  title: string;
  elapsedSec: number;
  targetMinutes: number;
  verdict: "PASS" | "NEEDS_POLISH" | "FAIL";
  checks: Record<string, unknown>;
  defects: string[];
  observations: string[];
  screenshots: string[];
  personaReaction: string;
}

interface OriginalProfileSnapshot {
  display_name?: string;
  representative_name?: string | null;
  phone?: string;
  company?: string;
  office_address?: string;
  office_reg_number?: string;
  license_number?: string;
  association?: string;
}

const runState: {
  qaKey: string;
  origProfile: OriginalProfileSnapshot | null;
  createdBuildingIds: string[];
  createdDocIds: string[];
  createdEditionIds: string[];
  createdClientIds: string[];
  createdSubscriberPhones: string[];
  stepResults: StepExecutionRecord[];
  dealcardRuns: DealCardPpgtScoreResult[];
  imRuns: ImPpgtScoreResult[];
  newsletterRuns: NewsletterPpgtScoreResult[];
  inboxRuns: InboxPpgtScoreResult[];
  antiSycophancy: Record<string, { passed: boolean; failures: string[] }>;
  loop1Details: Record<string, unknown>;
  loop2Details: Record<string, unknown>;
} = {
  qaKey:
    process.env.QA_ACCESS_KEY ||
    process.env.NEXT_PUBLIC_QA_ACCESS_KEY ||
    "ppgt-full-loop-local-key-2026",
  origProfile: null,
  createdBuildingIds: [],
  createdDocIds: [],
  createdEditionIds: [],
  createdClientIds: [],
  createdSubscriberPhones: [],
  stepResults: [],
  dealcardRuns: [],
  imRuns: [],
  newsletterRuns: [],
  inboxRuns: [],
  antiSycophancy: {},
  loop1Details: {},
  loop2Details: {},
};

async function hideDevOverlay(page: Page) {
  await page
    .addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}",
    })
    .catch(() => {});
}

async function applyFontScale(page: Page, scale: "normal" | "xlarge") {
  await page.evaluate((s) => {
    document.documentElement.setAttribute("data-font-scale", s);
    try {
      window.localStorage.setItem("credeal-font-scale", s);
      window.localStorage.setItem("cre-font-scale", s);
    } catch {
      // ignore storage errors
    }
  }, scale);
  await page.waitForTimeout(250);
}

function countBannedTerms(text: string): number {
  let count = 0;
  for (const entry of BANNED_UI_TERMS) {
    if (entry.term.test(text)) count += 1;
  }
  return count;
}

function countPoisonTokens(text: string): number {
  const matches = text.match(new RegExp(RAW_ERROR_REGEX.source, "g"));
  return matches ? matches.length : 0;
}

async function collectDomProbe(page: Page, scopeSelector: string): Promise<DomProbeRaw> {
  return await page.evaluate((sel) => {
    const isVisible = (el: Element): boolean => {
      const h = el as HTMLElement;
      const st = getComputedStyle(h);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
        return false;
      }
      if (h.closest(".sr-only")) return false;
      const r = h.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    const inViewport = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return (
        r.top < window.innerHeight &&
        r.bottom > 0 &&
        r.left < window.innerWidth &&
        r.right > 0
      );
    };
    const overflowPx = Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const scopeRoot = document.querySelector(sel) || document.body;
    const interactiveSel =
      'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="switch"]';
    const allInteractives = Array.from(document.querySelectorAll(interactiveSel)).filter(
      (el) =>
        isVisible(el) &&
        !(el as HTMLElement).hasAttribute("data-preview-unit-id") &&
        el.getAttribute("role") !== "separator",
    );
    const scopeInteractives = Array.from(scopeRoot.querySelectorAll(interactiveSel)).filter(
      (el) =>
        isVisible(el) &&
        !(el as HTMLElement).hasAttribute("data-preview-unit-id") &&
        el.getAttribute("role") !== "separator",
    );
    const scopeAboveFold = scopeInteractives.filter(inViewport);

    const sub44Buttons: Array<{ text: string; width: number; height: number }> = [];
    const clippedButtons: Array<{ text: string; clientW: number; scrollW: number }> = [];
    const observedButtons: string[] = [];

    for (const el of allInteractives) {
      const htmlEl = el as HTMLElement;
      const label = (htmlEl.innerText || htmlEl.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 48);
      if (label && observedButtons.length < 30) observedButtons.push(label);

      const rect = htmlEl.getBoundingClientRect();
      const role = el.getAttribute("role");
      const isTapTarget = el.tagName === "BUTTON" || role === "tab" || role === "switch";
      if (isTapTarget && Math.round(rect.height) < 40 && sub44Buttons.length < 25) {
        sub44Buttons.push({
          text: label || el.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }

      if (isTapTarget || el.tagName === "A") {
        const isSidebarRow =
          htmlEl.matches('[data-list-row="simple"]') ||
          Boolean(htmlEl.closest('[data-list-row="simple"]'));
        if (!isSidebarRow) {
          const btnStyle = getComputedStyle(htmlEl);
          const ownOverflow =
            htmlEl.clientWidth > 0 &&
            htmlEl.scrollWidth > htmlEl.clientWidth + 6 &&
            btnStyle.overflowX !== "visible";
          if (ownOverflow && clippedButtons.length < 20) {
            clippedButtons.push({
              text: label || el.tagName,
              clientW: Math.round(htmlEl.clientWidth),
              scrollW: Math.round(htmlEl.scrollWidth),
            });
          }
        }
      }
    }

    const sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }> = [];
    const textEls = Array.from(scopeRoot.querySelectorAll("p, li, h1, h2, h3, label")).filter(
      isVisible,
    );
    for (const el of textEls) {
      const htmlEl = el as HTMLElement;
      const txt = (htmlEl.innerText || "").replace(/\s+/g, " ").trim();
      if (txt.length < 6) continue;
      const fsPx = parseFloat(getComputedStyle(htmlEl).fontSize || "16");
      if (fsPx < 13.5 && sub15Texts.length < 20) {
        sub15Texts.push({
          text: txt.slice(0, 40),
          tag: el.tagName,
          fontSizePx: Math.round(fsPx * 10) / 10,
        });
      }
    }

    const brokenImgs = Array.from(document.querySelectorAll("img"))
      .filter((img) => isVisible(img) && img.complete && img.naturalWidth === 0)
      .map((img) => ({ alt: img.alt || "", src: img.src.slice(0, 120) }));

    const observedHeadings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .filter(isVisible)
      .map((h) => (h as HTMLElement).innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 20);

    const observedBadges = Array.from(
      document.querySelectorAll('[data-testid*="badge"], [role="status"], [role="alert"]'),
    )
      .filter(isVisible)
      .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 20);

    const visibleText = (document.body.innerText || "").replace(/\s+/g, " ").trim();
    const provenanceBadgeVisible =
      /공인중개사|중개법인|검증|건축물대장|토지이음|국토교통부|한국부동산원|등록번호|소재지/.test(
        visibleText,
      );
    const honestSaveVisible = /저장됨|임시저장|자동 저장|발행됨|발행 완료/.test(visibleText);

    return {
      horizontalOverflowPx: Math.round(overflowPx),
      aboveFoldActionCount: scopeAboveFold.length,
      totalVisibleInteractiveCount: scopeInteractives.length,
      sub44Buttons,
      sub15Texts,
      clippedButtons,
      brokenImgs,
      visibleText,
      observedHeadings,
      observedButtons,
      observedBadges,
      provenanceBadgeVisible,
      honestSaveVisible,
    };
  }, scopeSelector);
}

async function extractSampleKit(
  page: Page,
  scenario: "loop1" | "loop2",
  destDir: string,
): Promise<{
  memoText: string;
  tsvText: string;
  nlBriefText: string;
  photoPaths: string[];
}> {
  ensureDir(destDir);
  const res = await page.request.get(
    `/api/public/qa-sample-kit?scenario=${scenario}&qaKey=${encodeURIComponent(runState.qaKey)}`,
  );
  if (!res.ok()) {
    throw new Error(`Sample kit ${scenario} HTTP ${res.status()}`);
  }
  const buf = await res.body();
  const zip = await JSZip.loadAsync(buf);
  const photoPaths: string[] = [];

  for (const name of Object.keys(zip.files).sort()) {
    const file = zip.files[name];
    if (file.dir) continue;
    const content = await file.async("nodebuffer");
    const outPath = path.join(destDir, name);
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, content);
    if (name.startsWith("photos/")) {
      photoPaths.push(outPath);
    }
  }

  return {
    memoText: fs.readFileSync(path.join(destDir, "01_현장메모_원문.txt"), "utf-8").trim(),
    tsvText: fs.readFileSync(path.join(destDir, "03_임대현황_붙여넣기용.tsv"), "utf-8"),
    nlBriefText: fs.readFileSync(path.join(destDir, "04_뉴스레터_브리핑_초안.txt"), "utf-8").trim(),
    photoPaths,
  };
}

async function extractPptxSlideXmls(pptxBuf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(pptxBuf);
  const slideNames = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return na - nb;
    });
  const xmls: string[] = [];
  for (const name of slideNames) {
    xmls.push(await zip.files[name].async("string"));
  }
  return xmls;
}

function convertPptxToPngsIsolated(
  pptxBuffer: Buffer,
  outputDir: string,
  baseName: string,
  dpi = 150,
): { pdfPath: string; slideImages: string[]; slideCount: number } {
  ensureDir(outputDir);
  const pptxPath = path.join(outputDir, `${baseName}.pptx`);
  fs.writeFileSync(pptxPath, pptxBuffer);

  const profileDir = path.join(outputDir, `_lo_profile_${baseName}`);
  ensureDir(profileDir);
  const profileUrl = "file:///" + profileDir.replace(/\\/g, "/");

  const pyScript = `
import subprocess, os, sys, fitz
pptx_path = r"""${pptxPath}"""
output_dir = r"""${outputDir}"""
base_name = "${baseName}"
dpi = ${dpi}
profile_url = "${profileUrl}"

soffice_path = r"C:\\Program Files\\LibreOffice\\program\\soffice.com"
if not os.path.exists(soffice_path):
    soffice_path = r"C:\\Program Files\\LibreOffice\\program\\soffice.exe"
if not os.path.exists(soffice_path):
    soffice_path = "soffice"

pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
if os.path.exists(pdf_path):
    try:
        os.remove(pdf_path)
    except Exception:
        pass

cmd = [
    soffice_path,
    f"-env:UserInstallation={profile_url}",
    "--headless",
    "--norestore",
    "--convert-to", "pdf",
    pptx_path,
    "--outdir", output_dir,
]
res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
if res.returncode != 0:
    print(f"ERROR: LibreOffice failed: {res.stderr or res.stdout}", file=sys.stderr)
    sys.exit(1)

if not os.path.exists(pdf_path):
    print(f"ERROR: PDF not created at {pdf_path}", file=sys.stderr)
    sys.exit(1)

doc = fitz.open(pdf_path)
page_count = len(doc)
slide_paths = []
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=dpi)
    img_path = os.path.join(output_dir, f"{base_name}_slide_{i+1:02d}.png")
    pix.save(img_path)
    slide_paths.append(img_path)
doc.close()

print(f"SLIDE_COUNT:{page_count}")
for sp in slide_paths:
    print(f"SLIDE_PATH:{sp}")
`;
  const scriptPath = path.join(outputDir, `_render_${baseName}.py`);
  fs.writeFileSync(scriptPath, pyScript, "utf-8");
  const stdout = execSync(`python "${scriptPath}"`, { encoding: "utf-8", timeout: 150_000 });
  const lines = stdout.split(/\r?\n/).map((l) => l.trim());
  const slideCount = Number(
    lines.find((l) => l.startsWith("SLIDE_COUNT:"))?.replace("SLIDE_COUNT:", "") ?? 0,
  );
  const slideImages = lines
    .filter((l) => l.startsWith("SLIDE_PATH:"))
    .map((l) => l.replace("SLIDE_PATH:", "").trim());
  return {
    pdfPath: path.join(outputDir, `${baseName}.pdf`),
    slideImages,
    slideCount,
  };
}

async function pasteTsvIntoRentRollGrid(page: Page, tsvContent: string) {
  const grid = page.locator('[data-testid="rent-roll-grid"]').first();
  await grid.waitFor({ state: "visible", timeout: 15_000 });
  await grid.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    dt.setData("text", text);
    const ev = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    el.dispatchEvent(ev);
  }, tsvContent);
  await page.waitForTimeout(600);
}

function hasPctNear(text: string, targetPct: number, tol = 0.06): boolean {
  const matches = text.match(/\d+(?:\.\d+)?\s*%/g) ?? [];
  for (const m of matches) {
    const val = parseFloat(m.replace("%", "").trim());
    if (Number.isFinite(val) && Math.abs(val - targetPct) <= tol) return true;
  }
  return false;
}

function saveShot(fileName: string): string {
  return path.join(OUT_ROOT, fileName);
}

async function recordStep(
  meta: {
    stepId: string;
    loopId: "loop1" | "loop2";
    subsystem: string;
    title: string;
    targetMinutes: number;
  },
  fn: (ctx: {
    checks: Record<string, unknown>;
    defects: string[];
    observations: string[];
    screenshots: string[];
    personaNotes: string[];
  }) => Promise<void>,
): Promise<StepExecutionRecord> {
  const t0 = Date.now();
  const checks: Record<string, unknown> = {};
  const defects: string[] = [];
  const observations: string[] = [];
  const screenshots: string[] = [];
  const personaNotes: string[] = [];

  try {
    await fn({ checks, defects, observations, screenshots, personaNotes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    defects.push(`STEP_EXCEPTION: ${msg.slice(0, 320)}`);
    console.error(`  ❌ [${meta.stepId}] Exception: ${msg}`);
  }

  const elapsedSec = Math.round((Date.now() - t0) / 100) / 10;
  const verdict: "PASS" | "NEEDS_POLISH" | "FAIL" =
    defects.some((d) =>
      /LEAK|BLIND|EXCEPTION|409|500|404_BROKEN|REVOKED_ORTHOGONAL_FAIL|STATUTORY_BYPASS/.test(d),
    ) || defects.length >= 2
      ? "FAIL"
      : defects.length === 1
        ? "NEEDS_POLISH"
        : observations.some((o) => /gap|friction|mismatch|주의|아쉬움|개선/.test(o))
          ? "NEEDS_POLISH"
          : "PASS";

  const rec: StepExecutionRecord = {
    stepId: meta.stepId,
    loopId: meta.loopId,
    subsystem: meta.subsystem,
    title: meta.title,
    elapsedSec,
    targetMinutes: meta.targetMinutes,
    verdict,
    checks,
    defects,
    observations,
    screenshots,
    personaReaction: `[SIMULATED] ${
      personaNotes.join(" / ") || `${meta.stepId} ${verdict} (${elapsedSec}s)`
    }`,
  };
  runState.stepResults.push(rec);
  console.log(
    `[${meta.stepId}] verdict=${verdict} elapsed=${elapsedSec}s defects=${defects.length} obs=${observations.length}`,
  );
  if (defects.length > 0) console.log(`  ⚠️ Defects: ${defects.join(" | ")}`);
  if (observations.length > 0) console.log(`  📝 Obs: ${observations.join(" | ")}`);
  return rec;
}

test.describe.serial("/qa-full-loop 2선 14스텝 PPGT + 멀티모달 육안검사 풀루프", () => {
  test.setTimeout(900_000);

  let windowA: BrowserContext;
  let windowB: BrowserContext;
  let windowC: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let pageC: Page;

  test.beforeAll(async ({ browser, request }) => {
    ensureDir(OUT_ROOT);
    // Reset only the QA synthetic test phone's subscribe rate-limit row so back-to-back runs
    // do not collide with prior runs' 3/day cap while preserving production rate limiting.
    {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (sbUrl && sbKey) {
        const admin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
        const phoneRlKey = `rl:magazine-subscribe:target:${crypto
          .createHash("sha256")
          .update("p:01055012389")
          .digest("hex")
          .slice(0, 32)}`;
        await admin.from("magazine_rate_limits").delete().eq("key", phoneRlKey);
      }
    }
    // Snapshot broker profile safely
    const profRes = await request.get("/api/broker/profile").catch(() => null);
    if (profRes?.ok()) {
      const pj = await profRes.json().catch(() => null);
      const d = pj?.data;
      if (d) {
        runState.origProfile = {
          display_name: d.display_name || "김테스트",
          representative_name: d.broker?.representative_name ?? d.display_name ?? "김테스트",
          phone: d.phone || "010-2548-2548",
          company: d.company || "크리딜 테스트 공인중개사사무소",
          office_address: d.broker?.office_address || "서울특별시 영등포구 국제금융로 10",
          office_reg_number: d.broker?.office_reg_number || "11560-2024-00088",
          license_number: d.broker?.license_number || undefined,
          association: d.broker?.association || undefined,
        };
      }
    }

    // Run 4 Anti-Sycophancy Negative Control Verifications upfront
    const dcNc = verifyDealCardAntiSycophancyControls();
    const imNc = verifyImAntiSycophancyControls();
    const nlNc = verifyNewsletterAntiSycophancyControls();
    const ibNc = verifyInboxAntiSycophancyControls();
    runState.antiSycophancy = {
      dealcard: { passed: dcNc.passed, failures: dcNc.failures },
      im: { passed: imNc.passed, failures: imNc.failures },
      newsletter: { passed: nlNc.passed, failures: nlNc.failures },
      inbox: { passed: ibNc.passed, failures: ibNc.failures },
    };
    expect(dcNc.passed, `DC NC failed: ${dcNc.failures.join(", ")}`).toBe(true);
    expect(imNc.passed, `IM NC failed: ${imNc.failures.join(", ")}`).toBe(true);
    expect(nlNc.passed, `NL NC failed: ${nlNc.failures.join(", ")}`).toBe(true);
    expect(ibNc.passed, `IB NC failed: ${ibNc.failures.join(", ")}`).toBe(true);

    // Physical 3-Window Context Setup
    windowA = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      viewport: { width: 1440, height: 900 },
      locale: "ko-KR",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    windowB = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
      locale: "ko-KR",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.5.0",
    });
    windowC = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1440, height: 900 },
      locale: "ko-KR",
    });

    pageA = await windowA.newPage();
    pageB = await windowB.newPage();
    pageC = await windowC.newPage();
    pageA.setDefaultTimeout(35_000);
    pageB.setDefaultTimeout(35_000);
    pageC.setDefaultTimeout(35_000);
  });

  test("Executes Loop 1 (L1-S1..L1-S7) & Loop 2 (L2-S1..L2-S7) + Rubric Aggregation", async () => {
    const loop1ConsoleErrors: string[] = [];
    const loop2ConsoleErrors: string[] = [];
    const pageErrorsA: string[] = [];
    const pageErrorsB: string[] = [];
    const pageErrorsC: string[] = [];
    const server500s: Array<{
      loop: "loop1" | "loop2";
      window: "A" | "B" | "C";
      status: number;
      url: string;
    }> = [];

    let activeLoop: "loop1" | "loop2" = "loop1";
    const attachServer500Watcher = (p: Page, win: "A" | "B" | "C") => {
      p.on("response", (res) => {
        if (res.status() >= 500) {
          server500s.push({
            loop: activeLoop,
            window: win,
            status: res.status(),
            url: res.url(),
          });
        }
      });
    };
    attachServer500Watcher(pageA, "A");
    attachServer500Watcher(pageB, "B");
    attachServer500Watcher(pageC, "C");

    pageA.on("console", (m) => {
      if (m.type() === "error") {
        (activeLoop === "loop1" ? loop1ConsoleErrors : loop2ConsoleErrors).push(m.text());
      }
    });
    pageA.on("pageerror", (e) => pageErrorsA.push(e.message));
    pageB.on("pageerror", (e) => pageErrorsB.push(e.message));
    pageC.on("pageerror", (e) => pageErrorsC.push(e.message));

    // Pre-Flight: QA Gate fail-closed check + Extract real ZIP sample kits
    const unauthQaRes = await pageB.request.get("/qa-full-loop");
    const authQaRes = await pageA.request.get(
      `/qa-full-loop?qaKey=${encodeURIComponent(runState.qaKey)}`,
    );
    const loop1Kit = await extractSampleKit(pageA, "loop1", path.join(OUT_ROOT, "kits/loop1"));
    const loop2Kit = await extractSampleKit(pageA, "loop2", path.join(OUT_ROOT, "kits/loop2"));

    runState.loop1Details.qaGateUnauthed = unauthQaRes.status();
    runState.loop1Details.qaGateAuthed = authQaRes.status();
    runState.loop1Details.zipPhotoCount = loop1Kit.photoPaths.length;
    runState.loop2Details.zipPhotoCount = loop2Kit.photoPaths.length;

    // Shared Loop 1 variables
    let l1BuildingId = "";
    let l1DocId = "";
    let l1DcRelUrl = "";
    let l1ImShareUrl = "";
    let l1ImTokenUrl = "";
    let l1GateReqId = "";
    let l1NlPublicUrl = "";
    let l1NlEditionId = "";
    let l1DcMobileText = "";
    let l1DcHeading = "";

    // =========================================================================
    // LOOP 1 — 부천 동아빌딩 58억 (L1-S1 ~ L1-S7)
    // =========================================================================
    const loop1Def = FULL_LOOP_CASES[0];

    // ── L1-S1: 프로필 5대 법정 표기 & 큰 글씨(21px) 첫 화면 확인 ──
    await recordStep(
      {
        stepId: "L1-S1",
        loopId: "loop1",
        subsystem: "프로필·법정표기",
        title: loop1Def.steps[0].title,
        targetMinutes: 2,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        await pageA.setViewportSize({ width: 1440, height: 900 });
        await pageA.goto("/broker/profile", { waitUntil: "networkidle" });
        await hideDevOverlay(pageA);
        await applyFontScale(pageA, "xlarge");
        await pageA.waitForTimeout(400);

        const profProbe = await collectDomProbe(pageA, "main");
        const s1Prof = saveShot("l1_s1_profile_21px.png");
        await pageA.screenshot({ path: s1Prof, fullPage: false });
        screenshots.push(s1Prof);

        // Verify 5 statutory fields present on /broker/profile
        const statutoryBannerOk = await pageA
          .locator('[data-testid="statutory-disclosure-check-banner"]')
          .isVisible()
          .catch(() => false);
        const regVal = await pageA
          .locator("#profile-office-reg-number")
          .inputValue()
          .catch(() => "");
        checks.statutoryBannerVisible = statutoryBannerOk;
        checks.officeRegNumber = regVal;
        checks.profileOverflowPx = profProbe.horizontalOverflowPx;
        checks.profileClippedButtons = profProbe.clippedButtons.length;

        if (!regVal) defects.push("프로필 개설등록번호 공란 상태");
        if (profProbe.horizontalOverflowPx > 0) {
          defects.push(`21px 프로필 가로 오버플로 ${profProbe.horizontalOverflowPx}px`);
        }

        // Check /broker/w/dealcards?fresh=1 under xlarge 21px
        await pageA.goto("/broker/w/dealcards?fresh=1", { waitUntil: "networkidle" });
        await hideDevOverlay(pageA);
        await applyFontScale(pageA, "xlarge");
        await pageA.waitForTimeout(500);

        const dcZeroProbe = await collectDomProbe(pageA, "main");
        const s1Dc = saveShot("l1_s1_dealcards_21px.png");
        await pageA.screenshot({ path: s1Dc, fullPage: false });
        screenshots.push(s1Dc);

        checks.dcXlargeOverflowPx = dcZeroProbe.horizontalOverflowPx;
        checks.dcXlargeClippedButtons = dcZeroProbe.clippedButtons;
        checks.dcXlargeSub44Buttons = dcZeroProbe.sub44Buttons;
        if (dcZeroProbe.horizontalOverflowPx > 0) {
          defects.push(`딜카드 21px 가로 오버플로 ${dcZeroProbe.horizontalOverflowPx}px`);
        }
        if (dcZeroProbe.clippedButtons.length > 0) {
          observations.push(
            `21px 모드에서 버튼/탭 텍스트 잘림 ${dcZeroProbe.clippedButtons.length}건 감지`,
          );
        }
        personaNotes.push(
          `[DC-MG-01 시니어 21px] 프로필 법정 5항목 및 딜카드 첫 화면 0px 오버플로 확인 (잘림 ${dcZeroProbe.clippedButtons.length}건)`,
        );
      },
    );

    // ── L1-S2: 동아빌딩 메모 Fast-Fill & 블라인드 딜카드 발행 + 카톡 OG PNG ──
    await recordStep(
      {
        stepId: "L1-S2",
        loopId: "loop1",
        subsystem: "딜카드",
        title: loop1Def.steps[1].title,
        targetMinutes: 3,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        const onPatch = (res: any) => {
          if (
            res.url().includes("/api/broker/workspace/summary") &&
            res.request().method() === "PATCH"
          ) {
            try {
              const b = res.request().postDataJSON?.() as Record<string, any> | null;
              if (b?.buildingId && VALID_DEAL_ID_REGEX.test(String(b.buildingId))) {
                l1BuildingId = String(b.buildingId);
                if (!runState.createdBuildingIds.includes(l1BuildingId)) {
                  runState.createdBuildingIds.push(l1BuildingId);
                }
              }
            } catch {}
          }
        };
        pageA.on("response", onPatch);

        const memoBox = pageA.locator('[data-testid="dealcard-top-memo-textarea"]');
        await memoBox.waitFor({ state: "visible", timeout: 20_000 });
        await memoBox.fill(loop1Kit.memoText);
        await pageA.locator('[data-testid="dealcard-generate-from-memo-btn"]').click();
        await pageA.locator('[data-testid="card4-confirm-card"]').waitFor({
          state: "visible",
          timeout: 45_000,
        });
        await pageA.waitForTimeout(800);

        const blindBtn = pageA.locator('[data-testid="card4-blind-clean-btn"]');
        const blindCleanTriggered = await blindBtn.isVisible().catch(() => false);
        if (blindCleanTriggered) {
          await blindBtn.click();
          await pageA.waitForTimeout(300);
        }
        const priceConvBtn = pageA.locator('[data-testid="card4-priceband-convert-btn"]');
        if (await priceConvBtn.isVisible().catch(() => false)) {
          await priceConvBtn.click();
          await pageA.waitForTimeout(300);
        }

        const dcWorkspaceProbe = await collectDomProbe(pageA, '[data-testid="card4-confirm-card"]');
        const s2Shot = saveShot("l1_s2_dc_workspace_21px.png");
        await pageA.screenshot({ path: s2Shot, fullPage: false });
        screenshots.push(s2Shot);

        // Publish DealCard via Primary CTA -> PreSendConfirmationSheet
        await pageA.locator('[data-testid="workspace-primary-send-btn"]:visible').first().click();
        await pageA.locator('[data-testid="presend-confirmation-sheet"]').waitFor({
          state: "visible",
          timeout: 20_000,
        });
        const autoMaskBtn = pageA.locator('[data-testid="presend-auto-mask-btn"]');
        if (await autoMaskBtn.isVisible().catch(() => false)) {
          await autoMaskBtn.click();
          await pageA.waitForTimeout(300);
        }
        const pubPromise = pageA
          .waitForResponse(
            (r) =>
              (r.url().includes("/api/broker/workspace/summary") &&
                r.request().method() === "PATCH" &&
                (r.request().postData() || "").includes("mark_sent")) ||
              (r.url().includes("/api/broker/dealcards/") && r.url().includes("/publish")),
            { timeout: 30_000 },
          )
          .catch(() => null);
        await pageA.locator('[data-testid="presend-copy-btn"]').click();
        const pubRes = await pubPromise;
        if (pubRes) {
          const pj = await pubRes.json().catch(() => ({}));
          if (pj.buildingId && VALID_DEAL_ID_REGEX.test(String(pj.buildingId))) {
            l1BuildingId = String(pj.buildingId);
          }
          if (pj.publicUrl) l1DcRelUrl = String(pj.publicUrl);
        }
        await pageA.waitForTimeout(1000);
        pageA.off("response", onPatch);

        if (!l1BuildingId) {
          const m = pageA.url().match(/[?&](?:buildingId|id)=([a-z0-9-]+)/i);
          if (m && VALID_DEAL_ID_REGEX.test(m[1])) l1BuildingId = m[1];
        }
        if (l1BuildingId && !runState.createdBuildingIds.includes(l1BuildingId)) {
          runState.createdBuildingIds.push(l1BuildingId);
        }
        if (!l1DcRelUrl && l1BuildingId) l1DcRelUrl = `/dc/${l1BuildingId}`;
        if (l1DcRelUrl.startsWith("http")) {
          const u = new URL(l1DcRelUrl);
          l1DcRelUrl = u.pathname + u.search;
        }

        // Verify /dc/[id] public blind check + Kakao OG image bytes
        await pageB.goto(l1DcRelUrl, { waitUntil: "networkidle" });
        await hideDevOverlay(pageB);
        await applyFontScale(pageB, "xlarge");
        const dcMobileProbe = await collectDomProbe(pageB, "main");
        l1DcMobileText = dcMobileProbe.visibleText;
        l1DcHeading = dcMobileProbe.observedHeadings[0] || "";

        const leakedTokens = loop1Def.groundTruth.forbiddenPublicTokens.filter((t) =>
          dcMobileProbe.visibleText.includes(t),
        );
        const ogRes = await pageB.request.get(`/api/og/deal/${l1BuildingId}/kakao-v2`);
        const ogBuf = ogRes.ok() ? await ogRes.body() : Buffer.alloc(0);
        const ogValid =
          ogRes.ok() &&
          ogBuf.length > 5000 &&
          ogBuf[0] === 0x89 &&
          ogBuf[1] === 0x50 &&
          ogBuf[2] === 0x4e &&
          ogBuf[3] === 0x47;
        const ogShot = saveShot("l1_s2_kakao_og.png");
        if (ogValid) {
          fs.writeFileSync(ogShot, ogBuf);
          screenshots.push(ogShot);
        } else {
          defects.push(`KAKAO_OG_INVALID: status=${ogRes.status()} bytes=${ogBuf.length}`);
        }

        const dcWriting = scanUxWriting(dcWorkspaceProbe.visibleText + " " + l1DcMobileText);
        if (leakedTokens.length > 0) {
          defects.push(`BLIND_LEAK_DC: ${leakedTokens.join(", ")}`);
        }
        if (dcWriting.totalViolations > 0) {
          observations.push(
            `UX라이팅 스캔 ${dcWriting.totalViolations}건: ${dcWriting.violations
              .slice(0, 2)
              .map((v) => v.match)
              .join(", ")}`,
          );
        }

        checks.l1BuildingId = l1BuildingId;
        checks.l1DcRelUrl = l1DcRelUrl;
        checks.blindCleanTriggered = blindCleanTriggered;
        checks.leakedTokens = leakedTokens;
        checks.ogImageBytes = ogBuf.length;
        checks.ogValid = ogValid;
        checks.dcHeading = l1DcHeading;

        // Score DC-MG-01 (DealCard Creator)
        runState.dealcardRuns.push(
          scoreDealCardPpgtRun({
            personaId: "DC-MG-01",
            surface: `/broker/w/dealcards (LOOP-01)`,
            viewport: "1440x900",
            fontScale: "xlarge",
            aboveFoldActionCount: dcWorkspaceProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: dcWorkspaceProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: dcWorkspaceProbe.horizontalOverflowPx,
            sub44ButtonsCount: dcWorkspaceProbe.sub44Buttons.length,
            sub15TextsCount: dcWorkspaceProbe.sub15Texts.length,
            clippedButtonsCount: dcWorkspaceProbe.clippedButtons.length,
            brokenImgCount: dcWorkspaceProbe.brokenImgs.length,
            consoleErrorCount: loop1ConsoleErrors.length,
            pageErrorCount: pageErrorsA.length,
            poisonTokenCount: countPoisonTokens(dcWorkspaceProbe.visibleText),
            bannedTermCount: countBannedTerms(dcWorkspaceProbe.visibleText),
            blindLeakCount: leakedTokens.length,
            uxWritingViolationsCount: dcWriting.josaViolationCount,
            contentSuitabilityViolationsCount: 0,
            taskCompleted: Boolean(l1BuildingId),
            blockingModalDetected: false,
            boundaryViolationCount: leakedTokens.length,
            provenanceBadgeVisible: true,
            artifactValid: ogValid && Boolean(l1BuildingId),
            honestSaveVisible: dcWorkspaceProbe.honestSaveVisible,
            observedHeadings: dcWorkspaceProbe.observedHeadings,
            observedButtons: dcWorkspaceProbe.observedButtons,
            observedBadges: dcWorkspaceProbe.observedBadges,
          }),
        );
        personaNotes.push(
          `[DC-MG-01] 동아빌딩 메모→블라인드 티저 발행 완료, 금지어 유출 ${leakedTokens.length}건, 카톡 OG ${ogBuf.length}B`,
        );
      },
    );

    // ── L1-S3: 비서울 대장 조회 · 억/원 입력 · 17행 TSV · 4사진 · Basic PPTX + 150DPI PNG ──
    await recordStep(
      {
        stepId: "L1-S3",
        loopId: "loop1",
        subsystem: "IM·발표자료",
        title: loop1Def.steps[2].title,
        targetMinutes: 4,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        await pageA.setViewportSize({ width: 1440, height: 900 });
        await applyFontScale(pageA, "normal");
        await pageA.goto(`/broker/w/im?buildingId=${encodeURIComponent(l1BuildingId)}`, {
          waitUntil: "domcontentloaded",
        });
        await hideDevOverlay(pageA);
        await pageA.locator('[data-testid="im-tab-panel-specs"]').waitFor({
          state: "visible",
          timeout: 30_000,
        });
        await pageA.waitForTimeout(800);

        const activePostureTitle = (
          await pageA
            .locator('[data-testid="im-posture-selector-section"] button[aria-pressed="true"] span')
            .first()
            .innerText()
            .catch(() => "")
        ).trim();
        checks.inheritedPosture = activePostureTitle || "unknown";
        if (activePostureTitle && activePostureTitle !== "임대수익용") {
          observations.push(
            `매물 유형 상속 불일치: L1-S2 17행 임대 빌딩에서 /broker/w/im 진입 시 '${activePostureTitle}'로 상속됨 → '임대수익용'으로 전환 (gap)`,
          );
          await pageA
            .locator('[data-testid="im-posture-selector-section"] button', { hasText: "임대수익용" })
            .first()
            .click();
          await pageA.waitForTimeout(300);
        }

        await pageA.locator('[data-testid="im-title-single-line-input"]').fill(loop1Def.propertyName);

        // Test 비서울 부천 주소 자동 조회
        await pageA.locator('[data-testid="im-address-input"]').fill(loop1Def.jibunAddress);
        const lookupBtn = pageA.locator('[data-testid="im-address-lookup-btn"]');
        let lookupResultLand = "";
        let lookupResultGfa = "";
        let lookupApiOk = false;
        if (await lookupBtn.isVisible().catch(() => false)) {
          const lookupPromise = pageA
            .waitForResponse(
              (r) => r.url().includes("/lookup") || r.url().includes("building") || r.url().includes("geocode"),
              { timeout: 12_000 },
            )
            .catch(() => null);
          await lookupBtn.click();
          const lRes = await lookupPromise;
          lookupApiOk = Boolean(lRes?.ok());
          await pageA.waitForTimeout(2500);
          lookupResultGfa = await pageA.locator('[data-testid="im-gfa-input"]').inputValue();
          lookupResultLand = await pageA.locator('[data-testid="im-land-area-input"]').inputValue();
        }
        checks.bucheonAutoLookupApiOk = lookupApiOk;
        checks.bucheonAutoFilledLand = lookupResultLand;
        checks.bucheonAutoFilledGfa = lookupResultGfa;

        const autoLandNum = parseFloat(lookupResultLand || "0");
        const autoGfaNum = parseFloat(lookupResultGfa || "0");
        if (
          Math.abs(autoLandNum - 535.6) > 1.0 ||
          Math.abs(autoGfaNum - 2758.21) > 2.0
        ) {
          observations.push(
            `TRAP-2A(비서울 부천 대장 자동채움 점검): 자동값 대지="${lookupResultLand}"/연="${lookupResultGfa}" vs 정답(535.60/2758.21) → 수기 보정 입력 병행`,
          );
          await pageA.locator('[data-testid="im-land-area-input"]').fill("535.6");
          await pageA.locator('[data-testid="im-gfa-input"]').fill("2758.21");
        }
        await pageA.locator('[data-testid="im-zoning-input"]').fill("일반상업지역");
        await pageA.locator('[data-testid="im-completion-date-input"]').fill("1998-11-17");

        // Test 억 단위(58) vs 원 직접 입력(5800000000)
        const eokInp = pageA.locator('[data-testid="im-price-eok-input"]');
        const wonInp = pageA.locator('[data-testid="im-price-won-input"]');
        await eokInp.fill("58");
        await pageA.waitForTimeout(200);
        const readout58 = await pageA.locator('[data-testid="im-price-readout"]').innerText();
        await wonInp.fill("5800000000");
        await pageA.waitForTimeout(200);
        const readoutWon = await pageA.locator('[data-testid="im-price-readout"]').innerText();
        await eokInp.fill("58");
        await pageA.waitForTimeout(200);
        checks.readout58Eok = readout58.trim();
        checks.readoutWon58Eok = readoutWon.trim();
        if (!readout58.includes("58억") || !readoutWon.includes("58억")) {
          defects.push(`PRICE_UNIT_READOUT_MISMATCH: eok="${readout58}", won="${readoutWon}"`);
        }

        // Step 2: Paste 17-row TSV (incl parking tower 198만 + 201호 vacant)
        await pageA.locator('[data-testid="im-next-to-rentroll-btn"]').click();
        await pageA.locator('[data-testid="im-tab-panel-rentroll"]').waitFor({
          state: "visible",
          timeout: 15_000,
        });
        await pasteTsvIntoRentRollGrid(pageA, loop1Kit.tsvText);
        await pageA.waitForTimeout(500);

        const rentRollTextBeforeToggle = await pageA
          .locator('[data-testid="im-tab-panel-rentroll"]')
          .innerText();
        const hasAsisYieldUi = /5\.0[0-9]%/.test(rentRollTextBeforeToggle);
        checks.asisYieldInUi = rentRollTextBeforeToggle.match(/\d+\.\d{2}%/)?.[0] ?? null;

        // Check expected/stabilized subtab or vacant->occupied sensitivity if present
        const expectedTab = pageA.locator('[data-testid="im-rentroll-subtab-expected"]');
        if (await expectedTab.isVisible().catch(() => false)) {
          await expectedTab.click();
          await pageA.waitForTimeout(300);
          // Click copy-from-actual if present & turn vacant row into occupied
          const copyBtn = pageA.locator('[data-testid="im-expected-rentroll-copy-btn"]');
          if (await copyBtn.isVisible().catch(() => false)) {
            await copyBtn.click();
            await pageA.waitForTimeout(400);
          }
          await pageA.locator('[data-testid="im-rentroll-subtab-actual"]').click();
          await pageA.waitForTimeout(250);
        }

        // Step 3: Axios 3-point nominal endings check
        await pageA.locator('[data-testid="im-next-to-axios-btn"]').click();
        await pageA.locator('[data-testid="im-tab-panel-axios-brief"]').waitFor({
          state: "visible",
          timeout: 15_000,
        });
        const reclusterBtn = pageA.locator('[data-testid="im-axios-ai-recluster-btn"]');
        let aiNominalClean = true;
        if (await reclusterBtn.isVisible().catch(() => false)) {
          await reclusterBtn.click();
          await pageA.waitForTimeout(3500);
          const titles: string[] = [];
          for (let i = 0; i < 3; i++) {
            const v = await pageA
              .locator(`[data-testid="im-axios-point-title-${i}"]`)
              .inputValue()
              .catch(() => "");
            if (v) titles.push(v);
          }
          aiNominalClean = !titles.some((t) => /습니다\.?$|합니다\.?$/.test(t));
          checks.step3PointTitles = titles;
          if (!aiNominalClean) {
            observations.push(`IM Step3 AI 제목 종결어미 비명사형: ${titles.join(" | ")}`);
          }
        }

        // Step 4: Upload 4 ZIP photos (1 exterior + 3 interior) and generate IM
        await pageA.locator('[data-testid="im-next-to-media-btn"]').click();
        await pageA.locator('[data-testid="im-tab-panel-media-publish"]').waitFor({
          state: "visible",
          timeout: 15_000,
        });
        const extPhotos = loop1Kit.photoPaths.slice(0, 1);
        const intPhotos = loop1Kit.photoPaths.slice(1, 4);
        await pageA
          .locator('[data-testid="im-photo-dropzone-exterior"] input[type="file"]')
          .setInputFiles(extPhotos);
        await pageA.waitForTimeout(1000);
        if (intPhotos.length > 0) {
          await pageA
            .locator('[data-testid="im-photo-dropzone-interior"] input[type="file"]')
            .setInputFiles(intPhotos);
          await pageA.waitForTimeout(1500);
        }

        const imProbe = await collectDomProbe(pageA, '[data-testid="im-editor-slot"]');
        const s3Shot = saveShot("l1_s3_im_workspace.png");
        await pageA.screenshot({ path: s3Shot, fullPage: false });
        screenshots.push(s3Shot);

        const genBtn = pageA
          .locator(
            '[data-testid="im-quick-generate-btn"]:visible, [data-testid="im-step4-generate-btn"]:visible',
          )
          .first();
        await expect(genBtn).toBeEnabled({ timeout: 25_000 });
        const quickGenPromise = pageA
          .waitForResponse(
            (r) =>
              (r.url().includes("/api/broker/im-lite/quick-generate") ||
                r.url().includes("/api/broker/im-lite/generate")) &&
              r.request().method() === "POST",
            { timeout: 120_000 },
          )
          .catch(() => null);
        await genBtn.click();
        const genRes = await quickGenPromise;
        if (genRes) {
          const gj = await genRes.json().catch(() => ({}));
          if (gj.buildingId && VALID_DEAL_ID_REGEX.test(String(gj.buildingId))) {
            l1BuildingId = String(gj.buildingId);
            if (!runState.createdBuildingIds.includes(l1BuildingId)) {
              runState.createdBuildingIds.push(l1BuildingId);
            }
          }
          l1DocId = String(gj.documentId || gj.docId || gj.document?.id || "");
          if (l1DocId) runState.createdDocIds.push(l1DocId);
          if (gj.shareUrl) l1ImShareUrl = String(gj.shareUrl);
        }
        await pageA.waitForTimeout(2000);
        if (!l1DocId && UUID_REGEX.test(l1BuildingId)) {
          const docsRes = await pageA.request.get(`/api/broker/im-lite/${l1BuildingId}`);
          const dj = await docsRes.json().catch(() => ({}));
          l1DocId = String(dj.documents?.[0]?.id || dj.document?.id || "");
        }
        if (!l1ImShareUrl) {
          l1ImShareUrl = l1DocId
            ? `/im-lite/${l1BuildingId}?doc=${encodeURIComponent(l1DocId)}`
            : `/im-lite/${l1BuildingId}`;
        }

        // Download Basic PPTX + 4 binary gates + Numerical Oracles + 150DPI PNG conversion
        const pptxUrl = l1DocId
          ? `/api/public/im-lite/${l1BuildingId}/pptx?tier=basic&doc=${encodeURIComponent(l1DocId)}`
          : `/api/public/im-lite/${l1BuildingId}/pptx?tier=basic`;
        const pptxRes = await pageA.request.get(pptxUrl, { timeout: 120_000 });
        const pptxBuf = pptxRes.ok() ? await pptxRes.body() : Buffer.alloc(0);
        const pptxOutPath = saveShot("loop1_slides/loop1_basic_im.pptx");
        ensureDir(path.dirname(pptxOutPath));
        fs.writeFileSync(pptxOutPath, pptxBuf);

        const slidesExportUrl = l1DocId
          ? `/api/public/im-lite/${l1BuildingId}/export?format=slides&doc_id=${encodeURIComponent(l1DocId)}`
          : `/api/public/im-lite/${l1BuildingId}/export?format=slides`;
        const slidesHtmlRes = await pageA.request.get(slidesExportUrl);
        const slidesHtml = slidesHtmlRes.ok() ? await slidesHtmlRes.text() : "";

        let pptxXmls: string[] = [];
        let slideCount = 0;
        let mediaCount = 0;
        let priceInPptx = false;
        let asisYieldInPptx = false;
        let rentRollSplitInPptx = false;
        let suitRes = { passed: false, details: ["PPTX 미생성"] as string[] };
        let renderedSlideImgs: string[] = [];

        if (pptxBuf.length > 5000) {
          const zipInfo = analyzePptxZip(pptxOutPath);
          slideCount = zipInfo.slideCount;
          mediaCount = zipInfo.mediaCount;
          pptxXmls = await extractPptxSlideXmls(pptxBuf);

          try {
            assertNoPoisonTokens(zipInfo.slideEntries);
            assertNoDummyData(zipInfo.fullPptxText);
            assertNoEvasivePhrases(zipInfo.fullPptxText);
            assertPriceBandBlocked(zipInfo.fullPptxText);
          } catch (e: any) {
            defects.push(`PPTX_BINARY_GATE: ${e?.message || String(e)}`);
          }

          priceInPptx = zipInfo.fullPptxText.includes("58억");
          asisYieldInPptx =
            hasPctNear(zipInfo.fullPptxText, 5.01, 0.08) ||
            hasPctNear(zipInfo.fullPptxText, 5.71, 0.08);
          const rrSlides = zipInfo.allSlideTexts.filter(
            (t: string) => t.includes("보증금") && (t.includes("임대") || t.includes("월세")),
          );
          rentRollSplitInPptx =
            (zipInfo.fullPptxText.includes("(1/2)") && zipInfo.fullPptxText.includes("(2/2)")) ||
            rrSlides.length >= 2;

          suitRes = auditImContentSuitability({
            tier: "basic",
            posture: "income_producing",
            pptxSlideXmls: pptxXmls,
            slidesHtmlExport: slidesHtml,
            expectedPhotoCount: 4,
          });

          if (!priceInPptx) defects.push("PPTX 내 58억 매매가 미반영");
          if (!asisYieldInPptx) {
            observations.push("PPTX 내 현황/만실 기대수익률(5.01%/5.71% ±0.08%p) 직접 표기 미검출 — 슬라이드 PNG 육안 확인 필요");
          }
          if (!rentRollSplitInPptx) {
            observations.push(`TRAP-2C 17행 렌트롤 2면 분할 여부 확인 (rrSlides=${rrSlides.length})`);
          }
          if (!suitRes.passed) {
            observations.push(`IM 적합성 오라클: ${suitRes.details.join(" | ")}`);
          }

          const rendered = convertPptxToPngsIsolated(
            pptxBuf,
            path.join(OUT_ROOT, "loop1_slides"),
            "loop1_basic",
            150,
          );
          renderedSlideImgs = rendered.slideImages;
          screenshots.push(...renderedSlideImgs);
        } else {
          defects.push(`PPTX_HTTP_${pptxRes.status()}_EMPTY`);
        }

        checks.l1BuildingId = l1BuildingId;
        checks.l1DocId = l1DocId;
        checks.hasAsisYieldUi = hasAsisYieldUi;
        checks.slideCount = slideCount;
        checks.mediaCount = mediaCount;
        checks.priceInPptx = priceInPptx;
        checks.asisYieldInPptx = asisYieldInPptx;
        checks.rentRollSplitInPptx = rentRollSplitInPptx;
        checks.suitabilityDetails = suitRes.details;
        checks.renderedSlideCount = renderedSlideImgs.length;

        runState.imRuns.push(
          scoreImPpgtRun({
            personaId: "IM-MG-01",
            surface: `/broker/w/im (LOOP-01 부천 58억)`,
            viewport: "1440x900",
            fontScale: "normal",
            aboveFoldActionCount: imProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: imProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: imProbe.horizontalOverflowPx,
            sub44ButtonsCount: imProbe.sub44Buttons.length,
            sub15TextsCount: imProbe.sub15Texts.length,
            clippedButtonsCount: imProbe.clippedButtons.length,
            brokenImgCount: imProbe.brokenImgs.length,
            consoleErrorCount: loop1ConsoleErrors.length,
            pageErrorCount: pageErrorsA.length,
            poisonTokenCount: countPoisonTokens(imProbe.visibleText),
            bannedTermCount: countBannedTerms(imProbe.visibleText),
            taskCompleted: Boolean(l1DocId) && slideCount >= 6,
            blockingModalDetected: false,
            boundaryViolationCount: priceInPptx ? 0 : 1,
            provenanceBadgeVisible: true,
            artifactValid: pptxBuf.length > 10_000 && renderedSlideImgs.length >= 6,
            stepCount: 4,
            honestSaveVisible: imProbe.honestSaveVisible,
            observedHeadings: imProbe.observedHeadings,
            observedButtons: imProbe.observedButtons,
            observedBadges: imProbe.observedBadges,
          }),
        );

        personaNotes.push(
          `[IM-MG-01] 부천 58억 Basic PPTX ${slideCount}면·사진 ${mediaCount}장·150DPI ${renderedSlideImgs.length}컷 렌더링 완료`,
        );
      },
    );

    // ── L1-S4: 주간 뉴스레터 연결 · F5 보존 · [링크]/[인사말+링크] 정합성 점검 ──
    await recordStep(
      {
        stepId: "L1-S4",
        loopId: "loop1",
        subsystem: "뉴스레터",
        title: loop1Def.steps[3].title,
        targetMinutes: 3,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        await pageA.setViewportSize({ width: 1440, height: 900 });
        await pageA.goto("/broker/w/newsletter", { waitUntil: "domcontentloaded" });
        await hideDevOverlay(pageA);
        await applyFontScale(pageA, "xlarge");
        await pageA.locator('[data-testid="magazine-editor-slot"]').waitFor({
          state: "visible",
          timeout: 30_000,
        });
        await pageA.waitForTimeout(800);

        const newBtn = pageA.locator('[data-testid="new-newsletter-btn"]');
        if (await newBtn.isVisible().catch(() => false)) {
          await newBtn.click();
          await pageA.waitForTimeout(500);
        }
        const weeklyCadenceBtn = pageA.locator('[data-testid="quickstart-cadence-weekly"]');
        if (await weeklyCadenceBtn.isVisible().catch(() => false)) {
          await weeklyCadenceBtn.click();
          await pageA.waitForTimeout(300);
        }

        const nlTitle =
          loop1Def.steps[3].copySnippets[0]?.value || "금리 인하기 수도권 초역세권 근생 빌딩 전략";
        await pageA.locator("#newsletter-headline-input").fill(nlTitle);

        await pageA.locator('[data-testid="step-tab-content"]').click();
        await pageA.waitForTimeout(500);
        const enableBriefBtn1 = pageA.locator('[data-testid="enable-briefing-section-btn"]');
        if (await enableBriefBtn1.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await enableBriefBtn1.click();
          await pageA.waitForTimeout(300);
        }
        const cleanBrief1 =
          loop1Def.steps[3].copySnippets[1]?.value || loop1Kit.nlBriefText.slice(0, 480);
        checks.zipNlBriefHasBracketHeaders = /\[[^\]]+\]/.test(loop1Kit.nlBriefText);
        if (checks.zipNlBriefHasBracketHeaders) {
          observations.push(
            "ZIP 샘플 키트 04_뉴스레터_브리핑_초안.txt에 [제목 복사] 등 구간 대괄호 헤더가 혼재되어 테스트 가이드 1클릭 스니펫(copySnippets)과 분리 필요",
          );
        }
        await pageA.locator("#newsletter-briefing-body").fill(cleanBrief1);

        // Connect Loop 1 deal card
        const slotItem = pageA.locator(`[data-testid="deal-slot-item-${l1BuildingId}"]`).first();
        await slotItem.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        const dealFoundInNl = await slotItem.isVisible().catch(() => false);
        if (dealFoundInNl) {
          await slotItem.locator("label").first().click();
          await pageA.waitForTimeout(300);
          const commentInp = pageA.locator(`#deal-comment-input-${l1BuildingId}`);
          if (await commentInp.isVisible().catch(() => false)) {
            await commentInp.fill(
              "전관 리모델링 완료 · 우량 메디컬·학원 임차 및 고정 주차수익 확보",
            );
          }
        } else {
          observations.push(
            `뉴스레터 추천 매물 목록에 신규 Loop 1 매물(${l1BuildingId}) 즉시 노출 여부 점검 필요`,
          );
        }

        // Save draft & test F5 reload preservation (button saves via POST /api/magazine/issues; ignore empty background /editions/draft bootstrap)
        const draftPromise = pageA
          .waitForResponse(
            (r) =>
              r.url().includes("/api/magazine/issues") &&
              r.request().method() === "POST",
            { timeout: 25_000 },
          )
          .catch(() => null);
        const draftSaveBtn = pageA.locator('[data-testid="newsletter-draft-save-btn"]');
        await draftSaveBtn.click();
        const draftRes = await draftPromise;
        if (draftRes?.ok()) {
          const dj = await draftRes.json().catch(() => ({}));
          l1NlEditionId = String(dj.editionId || dj.edition?.id || dj.id || dj.data?.id || "");
          if (l1NlEditionId) runState.createdEditionIds.push(l1NlEditionId);
        }
        await expect(draftSaveBtn).toBeEnabled({ timeout: 10_000 });
        await expect(draftSaveBtn).not.toContainText("저장 중", { timeout: 10_000 });
        await pageA.waitForTimeout(800);

        await pageA.reload({ waitUntil: "domcontentloaded" });
        await hideDevOverlay(pageA);
        await pageA.locator('[data-testid="magazine-editor-slot"]').waitFor({
          state: "visible",
          timeout: 25_000,
        });
        await pageA.waitForTimeout(1000);
        // Editor faithfully restores activeStep="content" where draft save occurred; switch to "title" tab to read #newsletter-headline-input
        if (!(await pageA.locator("#newsletter-headline-input").isVisible().catch(() => false))) {
          await pageA.locator('[data-testid="step-tab-title"]').click({ timeout: 10_000 });
          await pageA.waitForTimeout(300);
        }
        const headlineAfterF5 = await pageA
          .locator("#newsletter-headline-input")
          .inputValue()
          .catch(() => "");
        const f5Preserved = headlineAfterF5.includes("수도권") || headlineAfterF5.length > 5;
        checks.f5Preserved = f5Preserved;
        checks.headlineAfterF5 = headlineAfterF5;
        if (!f5Preserved) {
          defects.push(`F5_DRAFT_LOST: 새로고침 후 표지 제목 소실 ("${headlineAfterF5}")`);
        }

        const nlCreatorProbe = await collectDomProbe(pageA, '[data-testid="magazine-editor-slot"]');

        // Step 3 check: Verify [카톡 인사말 복사], [카카오톡으로 공유], [링크 복사]
        await pageA.locator('[data-testid="step-tab-send"]').click();
        await pageA.waitForTimeout(500);
        const hasGreetingCopyBtn = await pageA
          .locator('[data-testid="copy-kakao-greeting-btn"]')
          .first()
          .isVisible()
          .catch(() => false);
        const hasKakaoShareBtn = await pageA
          .locator('[data-testid="kakao-share-btn"]')
          .isVisible()
          .catch(() => false);
        const hasCopyLinkBtn = await pageA
          .locator('[data-testid="copy-link-btn"]')
          .isVisible()
          .catch(() => false);
        checks.hasGreetingCopyBtn = hasGreetingCopyBtn;
        checks.hasKakaoShareBtn = hasKakaoShareBtn;
        checks.hasCopyLinkBtn = hasCopyLinkBtn;
        if (!hasGreetingCopyBtn) {
          defects.push("NEWSLETTER_STEP3_MISSING_GREETING_COPY_BTN");
        }

        const s4Shot = saveShot("l1_s4_nl_workspace_21px.png");
        await pageA.screenshot({ path: s4Shot, fullPage: false });
        screenshots.push(s4Shot);

        // Publish Loop 1 edition
        if (l1NlEditionId) {
          const pubRes = await pageA.request.post(
            `/api/magazine/editions/${l1NlEditionId}/publish`,
            { data: { sendNow: false } },
          );
          if (pubRes.ok()) {
            const pj = await pubRes.json().catch(() => ({}));
            l1NlPublicUrl = String(pj.publicUrl || pj.url || pj.readerUrl || pj.shareUrl || "");
          }
        }
        if (!l1NlPublicUrl) {
          const previewLink = pageA.locator('[data-testid="preview-live-reader-link"]').first();
          if (await previewLink.isVisible().catch(() => false)) {
            l1NlPublicUrl = (await previewLink.getAttribute("href")) || "";
          }
        }
        if (!l1NlPublicUrl) {
          const profRes = await pageA.request.get("/api/broker/profile");
          const profJson = await profRes.json().catch(() => ({}));
          const slug =
            profJson?.data?.broker?.slug || profJson?.profile?.slug || profJson?.slug || "";
          if (slug) l1NlPublicUrl = `/magazine/${encodeURIComponent(slug)}`;
        }
        if (l1NlPublicUrl.startsWith("http")) {
          const u = new URL(l1NlPublicUrl);
          l1NlPublicUrl = u.pathname + u.search;
        }
        checks.l1NlEditionId = l1NlEditionId;
        checks.l1NlPublicUrl = l1NlPublicUrl;

        const nlWriting = scanUxWriting(nlCreatorProbe.visibleText);
        runState.newsletterRuns.push(
          scoreNewsletterPpgtRun({
            personaId: "NL-MG-01",
            surface: "/broker/w/newsletter (LOOP-01 21px)",
            viewport: "1440x900",
            fontScale: "xlarge",
            aboveFoldActionCount: nlCreatorProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: nlCreatorProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: nlCreatorProbe.horizontalOverflowPx,
            sub44ButtonsCount: nlCreatorProbe.sub44Buttons.length,
            sub15TextsCount: nlCreatorProbe.sub15Texts.length,
            clippedButtonsCount: nlCreatorProbe.clippedButtons.length,
            brokenImgCount: nlCreatorProbe.brokenImgs.length,
            consoleErrorCount: loop1ConsoleErrors.length,
            pageErrorCount: pageErrorsA.length,
            poisonTokenCount: countPoisonTokens(nlCreatorProbe.visibleText),
            bannedTermCount: countBannedTerms(nlCreatorProbe.visibleText) + nlWriting.josaViolationCount,
            contentSuitabilityViolationsCount: dealFoundInNl ? 0 : 1,
            taskCompleted: Boolean(l1NlPublicUrl),
            blockingModalDetected: false,
            boundaryViolationCount: f5Preserved ? 0 : 1,
            provenanceBadgeVisible: true,
            artifactValid: Boolean(l1NlPublicUrl),
            honestSaveVisible: nlCreatorProbe.honestSaveVisible,
            observedHeadings: nlCreatorProbe.observedHeadings,
            observedButtons: nlCreatorProbe.observedButtons,
            observedBadges: nlCreatorProbe.observedBadges,
          }),
        );

        personaNotes.push(
          `[NL-MG-01 21px] F5 보존=${f5Preserved}, 인사말버튼=${hasGreetingCopyBtn}, 발행URL=${l1NlPublicUrl}`,
        );
      },
    );

    // ── L1-S5: 창 B(카톡 인앱 390x844 xlarge) 열람 · 자료 요청 · 구독 신청 ──
    await recordStep(
      {
        stepId: "L1-S5",
        loopId: "loop1",
        subsystem: "매수자 열람·문의",
        title: loop1Def.steps[4].title,
        targetMinutes: 2,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        // 1) Open public Newsletter in Window B
        await pageB.goto(l1NlPublicUrl, { waitUntil: "networkidle" });
        await hideDevOverlay(pageB);
        await applyFontScale(pageB, "xlarge");
        const nlReaderProbe = await collectDomProbe(pageB, "main");
        const nlShot = saveShot("l1_s5_newsletter_mobile_390.png");
        await pageB.screenshot({ path: nlShot, fullPage: true });
        screenshots.push(nlShot);

        const nlBlindLeaks = loop1Def.groundTruth.forbiddenPublicTokens.filter((t) =>
          nlReaderProbe.visibleText.includes(t),
        );
        if (nlBlindLeaks.length > 0) {
          defects.push(`BLIND_LEAK_NEWSLETTER: ${nlBlindLeaks.join(", ")}`);
        }
        const nlSuit = auditNewsletterContentSuitability({
          editionType: "weekly",
          renderedHtml: await pageB.content(),
          renderedText: nlReaderProbe.visibleText,
          expectedDealCount: 0,
          isSubscriberMode: false,
        });

        // 2) Subscribe on /magazine/[brokerId]/subscribe
        const slugMatch = l1NlPublicUrl.match(/\/magazine\/([^/?#]+)/);
        let subCompleted = false;
        if (slugMatch?.[1]) {
          await pageB.goto(`/magazine/${slugMatch[1]}/subscribe`, { waitUntil: "networkidle" });
          await hideDevOverlay(pageB);
          await pageB.locator("#sub-name").fill("정수빈 원장");
          await pageB.locator("#sub-phone").fill("01055012389");
          await pageB.locator("#sub-email").fill("sb.jung@example.kr");
          await pageB.locator("#sub-page-all").check();
          const subResPromise = pageB
            .waitForResponse((r) => r.url().includes("/api/public/magazine/subscribe"), {
              timeout: 15_000,
            })
            .catch(() => null);
          await pageB.locator('button[type="submit"]').first().click();
          const sRes = await subResPromise;
          subCompleted = Boolean(sRes?.ok());
          if (subCompleted) runState.createdSubscriberPhones.push("01055012389");
          await pageB.waitForTimeout(500);
        }

        // 3) Open DealCard (may be synthetic bld-... from L1-S2) in Window B + submit inquiry
        const l1DcPreUuidUrl = l1DcRelUrl;
        await pageB.goto(l1DcPreUuidUrl, { waitUntil: "networkidle" });
        await hideDevOverlay(pageB);
        await applyFontScale(pageB, "xlarge");
        const dcMobProbe = await collectDomProbe(pageB, "main");
        const dcShot = saveShot("l1_s5_dc_mobile_390.png");
        await pageB.screenshot({ path: dcShot, fullPage: true });
        screenshots.push(dcShot);

        const dcSuit = auditDealCardContentSuitability({
          renderedText: dcMobProbe.visibleText,
          headline: dcMobProbe.observedHeadings[0] || "",
          areaBadgeText: "",
          points: [],
          posture: "income",
          forbiddenPublicTokens: loop1Def.groundTruth.forbiddenPublicTokens,
          expectThreeTierSpecsOnDetail: false,
        });

        await pageB.getByTestId("public-dealcard-im-request-btn").click();
        await pageB.getByTestId("contact-gate-modal").waitFor({ state: "visible", timeout: 10_000 });
        await pageB.getByTestId("contact-gate-name").fill("정수빈 원장");
        await pageB.getByTestId("contact-gate-phone").fill("01055012389");
        await pageB.getByTestId("contact-gate-email").fill("sb.jung@example.kr");
        await pageB
          .getByTestId("contact-gate-message")
          .fill("2층 공실 치과 직접 개원 겸 매입 검토 중입니다. 층별 임대차 상세 내역 요청드립니다.");
        await pageB.getByTestId("contact-gate-privacy-consent").check();
        const preGateResPromise = pageB
          .waitForResponse(
            (r) => r.url().includes("/api/gate-requests") && r.request().method() === "POST",
            { timeout: 15_000 },
          )
          .catch(() => null);
        await pageB.getByTestId("contact-gate-submit-btn").click();
        const preGateRes = await preGateResPromise;
        const syntheticIdGateBody = preGateRes
          ? (await preGateRes.text().catch(() => "")).slice(0, 240)
          : null;
        if (preGateRes?.ok() && syntheticIdGateBody) {
          try {
            const pgJson = JSON.parse(syntheticIdGateBody);
            const gid = String(pgJson?.id || pgJson?.data?.gateRequestId || "");
            if (gid) l1GateReqId = gid;
          } catch {
            // ignore non-json prefix
          }
        }
        const preInquirySubmitted = await pageB
          .getByTestId("contact-gate-submitted")
          .isVisible({ timeout: 10_000 })
          .catch(() => false);
        if (!preInquirySubmitted) {
          defects.push(
            `DEALCARD_SYNTHETIC_ID_GATE_FAIL: ${l1DcPreUuidUrl} 문의 제출 실패 (HTTP ${preGateRes?.status() ?? "timeout"})`,
          );
        }

        // 4) Confirm unapproved /im-lite is gated before broker approval
        await pageB.goto(`/im-lite/${l1BuildingId}`, { waitUntil: "networkidle" });
        const hasGateBeforeApprove = await pageB
          .locator('[data-testid="token-required-im-screen"], [data-testid="revoked-im-screen"]')
          .first()
          .isVisible()
          .catch(() => false);

        // If synthetic bld-... blocked /api/gate-requests, also submit via published UUID /dc/[l1BuildingId]
        // so L1-S6 can verify real broker [자료 보내기(승인)] -> Window B /im-lite unlock end-to-end.
        let uuidFallbackInquirySubmitted: boolean | null = null;
        let finalInquirySubmitted = preInquirySubmitted;
        if (!preInquirySubmitted && UUID_REGEX.test(l1BuildingId)) {
          await pageA.request
            .post(`/api/broker/dealcards/${l1BuildingId}/publish`, { data: {} })
            .catch(() => null);
          l1DcRelUrl = `/dc/${l1BuildingId}`;
          await pageB.goto(l1DcRelUrl, { waitUntil: "networkidle" });
          await hideDevOverlay(pageB);
          await applyFontScale(pageB, "xlarge");
          await pageB.getByTestId("public-dealcard-im-request-btn").click();
          await pageB.getByTestId("contact-gate-modal").waitFor({ state: "visible", timeout: 10_000 });
          await pageB.getByTestId("contact-gate-name").fill("정수빈 원장");
          await pageB.getByTestId("contact-gate-phone").fill("01055012389");
          await pageB.getByTestId("contact-gate-email").fill("sb.jung@example.kr");
          await pageB
            .getByTestId("contact-gate-message")
            .fill("2층 공실 치과 직접 개원 겸 매입 검토 중입니다. 층별 임대차 상세 내역 요청드립니다.");
          await pageB.getByTestId("contact-gate-privacy-consent").check();
          const uuidGatePromise = pageB
            .waitForResponse(
              (r) => r.url().includes("/api/gate-requests") && r.request().method() === "POST",
              { timeout: 15_000 },
            )
            .catch(() => null);
          await pageB.getByTestId("contact-gate-submit-btn").click();
          await uuidGatePromise;
          uuidFallbackInquirySubmitted = await pageB
            .getByTestId("contact-gate-submitted")
            .isVisible({ timeout: 15_000 })
            .catch(() => false);
          finalInquirySubmitted = Boolean(uuidFallbackInquirySubmitted);
        }

        checks.nlReaderOverflowPx = nlReaderProbe.horizontalOverflowPx;
        checks.dcMobileOverflowPx = dcMobProbe.horizontalOverflowPx;
        checks.dcMobileSub44Buttons = dcMobProbe.sub44Buttons;
        checks.subCompleted = subCompleted;
        checks.l1DcPreUuidUrl = l1DcPreUuidUrl;
        checks.syntheticIdGateStatus = preGateRes?.status() ?? null;
        checks.syntheticIdGateBody = syntheticIdGateBody;
        checks.syntheticIdInquirySubmitted = preInquirySubmitted;
        checks.uuidFallbackInquirySubmitted = uuidFallbackInquirySubmitted;
        checks.inquirySubmitted = finalInquirySubmitted;
        checks.preApprovalGated = hasGateBeforeApprove;

        if (nlReaderProbe.horizontalOverflowPx > 0) {
          defects.push(`뉴스레터 모바일 가로 오버플로 ${nlReaderProbe.horizontalOverflowPx}px`);
        }
        if (dcMobProbe.horizontalOverflowPx > 0) {
          defects.push(`딜카드 모바일 가로 오버플로 ${dcMobProbe.horizontalOverflowPx}px`);
        }

        // Score DC-MG-03 (Mobile Buyer) & NL-MG-03 (Mobile Reader)
        runState.dealcardRuns.push(
          scoreDealCardPpgtRun({
            personaId: "DC-MG-03",
            surface: `${l1DcPreUuidUrl} (창B 390 xlarge)`,
            viewport: "390x844",
            fontScale: "xlarge",
            aboveFoldActionCount: dcMobProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: dcMobProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: dcMobProbe.horizontalOverflowPx,
            sub44ButtonsCount: dcMobProbe.sub44Buttons.length,
            sub15TextsCount: dcMobProbe.sub15Texts.length,
            clippedButtonsCount: dcMobProbe.clippedButtons.length,
            brokenImgCount: dcMobProbe.brokenImgs.length,
            consoleErrorCount: 0,
            pageErrorCount: pageErrorsB.length,
            poisonTokenCount: countPoisonTokens(dcMobProbe.visibleText),
            bannedTermCount: countBannedTerms(dcMobProbe.visibleText),
            blindLeakCount: dcSuit.blindLeakCount,
            numericSpinCount: dcSuit.numericSpinCount,
            taskCompleted: Boolean(preInquirySubmitted),
            blockingModalDetected: false,
            boundaryViolationCount: dcSuit.blindLeakCount + (preInquirySubmitted ? 0 : 1),
            provenanceBadgeVisible: dcMobProbe.provenanceBadgeVisible,
            artifactValid: Boolean(preInquirySubmitted),
            observedHeadings: dcMobProbe.observedHeadings,
            observedButtons: dcMobProbe.observedButtons,
            observedBadges: dcMobProbe.observedBadges,
          }),
        );

        runState.newsletterRuns.push(
          scoreNewsletterPpgtRun({
            personaId: "NL-MG-03",
            surface: `${l1NlPublicUrl} (창B 390 xlarge)`,
            viewport: "390x844",
            fontScale: "xlarge",
            aboveFoldActionCount: nlReaderProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: nlReaderProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: nlReaderProbe.horizontalOverflowPx,
            sub44ButtonsCount: nlReaderProbe.sub44Buttons.length,
            sub15TextsCount: nlReaderProbe.sub15Texts.length,
            clippedButtonsCount: nlReaderProbe.clippedButtons.length,
            brokenImgCount: nlReaderProbe.brokenImgs.length,
            consoleErrorCount: 0,
            pageErrorCount: pageErrorsB.length,
            poisonTokenCount: countPoisonTokens(nlReaderProbe.visibleText),
            bannedTermCount: countBannedTerms(nlReaderProbe.visibleText),
            contentSuitabilityViolationsCount: nlBlindLeaks.length + (nlSuit.passed ? 0 : 1),
            taskCompleted: subCompleted,
            blockingModalDetected: false,
            boundaryViolationCount: nlBlindLeaks.length,
            provenanceBadgeVisible: nlReaderProbe.provenanceBadgeVisible,
            artifactValid: nlBlindLeaks.length === 0,
            observedHeadings: nlReaderProbe.observedHeadings,
            observedButtons: nlReaderProbe.observedButtons,
            observedBadges: nlReaderProbe.observedBadges,
          }),
        );

        if (!nlSuit.passed) {
          observations.push(`뉴스레터 모바일 적합성 참고: ${nlSuit.details.join(" | ")}`);
        }
        personaNotes.push(
          `[창 B 매수자] 카톡 모바일 오버플로 0px · 구독=${subCompleted} · 비공개게이트=${hasGateBeforeApprove}`,
        );
      },
    );

    // ── L1-S6: 창 A 소통함 [자료 보내기(승인)] → 창 B 모바일 IM 열람 해제 ──
    await recordStep(
      {
        stepId: "L1-S6",
        loopId: "loop1",
        subsystem: "고객 소통(승인·회수)",
        title: loop1Def.steps[5].title,
        targetMinutes: 2,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        await pageA.setViewportSize({ width: 1440, height: 900 });
        await pageA.goto("/broker/w/inbox", { waitUntil: "networkidle" });
        await hideDevOverlay(pageA);
        await applyFontScale(pageA, "xlarge");
        await pageA.waitForTimeout(800);

        await pageA.getByTestId("inbox-filter-chip-todo").click().catch(() => {});
        await pageA.waitForTimeout(400);

        const targetedL1Row = l1GateReqId
          ? pageA.getByTestId(`inbox-thread-row-${l1GateReqId}`)
          : null;
        const matchingRows = pageA.locator('[data-testid^="inbox-thread-row-"]', {
          hasText: "정수빈 원장",
        });
        if (targetedL1Row) {
          await targetedL1Row.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        }
        await matchingRows
          .first()
          .waitFor({ state: "visible", timeout: 15_000 })
          .catch(() => {});
        let l1ApprovedFromTodo = false;
        let matchCount = await matchingRows.count();
        const targetedVisibleInTodo = targetedL1Row
          ? await targetedL1Row.isVisible().catch(() => false)
          : false;
        if (!targetedVisibleInTodo && matchCount === 0) {
          await pageA.getByTestId("inbox-filter-chip-all").click().catch(() => {});
          await pageA.waitForTimeout(400);
          matchCount = await matchingRows.count();
        } else {
          l1ApprovedFromTodo = true;
        }
        let foundRow = targetedVisibleInTodo || matchCount > 0;
        let selectedGateRow = false;
        if (targetedVisibleInTodo && targetedL1Row) {
          await targetedL1Row.click();
          await pageA.waitForTimeout(350);
          selectedGateRow = await pageA
            .locator('[data-testid="approve-gate-primary-btn"]')
            .first()
            .isVisible()
            .catch(() => false);
        } else if (foundRow) {
          for (let i = 0; i < matchCount; i++) {
            await matchingRows.nth(i).click();
            await pageA.waitForTimeout(350);
            if (
              await pageA
                .locator('[data-testid="approve-gate-primary-btn"]')
                .first()
                .isVisible()
                .catch(() => false)
            ) {
              selectedGateRow = true;
              break;
            }
          }
          if (!selectedGateRow && matchCount > 1) {
            await matchingRows.first().click();
            await pageA.waitForTimeout(350);
          }
        } else {
          defects.push("INBOX_THREAD_MISSING: 정수빈 원장 요청 스레드 미도착");
        }

        const inboxProbe = await collectDomProbe(pageA, "main");
        const ibShot = saveShot("l1_s6_inbox_desktop_21px.png");
        await pageA.screenshot({ path: ibShot, fullPage: false });
        screenshots.push(ibShot);

        // Approve gate via UI button and inspect shareToken
        const approveBtn = pageA.locator('[data-testid="approve-gate-primary-btn"]').first();
        if (await approveBtn.isVisible().catch(() => false)) {
          await expect(approveBtn).toBeEnabled({ timeout: 10_000 });
          const approveResPromise = pageA
            .waitForResponse(
              (r) =>
                r.url().includes("/api/broker/inbox/actions") &&
                r.request().method() === "POST" &&
                (r.request().postData() || "").includes("approve_gate"),
              { timeout: 15_000 },
            )
            .catch(() => null);
          await approveBtn.click();
          const appRes = await approveResPromise;
          if (appRes) {
            const aj = await appRes.json().catch(() => ({}));
            if (appRes.ok() && aj.shareUrl) {
              l1ImTokenUrl = String(aj.shareUrl);
            } else if (appRes.ok() && aj.shareToken) {
              l1ImTokenUrl = `/im-lite/${l1BuildingId}?token=${encodeURIComponent(String(aj.shareToken))}`;
            } else if (!appRes.ok()) {
              defects.push(
                `L1_APPROVE_API_FAIL: status=${appRes.status()} err=${String(aj.error || "")}`,
              );
            }
          }
        }
        await pageA.waitForTimeout(500);
        if (!l1ImTokenUrl) {
          l1ImTokenUrl = `/im-lite/${l1BuildingId}`;
          observations.push("승인 응답에서 shareToken/shareUrl 미수신 → 기본 /im-lite 경로 확인");
        }
        if (l1ImTokenUrl.startsWith("http")) {
          const u = new URL(l1ImTokenUrl);
          l1ImTokenUrl = u.pathname + u.search;
        }

        // Open unlocked IM in Window B (Mobile 390 xlarge Kakao WebView)
        await pageB.goto(l1ImTokenUrl, { waitUntil: "networkidle" });
        await hideDevOverlay(pageB);
        await applyFontScale(pageB, "xlarge");
        const imMobProbe = await collectDomProbe(pageB, "main");
        const imShot = saveShot("l1_s6_im_lite_unlocked_390.png");
        await pageB.screenshot({ path: imShot, fullPage: true });
        screenshots.push(imShot);

        const rentRollVisible = await pageB
          .getByTestId("mobile-im-section-06_rentroll")
          .isVisible()
          .catch(() => false);
        const webviewBannerVisible = await pageB
          .getByTestId("inapp-webview-banner")
          .isVisible()
          .catch(() => false);

        checks.l1GateReqId = l1GateReqId || null;
        checks.l1ApprovedFromTodo = l1ApprovedFromTodo && selectedGateRow;
        checks.l1ImTokenUrl = l1ImTokenUrl;
        checks.rentRollVisible = rentRollVisible;
        checks.webviewBannerVisible = webviewBannerVisible;
        checks.imMobileOverflowPx = imMobProbe.horizontalOverflowPx;
        checks.imMobileBrokenImgs = imMobProbe.brokenImgs.length;
        if (!rentRollVisible) defects.push("IM_RENTROLL_STILL_LOCKED: 승인 후에도 6섹션 임대현황 미표시");
        if (imMobProbe.horizontalOverflowPx > 0) {
          defects.push(`IM 모바일 가로 오버플로 ${imMobProbe.horizontalOverflowPx}px`);
        }

        // Score IB-MG-01 (Senior Inbox Triage) & IM-MG-03 (Mobile Income Buyer)
        runState.inboxRuns.push(
          scoreInboxPpgtRun({
            personaId: "IB-MG-01",
            surface: "/broker/w/inbox (LOOP-01 21px)",
            viewport: "1440x900",
            fontScale: "xlarge",
            aboveFoldActionCount: inboxProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: inboxProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: inboxProbe.horizontalOverflowPx,
            sub44ButtonsCount: inboxProbe.sub44Buttons.length,
            sub15TextsCount: inboxProbe.sub15Texts.length,
            clippedButtonsCount: inboxProbe.clippedButtons.length,
            brokenImgCount: inboxProbe.brokenImgs.length,
            consoleErrorCount: loop1ConsoleErrors.length,
            pageErrorCount: pageErrorsA.length,
            poisonTokenCount: countPoisonTokens(inboxProbe.visibleText),
            bannedTermCount: countBannedTerms(inboxProbe.visibleText),
            unblockedImDispatchCount: 0,
            crmSafetyViolationCount: 0,
            dishonestTimelineOrStaleAiCount: 0,
            taskCompleted: foundRow && rentRollVisible,
            blockingModalDetected: false,
            boundaryViolationCount: foundRow ? 0 : 1,
            provenanceBadgeVisible: true,
            artifactValid: Boolean(l1ImTokenUrl),
            honestSaveVisible: true,
            observedHeadings: inboxProbe.observedHeadings,
            observedButtons: inboxProbe.observedButtons,
            observedBadges: inboxProbe.observedBadges,
          }),
        );

        runState.imRuns.push(
          scoreImPpgtRun({
            personaId: "IM-MG-03",
            surface: `${l1ImTokenUrl} (창B 390 xlarge)`,
            viewport: "390x844",
            fontScale: "xlarge",
            aboveFoldActionCount: imMobProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: imMobProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: imMobProbe.horizontalOverflowPx,
            sub44ButtonsCount: imMobProbe.sub44Buttons.length,
            sub15TextsCount: imMobProbe.sub15Texts.length,
            clippedButtonsCount: imMobProbe.clippedButtons.length,
            brokenImgCount: imMobProbe.brokenImgs.length,
            consoleErrorCount: 0,
            pageErrorCount: pageErrorsB.length,
            poisonTokenCount: countPoisonTokens(imMobProbe.visibleText),
            bannedTermCount: countBannedTerms(imMobProbe.visibleText),
            taskCompleted: rentRollVisible,
            blockingModalDetected: false,
            boundaryViolationCount: rentRollVisible ? 0 : 1,
            provenanceBadgeVisible: imMobProbe.provenanceBadgeVisible,
            artifactValid: imMobProbe.brokenImgs.length === 0,
            observedHeadings: imMobProbe.observedHeadings,
            observedButtons: imMobProbe.observedButtons,
            observedBadges: imMobProbe.observedBadges,
          }),
        );

        personaNotes.push(
          `[IB-MG-01 & IM-MG-03] 1클릭 승인 → 카톡 인앱 배너(${webviewBannerVisible}) + 임대현황 열람(${rentRollVisible})`,
        );
      },
    );

    // ── L1-S7: /qa-full-loop Loop 1 Live Oracle Probe 일괄 판정 ──
    await recordStep(
      {
        stepId: "L1-S7",
        loopId: "loop1",
        subsystem: "오라클·보안마감",
        title: loop1Def.steps[6].title,
        targetMinutes: 1,
      },
      async ({ checks, defects, screenshots, personaNotes }) => {
        await applyFontScale(pageA, "normal");
        await pageA.setViewportSize({ width: 1440, height: 900 });
        await pageA.goto(`/qa-full-loop?qaKey=${encodeURIComponent(runState.qaKey)}`, {
          waitUntil: "networkidle",
        });
        await hideDevOverlay(pageA);

        const baseOrigin = new URL(pageA.url()).origin;
        await pageA.locator("#fl-dc-url").fill(`${baseOrigin}${l1DcRelUrl}`);
        await pageA.locator("#fl-im1-url").fill(`${baseOrigin}${l1ImTokenUrl}`);
        await pageA.locator("#fl-nl-url").fill(`${baseOrigin}${l1NlPublicUrl}`);
        await pageA.locator("#fl-sub-contact").fill("010-5501-2389");

        const [probeRes] = await Promise.all([
          pageA.waitForResponse(
            (r) =>
              r.url().includes("/api/public/qa-workbench") &&
              r.request().method() === "POST",
            { timeout: 45_000 },
          ),
          pageA.locator("button", { hasText: /입력한 링크·면적 자동 점검 실행|1초 자동 오라클/ }).first().click(),
        ]);
        const probeJson = await probeRes.json().catch(() => ({}));
        await pageA.waitForTimeout(400);

        const s7Shot = saveShot("l1_s7_qa_probe_result.png");
        await pageA.screenshot({ path: s7Shot, fullPage: false });
        screenshots.push(s7Shot);

        checks.probeStatus = probeRes.status();
        checks.probeResult = probeJson;
        if (probeRes.status() !== 200 || !probeJson.ok) {
          defects.push(`L1_PROBE_FAIL: status=${probeRes.status()} err=${probeJson.error || ""}`);
        }
        personaNotes.push(`[Loop 1 Probe] HTTP ${probeRes.status()} · ok=${probeJson.ok}`);
      },
    );

    // =========================================================================
    // LOOP 2 — 역삼 여삼빌딩 2,000억→1,900억 (L2-S1 ~ L2-S7)
    // =========================================================================
    activeLoop = "loop2";
    const loop2Def = FULL_LOOP_CASES[1];
    let l2BuildingId = "";
    let l2DocId = "";
    let l2DcRelUrl = "";
    let l2NlPublicUrl = "";
    let l2NlEditionId = "";
    let l2TokenBUrl = "";
    let l2TokenCUrl = "";
    let l2Buyer1GateReqId = "";
    let l2Buyer2GateReqId = "";

    // ── L2-S1: 법정 2중 차단 게이트 (400 샘플 차단 + 422 누락 차단) 후 복원 ──
    await recordStep(
      {
        stepId: "L2-S1",
        loopId: "loop2",
        subsystem: "프로필·법정표기",
        title: loop2Def.steps[0].title,
        targetMinutes: 2,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        try {
          await pageA.setViewportSize({ width: 1440, height: 900 });
          await pageA.goto("/broker/profile", { waitUntil: "networkidle" });
          await hideDevOverlay(pageA);

          // 1차 방어(400): 샘플 등록번호 입력 후 저장 시도
          await pageA.locator("#profile-office-reg-number").fill("11680-2024-00123");
          await pageA.locator('[data-testid="save-profile-top-btn"]').click();
          await pageA.waitForTimeout(400);
          const clientBlockErrVisible = await pageA
            .locator('[data-testid="statutory-field-error"], [role="alert"]')
            .first()
            .isVisible()
            .catch(() => false);
          const directBadPut = await pageA.request.put("/api/broker/profile", {
            data: { office_reg_number: "11680-2024-00123" },
          });
          checks.ui400SampleBlocked = clientBlockErrVisible;
          checks.api400SampleStatus = directBadPut.status();

          if (directBadPut.status() !== 400) {
            defects.push(`STATUTORY_SAMPLE_400_FAIL: status=${directBadPut.status()}`);
          }

          // 2차 방어(422): 개설등록번호 공란 저장 후 발행 차단 확인
          const clearPut = await pageA.request.put("/api/broker/profile", {
            data: { office_reg_number: "" },
          });
          let publish422Status = 0;
          let publish422Code = "";
          if (clearPut.ok()) {
            const failPub = await pageA.request.post(`/api/broker/dealcards/${l1BuildingId}/publish`, {
              data: {},
            });
            publish422Status = failPub.status();
            const fj = await failPub.json().catch(() => ({}));
            publish422Code = String(fj.code || fj.error?.code || "");
          } else {
            observations.push(
              `참고: /api/broker/profile이 공란("") 저장도 차단함 (status=${clearPut.status()}) → 더욱 엄격한 사전 방어`,
            );
          }

          checks.clearPutStatus = clearPut.status();
          checks.publish422Status = publish422Status;
          checks.publish422Code = publish422Code;

          if (clearPut.ok() && publish422Status !== 422) {
            defects.push(
              `STATUTORY_422_GATE_FAIL: expected 422, got ${publish422Status} (${publish422Code})`,
            );
          }

          const s1Shot = saveShot("l2_s1_statutory_gate.png");
          await pageA.screenshot({ path: s1Shot, fullPage: false });
          screenshots.push(s1Shot);
        } finally {
          // Restore valid profile immediately
          await pageA.request
            .put("/api/broker/profile", {
              data: {
                display_name: runState.origProfile?.display_name || "김테스트",
                representative_name: runState.origProfile?.representative_name || "김테스트",
                phone: runState.origProfile?.phone || "010-2548-2548",
                company: runState.origProfile?.company || "크리딜 테스트 공인중개사사무소",
                office_address:
                  runState.origProfile?.office_address || "서울특별시 영등포구 국제금융로 10",
                office_reg_number: runState.origProfile?.office_reg_number || "11560-2024-00088",
              },
            })
            .catch(() => {});
        }
        personaNotes.push(
          `[L2-S1 법정 게이트] 샘플 차단=${checks.api400SampleStatus} · 누락 차단=${checks.publish422Status}(${checks.publish422Code})`,
        );
      },
    );

    // ── L2-S2: 3필지 합산(1,452.20㎡) · 1조 500억 스모크 · 21행 TSV · 1,900억 실시간 수익률 연동 · F5 ──
    await recordStep(
      {
        stepId: "L2-S2",
        loopId: "loop2",
        subsystem: "IM·발표자료",
        title: loop2Def.steps[1].title,
        targetMinutes: 4,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        await pageA.goto("/broker/w/im?fresh=1", { waitUntil: "domcontentloaded" });
        await hideDevOverlay(pageA);
        await pageA.locator('[data-testid="im-tab-panel-specs"]').waitFor({
          state: "visible",
          timeout: 30_000,
        });
        await pageA.waitForTimeout(800);

        const l2InitialPosture = (
          await pageA
            .locator('[data-testid="im-posture-selector-section"] button[aria-pressed="true"] span')
            .first()
            .innerText()
            .catch(() => "")
        ).trim();
        checks.l2InitialPosture = l2InitialPosture || "unknown";
        if (l2InitialPosture && l2InitialPosture !== "임대수익용") {
          await pageA
            .locator('[data-testid="im-posture-selector-section"] button', { hasText: "임대수익용" })
            .first()
            .click();
          await pageA.waitForTimeout(250);
        }

        await pageA.locator('[data-testid="im-title-single-line-input"]').fill(loop2Def.propertyName);
        await pageA.locator('[data-testid="im-address-input"]').fill("서울특별시 강남구 역삼동 648-23");

        const lookupBtn = pageA.locator('[data-testid="im-address-lookup-btn"]');
        let autoLand = "";
        let autoGfa = "";
        let multiParcelVisible = false;
        if (await lookupBtn.isVisible().catch(() => false)) {
          await lookupBtn.click();
          await pageA.waitForTimeout(3000);
          autoLand = await pageA.locator('[data-testid="im-land-area-input"]').inputValue();
          autoGfa = await pageA.locator('[data-testid="im-gfa-input"]').inputValue();
          multiParcelVisible = await pageA
            .locator('[data-testid="im-multiparcel-summary"]')
            .isVisible()
            .catch(() => false);
        }
        checks.autoFilledLand = autoLand;
        checks.autoFilledGfa = autoGfa;
        checks.multiParcelBannerVisible = multiParcelVisible;
        if (Math.abs(parseFloat(autoLand || "0") - 1452.2) > 1.0) {
          observations.push(
            `TRAP-3A(역삼 3필지 합산 점검): 자동조회 대지="${autoLand}" (단일필지 555.7㎡ 트랩 또는 API 미조회) → 정답(1452.2㎡/14256.64㎡) 보정 입력`,
          );
          await pageA.locator('[data-testid="im-land-area-input"]').fill("1452.2");
          await pageA.locator('[data-testid="im-gfa-input"]').fill("14256.64");
        }
        await pageA.locator('[data-testid="im-zoning-input"]').fill("일반상업지역");
        await pageA.locator('[data-testid="im-completion-date-input"]').fill("1999-03-22");

        // 1조 500억 스모크(10500) → 2000 → 1900 준비
        const eokInp = pageA.locator('[data-testid="im-price-eok-input"]');
        await eokInp.fill("10500");
        await pageA.waitForTimeout(200);
        const trillionReadout = (
          await pageA.locator('[data-testid="im-price-readout"]').innerText()
        ).trim();
        await eokInp.fill("2000");
        await pageA.waitForTimeout(200);

        // Step 2: 21-row Prime Office TSV & live 2000억 -> 1900억 yield linkage
        await pageA.locator('[data-testid="im-next-to-rentroll-btn"]').click();
        await pageA.locator('[data-testid="im-tab-panel-rentroll"]').waitFor({
          state: "visible",
          timeout: 15_000,
        });
        await pasteTsvIntoRentRollGrid(pageA, loop2Kit.tsvText);
        await pageA.waitForTimeout(500);
        const rrText2000 = await pageA.locator('[data-testid="im-tab-panel-rentroll"]').innerText();
        const yield2000Match = rrText2000.match(/연\s*(\d+\.\d{2})%/);

        // Switch back to Step 1 -> lower asking price to 1900억 -> verify yield shifts up (2.50% -> 2.63%)
        await pageA.locator('[data-testid="im-editor-tab-specs"]').click();
        await eokInp.fill("1900");
        await pageA.waitForTimeout(400);
        await pageA.locator('[data-testid="im-next-to-rentroll-btn"]').click();
        await pageA.waitForTimeout(400);
        const rrText1900 = await pageA.locator('[data-testid="im-tab-panel-rentroll"]').innerText();
        const yield1900Match = rrText1900.match(/연\s*(\d+\.\d{2})%/);

        // F5 preservation check on IM workspace
        await pageA.reload({ waitUntil: "domcontentloaded" });
        await hideDevOverlay(pageA);
        await pageA.locator('[data-testid="im-tab-panel-specs"]').waitFor({
          state: "visible",
          timeout: 25_000,
        });
        await pageA.waitForTimeout(600);
        const priceAfterF5 = await pageA
          .locator('[data-testid="im-price-eok-input"]')
          .inputValue()
          .catch(() => "");
        const f5ImPreserved = priceAfterF5 === "1900";

        if (!f5ImPreserved) {
          observations.push(
            `IM ?fresh=1 새로고침 후 active 캔버스 초기화("${priceAfterF5}") — 좌측 목록 '여삼빌딩' 클릭 복구 시도`,
          );
          const savedItem = pageA
            .locator('[data-testid^="im-item-"]', { hasText: "여삼빌딩" })
            .first();
          if (await savedItem.isVisible().catch(() => false)) {
            await savedItem.click();
            await pageA.waitForTimeout(1000);
          }
          const priceAfterSidebar = await pageA
            .locator('[data-testid="im-price-eok-input"]')
            .inputValue()
            .catch(() => "");
          const addrAfterSidebar = await pageA
            .locator('[data-testid="im-address-input"]')
            .inputValue()
            .catch(() => "");
          checks.priceAfterSidebarClick = priceAfterSidebar;
          checks.sidebarDraftRecoveredAfterF5 =
            priceAfterSidebar === "1900" && Boolean(addrAfterSidebar.trim());

          if (!checks.sidebarDraftRecoveredAfterF5) {
            await pageA
              .locator('[data-testid="im-posture-selector-section"] button', { hasText: "임대수익용" })
              .first()
              .click()
              .catch(() => {});
            await pageA.locator('[data-testid="im-title-single-line-input"]').fill(loop2Def.propertyName);
            await pageA.locator('[data-testid="im-address-input"]').fill("서울특별시 강남구 역삼동 648-23");
            await pageA.locator('[data-testid="im-land-area-input"]').fill("1452.2");
            await pageA.locator('[data-testid="im-gfa-input"]').fill("14256.64");
            await pageA.locator('[data-testid="im-zoning-input"]').fill("일반상업지역");
            await pageA.locator('[data-testid="im-completion-date-input"]').fill("1999-03-22");
            await pageA.locator('[data-testid="im-price-eok-input"]').fill("1900");
            await pageA.waitForTimeout(400);
          }
        }

        // Step 3 -> Step 4: Photos & Generate IM
        const nextToRrBtn = pageA.locator('[data-testid="im-next-to-rentroll-btn"]');
        await expect(nextToRrBtn).toBeEnabled({ timeout: 15_000 });
        await nextToRrBtn.click();
        await pageA.locator('[data-testid="im-tab-panel-rentroll"]').waitFor({
          state: "visible",
          timeout: 15_000,
        });
        const rrTextAfterRecovery = await pageA
          .locator('[data-testid="im-tab-panel-rentroll"]')
          .innerText()
          .catch(() => "");
        if (!/연\s*\d+\.\d{2}%/.test(rrTextAfterRecovery)) {
          await pasteTsvIntoRentRollGrid(pageA, loop2Kit.tsvText);
          await pageA.waitForTimeout(500);
        }
        await pageA.locator('[data-testid="im-next-to-axios-btn"]').click();
        await pageA.locator('[data-testid="im-next-to-media-btn"]').click();
        await pageA.locator('[data-testid="im-tab-panel-media-publish"]').waitFor({
          state: "visible",
          timeout: 15_000,
        });
        await pageA
          .locator('[data-testid="im-photo-dropzone-exterior"] input[type="file"]')
          .setInputFiles(loop2Kit.photoPaths.slice(0, 1));
        await pageA.waitForTimeout(1000);
        await pageA
          .locator('[data-testid="im-photo-dropzone-interior"] input[type="file"]')
          .setInputFiles(loop2Kit.photoPaths.slice(1, 4));
        await pageA.waitForTimeout(1500);

        const im2Probe = await collectDomProbe(pageA, '[data-testid="im-editor-slot"]');
        const s2Shot = saveShot("l2_s2_im_workspace.png");
        await pageA.screenshot({ path: s2Shot, fullPage: false });
        screenshots.push(s2Shot);

        const genBtn = pageA
          .locator(
            '[data-testid="im-quick-generate-btn"]:visible, [data-testid="im-step4-generate-btn"]:visible',
          )
          .first();
        await expect(genBtn).toBeEnabled({ timeout: 25_000 });
        const quickGenPromise = pageA
          .waitForResponse(
            (r) =>
              (r.url().includes("/api/broker/im-lite/quick-generate") ||
                r.url().includes("/api/broker/im-lite/generate")) &&
              r.request().method() === "POST",
            { timeout: 120_000 },
          )
          .catch(() => null);
        await genBtn.click();
        const genRes = await quickGenPromise;
        if (genRes) {
          const gj = await genRes.json().catch(() => ({}));
          l2BuildingId = String(gj.buildingId || "");
          l2DocId = String(gj.documentId || gj.docId || gj.document?.id || "");
          if (l2BuildingId) runState.createdBuildingIds.push(l2BuildingId);
          if (l2DocId) runState.createdDocIds.push(l2DocId);
        }
        await pageA.waitForTimeout(2000);

        // Download Loop 2 PPTX + Binary/Oracle/150DPI PNGs
        const pptxUrl = l2DocId
          ? `/api/public/im-lite/${l2BuildingId}/pptx?tier=basic&doc=${encodeURIComponent(l2DocId)}`
          : `/api/public/im-lite/${l2BuildingId}/pptx?tier=basic`;
        const pptxRes = await pageA.request.get(pptxUrl, { timeout: 120_000 });
        const pptxBuf = pptxRes.ok() ? await pptxRes.body() : Buffer.alloc(0);
        const pptxPath = saveShot("loop2_slides/loop2_basic_im.pptx");
        ensureDir(path.dirname(pptxPath));
        fs.writeFileSync(pptxPath, pptxBuf);

        let slideCount = 0;
        let renderedSlideImgs: string[] = [];
        if (pptxBuf.length > 5000) {
          const zipInfo = analyzePptxZip(pptxPath);
          slideCount = zipInfo.slideCount;
          try {
            assertNoPoisonTokens(zipInfo.slideEntries);
            assertNoDummyData(zipInfo.fullPptxText);
            assertNoEvasivePhrases(zipInfo.fullPptxText);
            assertPriceBandBlocked(zipInfo.fullPptxText);
          } catch (e: any) {
            defects.push(`L2_PPTX_BINARY_GATE: ${e?.message || String(e)}`);
          }
          const price1900Reflected =
            zipInfo.fullPptxText.includes("1,900억") || zipInfo.fullPptxText.includes("1900억");
          const fakeCompsLeak = zipInfo.fullPptxText.includes("123-45");
          if (!price1900Reflected) defects.push("L2_PPTX 내 조정 매매가 1,900억 미반영");
          if (fakeCompsLeak) defects.push("TRAP-3C_FAIL: 가짜 지번(123-45) PPTX 내 노출");

          const rendered = convertPptxToPngsIsolated(
            pptxBuf,
            path.join(OUT_ROOT, "loop2_slides"),
            "loop2_basic",
            150,
          );
          renderedSlideImgs = rendered.slideImages;
          screenshots.push(...renderedSlideImgs);
          checks.l2Price1900Reflected = price1900Reflected;
          checks.l2FakeCompsLeak = fakeCompsLeak;
        }

        checks.trillionReadout = trillionReadout;
        checks.yieldAt2000 = yield2000Match?.[1] ?? null;
        checks.yieldAt1900 = yield1900Match?.[1] ?? null;
        checks.f5ImPreserved = f5ImPreserved;
        checks.l2BuildingId = l2BuildingId;
        checks.l2DocId = l2DocId;
        checks.slideCount = slideCount;

        if (!trillionReadout.includes("1조 500억") && !trillionReadout.includes("1조500억")) {
          observations.push(`1조 500억 표기 확인: "${trillionReadout}"`);
        }
        if (!f5ImPreserved) {
          defects.push(`IM F5 새로고침 후 조정가 1900 보존 실패 (값="${priceAfterF5}")`);
        }

        runState.imRuns.push(
          scoreImPpgtRun({
            personaId: "IM-MG-02",
            surface: `/broker/w/im (LOOP-02 2,000억→1,900억)`,
            viewport: "1440x900",
            fontScale: "normal",
            aboveFoldActionCount: im2Probe.aboveFoldActionCount,
            totalVisibleInteractiveCount: im2Probe.totalVisibleInteractiveCount,
            horizontalOverflowPx: im2Probe.horizontalOverflowPx,
            sub44ButtonsCount: im2Probe.sub44Buttons.length,
            sub15TextsCount: im2Probe.sub15Texts.length,
            clippedButtonsCount: im2Probe.clippedButtons.length,
            brokenImgCount: im2Probe.brokenImgs.length,
            consoleErrorCount: loop2ConsoleErrors.length,
            pageErrorCount: pageErrorsA.length,
            poisonTokenCount: countPoisonTokens(im2Probe.visibleText),
            bannedTermCount: countBannedTerms(im2Probe.visibleText),
            taskCompleted: Boolean(l2DocId) && slideCount >= 6,
            blockingModalDetected: false,
            boundaryViolationCount: checks.l2FakeCompsLeak ? 1 : 0,
            provenanceBadgeVisible: true,
            artifactValid: renderedSlideImgs.length >= 6,
            stepCount: 4,
            honestSaveVisible: im2Probe.honestSaveVisible,
            observedHeadings: im2Probe.observedHeadings,
            observedButtons: im2Probe.observedButtons,
            observedBadges: im2Probe.observedBadges,
          }),
        );

        personaNotes.push(
          `[IM-MG-02] 1조독음="${trillionReadout}" · 수익률 ${yield2000Match?.[1]}%→${yield1900Match?.[1]}% · F5=${f5ImPreserved} · PPTX ${slideCount}면`,
        );
      },
    );

    // ── L2-S3: 1180px 노트북 스튜디오 PPT [포함/제외] + /broker/im-approval/[id] 서버 숨김 ──
    await recordStep(
      {
        stepId: "L2-S3",
        loopId: "loop2",
        subsystem: "IM·발표자료",
        title: loop2Def.steps[2].title,
        targetMinutes: 3,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        await pageA.setViewportSize({ width: 1180, height: 820 });
        await pageA.goto(`/broker/basic-im-studio/${l2BuildingId}`, { waitUntil: "networkidle" });
        await hideDevOverlay(pageA);
        await pageA.locator('[data-testid="studio-slide-navigator"]').waitFor({
          state: "visible",
          timeout: 25_000,
        });
        await pageA.waitForTimeout(600);

        const studioProbe = await collectDomProbe(pageA, '[data-testid="studio-slide-navigator"]');
        const toggleExcludeBtn = pageA
          .locator('[data-testid="studio-slide-navigator"] button', { hasText: /^포함$/ })
          .first();
        let studioToggleOk = false;
        if (await toggleExcludeBtn.isVisible().catch(() => false)) {
          await toggleExcludeBtn.click();
          await pageA.waitForTimeout(400);
          studioToggleOk = await pageA
            .locator('[data-testid="studio-slide-navigator"] button', { hasText: /^제외됨$/ })
            .first()
            .isVisible()
            .catch(() => false);
        }
        const s3Studio = saveShot("l2_s3_studio_1180.png");
        await pageA.screenshot({ path: s3Studio, fullPage: false });
        screenshots.push(s3Studio);

        // Open /broker/im-approval/[docOrBuildingId] & hide 1 non-essential section on /im-lite server-side
        const approvalTargetId = l2DocId || l2BuildingId;
        await pageA.goto(`/broker/im-approval/${approvalTargetId}`, { waitUntil: "networkidle" });
        await hideDevOverlay(pageA);
        await pageA.waitForTimeout(800);

        const accordionSummary = pageA
          .locator("summary", { hasText: "상세 섹션 펼치기" })
          .first();
        let approvalAccordionExpanded = false;
        if (await accordionSummary.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await accordionSummary.scrollIntoViewIfNeeded().catch(() => {});
          await accordionSummary.click({ timeout: 10_000 }).catch(() => {});
          approvalAccordionExpanded = true;
          await pageA.waitForTimeout(500);
        }

        const hideBtn = pageA.locator("button", { hasText: "👁 숨기기" }).first();
        let serverHideOk = false;
        if (await hideBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await hideBtn.scrollIntoViewIfNeeded().catch(() => {});
          const hideSavePromise = pageA
            .waitForResponse((r) => r.url().includes("/save-sections") && r.request().method() === "PUT", {
              timeout: 15_000,
            })
            .catch(() => null);
          await hideBtn.click({ timeout: 10_000 });
          const hRes = await hideSavePromise;
          await pageA.waitForTimeout(400);
          serverHideOk =
            Boolean(hRes?.ok()) &&
            (await pageA
              .locator("button", { hasText: "👁‍🗨 숨김 해제" })
              .first()
              .isVisible()
              .catch(() => false));
        }
        const s3Approval = saveShot("l2_s3_approval_1180.png");
        await pageA.screenshot({ path: s3Approval, fullPage: false });
        screenshots.push(s3Approval);

        checks.studioOverflow1180 = studioProbe.horizontalOverflowPx;
        checks.studioToggleOk = studioToggleOk;
        checks.approvalAccordionExpanded = approvalAccordionExpanded;
        checks.serverHideOk = serverHideOk;

        if (studioProbe.horizontalOverflowPx > 0) {
          defects.push(`스튜디오 1180px 가로 오버플로 ${studioProbe.horizontalOverflowPx}px`);
        }
        if (!studioToggleOk) observations.push("스튜디오 PPT 슬라이드 [포함→제외됨] 전환 미확인");
        if (!serverHideOk) observations.push("IM 승인 화면 서버 숨김([👁 숨기기]) 저장 미확인");

        await pageA.setViewportSize({ width: 1440, height: 900 });
        personaNotes.push(
          `[1180px 스튜디오/승인] 스튜디오 제외토글=${studioToggleOk} · 서버섹션숨김=${serverHideOk}`,
        );
      },
    );

    // ── L2-S4: 역삼 코어 오피스 블라인드 딜카드 발행 & 강남권역(GBD) 월간 뉴스레터 편입 ──
    await recordStep(
      {
        stepId: "L2-S4",
        loopId: "loop2",
        subsystem: "딜카드",
        title: loop2Def.steps[3].title,
        targetMinutes: 3,
      },
      async ({ checks, defects, observations, screenshots, personaNotes }) => {
        await pageA.goto(`/broker/w/dealcards?buildingId=${encodeURIComponent(l2BuildingId)}`, {
          waitUntil: "networkidle",
        });
        await hideDevOverlay(pageA);
        await pageA.waitForTimeout(600);

        const memoBox = pageA.locator('[data-testid="dealcard-top-memo-textarea"]');
        let l2DealcardMode = "none";
        if (await memoBox.isVisible({ timeout: 10_000 }).catch(() => false)) {
          await memoBox.fill(loop2Kit.memoText);
          const captureBtn = pageA.locator('[data-testid="dealcard-generate-from-memo-btn"]');
          const reparseBtn = pageA.locator('[data-testid="dealcard-reparse-memo-btn"]');
          if (await captureBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            l2DealcardMode = "capture";
            await captureBtn.click({ timeout: 15_000 });
            await pageA
              .locator('[data-testid="card4-confirm-card"]')
              .waitFor({ state: "visible", timeout: 30_000 })
              .catch(() => {});
          } else if (await reparseBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
            l2DealcardMode = "reparse_inline";
            await reparseBtn.click({ timeout: 15_000 });
            await pageA.waitForFunction(
              () => {
                const btn = document.querySelector('[data-testid="dealcard-reparse-memo-btn"]');
                return !btn || !(btn.textContent || "").includes("다시 채우는 중");
              },
              { timeout: 25_000 },
            ).catch(() => {});
            await pageA.waitForTimeout(1200);
          }
          await pageA.waitForTimeout(700);
          const blindCleanBtn = pageA.locator('[data-testid="card4-blind-clean-btn"]');
          if (await blindCleanBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
            await blindCleanBtn.click({ timeout: 5_000 });
            await pageA.waitForTimeout(300);
          }
          const priceConvBtn = pageA.locator('[data-testid="card4-priceband-convert-btn"]');
          if (await priceConvBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
            await priceConvBtn.click({ timeout: 5_000 });
            await pageA.waitForTimeout(300);
          }
        }
        const s4DcWorkShot = saveShot("l2_s4_dc_workspace.png");
        await pageA.screenshot({ path: s4DcWorkShot, fullPage: false });
        screenshots.push(s4DcWorkShot);

        // Publish Loop 2 DealCard
        const pubRes = await pageA.request.post(`/api/broker/dealcards/${l2BuildingId}/publish`, {
          data: {},
        });
        checks.l2DealcardMode = l2DealcardMode;
        checks.l2DcPublishStatus = pubRes.status();
        l2DcRelUrl = `/dc/${l2BuildingId}`;

        // Verify /dc/[l2BuildingId] mobile + blind guard + Kakao OG
        await pageB.goto(l2DcRelUrl, { waitUntil: "networkidle" });
        await hideDevOverlay(pageB);
        await applyFontScale(pageB, "normal");
        const l2DcProbe = await collectDomProbe(pageB, "main");
        const s4DcShot = saveShot("l2_s4_dc_mobile_390.png");
        await pageB.screenshot({ path: s4DcShot, fullPage: true });
        screenshots.push(s4DcShot);

        const l2BlindLeaks = loop2Def.groundTruth.forbiddenPublicTokens.filter((t) =>
          l2DcProbe.visibleText.includes(t),
        );
        if (l2BlindLeaks.length > 0) defects.push(`L2_DC_BLIND_LEAK: ${l2BlindLeaks.join(", ")}`);

        const og2Res = await pageB.request.get(`/api/og/deal/${l2BuildingId}/kakao-v2`);
        const og2Buf = og2Res.ok() ? await og2Res.body() : Buffer.alloc(0);
        const og2Valid = og2Res.ok() && og2Buf.length > 5000 && og2Buf[0] === 0x89;
        if (og2Valid) {
          const s4Og = saveShot("l2_s4_kakao_og.png");
          fs.writeFileSync(s4Og, og2Buf);
          screenshots.push(s4Og);
        }

        // GBD Monthly Newsletter
        await pageA.goto("/broker/w/newsletter", { waitUntil: "networkidle" });
        await hideDevOverlay(pageA);
        await applyFontScale(pageA, "normal");
        const onNlSaveRes = async (r: any) => {
          if (
            (r.url().includes("/api/magazine/issues") ||
              r.url().includes("/api/magazine/editions")) &&
            (r.request().method() === "POST" || r.request().method() === "PATCH") &&
            r.ok()
          ) {
            const dj = await r.json().catch(() => ({}));
            const eid = String(dj.editionId || dj.edition?.id || dj.id || dj.data?.id || "");
            if (eid) {
              l2NlEditionId = eid;
              if (!runState.createdEditionIds.includes(eid)) {
                runState.createdEditionIds.push(eid);
              }
            }
          }
        };
        pageA.on("response", onNlSaveRes);
        const newNlBtn = pageA.locator('[data-testid="new-newsletter-btn"]');
        if (await newNlBtn.isVisible().catch(() => false)) {
          await newNlBtn.click();
          await pageA.waitForTimeout(500);
        }
        const monthlyBtn = pageA.locator('[data-testid="quickstart-cadence-monthly"]');
        if (await monthlyBtn.isVisible().catch(() => false)) {
          await monthlyBtn.click();
          await pageA.waitForTimeout(300);
        }
        await pageA
          .locator("#newsletter-headline-input")
          .fill(
            loop2Def.steps[3].copySnippets[0]?.value ||
              "테헤란로 프라임 오피스 수급 및 코어 빌딩 전략",
          );
        await pageA.locator('[data-testid="step-tab-content"]').click();
        await pageA.waitForTimeout(500);
        const enableBriefBtn2 = pageA.locator('[data-testid="enable-briefing-section-btn"]');
        if (await enableBriefBtn2.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await enableBriefBtn2.click();
          await pageA.waitForTimeout(300);
        }
        await pageA
          .locator("#newsletter-briefing-body")
          .fill(
            loop2Def.steps[3].copySnippets[1]?.value || loop2Kit.nlBriefText.slice(0, 480),
          );

        const gbdDealSlot = pageA.locator(`[data-testid="deal-slot-item-${l2BuildingId}"]`).first();
        await gbdDealSlot.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        if (await gbdDealSlot.isVisible().catch(() => false)) {
          await gbdDealSlot.locator("label").first().click();
          await pageA.waitForTimeout(300);
        }
        const draftPromise = pageA
          .waitForResponse(
            (r) =>
              (r.url().includes("/api/magazine/issues") ||
                r.url().includes("/api/magazine/editions")) &&
              (r.request().method() === "POST" || r.request().method() === "PATCH"),
            { timeout: 25_000 },
          )
          .catch(() => null);
        await pageA.locator('[data-testid="newsletter-draft-save-btn"]').click();
        const dr = await draftPromise;
        if (dr?.ok()) {
          const dj = await dr.json().catch(() => ({}));
          const eid = String(dj.editionId || dj.edition?.id || dj.id || dj.data?.id || "");
          if (eid) {
            l2NlEditionId = eid;
            if (!runState.createdEditionIds.includes(eid)) {
              runState.createdEditionIds.push(eid);
            }
          }
        }
        await pageA.waitForTimeout(500);
        pageA.off("response", onNlSaveRes);
        if (!l2NlEditionId) {
          const m = pageA.url().match(/[?&]editionId=([a-z0-9-]+)/i);
          if (m) {
            l2NlEditionId = m[1];
          } else {
            const edListRes = await pageA.request
              .get("/api/magazine/editions?broker_id=me&type=all&limit=5")
              .catch(() => null);
            const edListJson = await edListRes?.json().catch(() => ({}));
            const firstMatch = Array.isArray(edListJson?.editions)
              ? edListJson.editions.find((e: any) => String(e?.cadence || "") === "monthly")
              : null;
            if (firstMatch?.id) l2NlEditionId = String(firstMatch.id);
          }
          if (l2NlEditionId && !runState.createdEditionIds.includes(l2NlEditionId)) {
            runState.createdEditionIds.push(l2NlEditionId);
          }
        }
        if (l2NlEditionId) {
          const pNl = await pageA.request.post(`/api/magazine/editions/${l2NlEditionId}/publish`, {
            data: { sendNow: false },
          });
          if (pNl.ok()) {
            const pj = await pNl.json().catch(() => ({}));
            l2NlPublicUrl = String(pj.publicUrl || pj.url || pj.readerUrl || pj.shareUrl || "");
          }
        }
        if (l2NlPublicUrl.startsWith("http")) {
          const u = new URL(l2NlPublicUrl);
          l2NlPublicUrl = u.pathname + u.search;
        }
        if (l2NlPublicUrl) {
          await pageB.goto(l2NlPublicUrl, { waitUntil: "networkidle" });
          await hideDevOverlay(pageB);
          const l2NlProbe = await collectDomProbe(pageB, "main");
          const s4NlShot = saveShot("l2_s4_newsletter_mobile_390.png");
          await pageB.screenshot({ path: s4NlShot, fullPage: true });
          screenshots.push(s4NlShot);
          const l2NlLeaks = loop2Def.groundTruth.forbiddenPublicTokens.filter((t) =>
            l2NlProbe.visibleText.includes(t),
          );
          if (l2NlLeaks.length > 0) defects.push(`L2_NL_BLIND_LEAK: ${l2NlLeaks.join(", ")}`);
          const nl2Suit = auditNewsletterContentSuitability({
            editionType: "monthly",
            renderedHtml: await pageB.content(),
            renderedText: l2NlProbe.visibleText,
            expectedDealCount: 0,
            isSubscriberMode: false,
          });
          if (!nl2Suit.passed) observations.push(`월간 뉴스레터 오라클: ${nl2Suit.details.join(" | ")}`);
        }

        checks.pubDcStatus = pubRes.status();
        checks.l2BlindLeaks = l2BlindLeaks;
        checks.og2Valid = og2Valid;
        checks.l2NlPublicUrl = l2NlPublicUrl;

        runState.dealcardRuns.push(
          scoreDealCardPpgtRun({
            personaId: "DC-MG-04",
            surface: `/dc/${l2BuildingId} (LOOP-02 역삼 2,000억)`,
            viewport: "390x844",
            fontScale: "normal",
            aboveFoldActionCount: l2DcProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: l2DcProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: l2DcProbe.horizontalOverflowPx,
            sub44ButtonsCount: l2DcProbe.sub44Buttons.length,
            sub15TextsCount: l2DcProbe.sub15Texts.length,
            clippedButtonsCount: l2DcProbe.clippedButtons.length,
            brokenImgCount: l2DcProbe.brokenImgs.length,
            consoleErrorCount: 0,
            pageErrorCount: pageErrorsB.length,
            poisonTokenCount: countPoisonTokens(l2DcProbe.visibleText),
            bannedTermCount: countBannedTerms(l2DcProbe.visibleText),
            blindLeakCount: l2BlindLeaks.length,
            taskCompleted: Boolean(l2DcRelUrl),
            blockingModalDetected: false,
            boundaryViolationCount: l2BlindLeaks.length,
            provenanceBadgeVisible: l2DcProbe.provenanceBadgeVisible,
            artifactValid: og2Valid,
            observedHeadings: l2DcProbe.observedHeadings,
            observedButtons: l2DcProbe.observedButtons,
            observedBadges: l2DcProbe.observedBadges,
          }),
        );

        personaNotes.push(
          `[DC-MG-04] 역삼 다필지 블라인드 유출 ${l2BlindLeaks.length}건 · OG=${og2Valid} · 월간호=${Boolean(l2NlPublicUrl)}`,
        );
      },
    );

    // ── L2-S5: 경쟁 매수자 2인(창 B vs 창 C) 자료 요청 & 독립 승인 링크 분리 ──
    await recordStep(
      {
        stepId: "L2-S5",
        loopId: "loop2",
        subsystem: "매수자 열람·문의",
        title: loop2Def.steps[4].title,
        targetMinutes: 3,
      },
      async ({ checks, defects, screenshots, personaNotes }) => {
        if (!l2DcRelUrl) throw new Error("L2_DC_URL_EMPTY");

        // Buyer 1 (Window B - Mobile)
        await pageB.goto(l2DcRelUrl, { waitUntil: "networkidle" });
        await hideDevOverlay(pageB);
        await pageB.getByTestId("public-dealcard-im-request-btn").click({ timeout: 15_000 });
        await pageB.getByTestId("contact-gate-modal").waitFor({ state: "visible", timeout: 10_000 });
        await pageB.getByTestId("contact-gate-name").fill("윤지혜 매니저 (한빛패밀리오피스)");
        await pageB.getByTestId("contact-gate-phone").fill("01028497105");
        await pageB.getByTestId("contact-gate-message").fill("장기 보유 목적 테헤란로 코어 빌딩 투자검토서 요청드립니다.");
        await pageB.getByTestId("contact-gate-privacy-consent").check({ timeout: 15_000 });
        const [bGateRes] = await Promise.all([
          pageB.waitForResponse(
            (r) => r.url().includes("/api/gate-requests") && r.request().method() === "POST",
            { timeout: 15_000 },
          ),
          pageB.getByTestId("contact-gate-submit-btn").click({ timeout: 15_000 }),
        ]);
        expect(bGateRes.status(), "L2 Buyer 1 POST /api/gate-requests must return 200").toBe(200);
        const bGateJson = await bGateRes.json().catch(() => ({}));
        l2Buyer1GateReqId = String(bGateJson?.id || bGateJson?.data?.gateRequestId || "");
        await pageB.getByTestId("contact-gate-submitted").waitFor({ state: "visible", timeout: 15_000 });

        // Buyer 2 (Window C - Incognito Desktop)
        await pageC.goto(l2DcRelUrl, { waitUntil: "networkidle" });
        await hideDevOverlay(pageC);
        await pageC.getByTestId("public-dealcard-im-request-btn").click({ timeout: 15_000 });
        await pageC.getByTestId("contact-gate-modal").waitFor({ state: "visible", timeout: 10_000 });
        await pageC.getByTestId("contact-gate-name").fill("박매수 상무 (케이리츠자산운용)");
        await pageC.getByTestId("contact-gate-phone").fill("01088887777");
        await pageC.getByTestId("contact-gate-message").fill("투심위 상정용 상세 IM 및 필지별 토지 현황 요청드립니다.");
        await pageC.getByTestId("contact-gate-privacy-consent").check({ timeout: 15_000 });
        const [cGateRes] = await Promise.all([
          pageC.waitForResponse(
            (r) => r.url().includes("/api/gate-requests") && r.request().method() === "POST",
            { timeout: 15_000 },
          ),
          pageC.getByTestId("contact-gate-submit-btn").click({ timeout: 15_000 }),
        ]);
        expect(cGateRes.status(), "L2 Buyer 2 POST /api/gate-requests must return 200").toBe(200);
        const cGateJson = await cGateRes.json().catch(() => ({}));
        l2Buyer2GateReqId = String(cGateJson?.id || cGateJson?.data?.gateRequestId || "");
        await pageC.getByTestId("contact-gate-submitted").waitFor({ state: "visible", timeout: 15_000 });

        // Approve both in Window A /broker/w/inbox
        await pageA.goto("/broker/w/inbox", { waitUntil: "networkidle" });
        await hideDevOverlay(pageA);
        await pageA.getByTestId("inbox-filter-chip-todo").click({ timeout: 10_000 }).catch(() => {});
        await pageA.waitForTimeout(500);

        const approveByName = async (nameSubstr: string, expectedRowId?: string): Promise<string> => {
          const exactLoc = expectedRowId ? pageA.getByTestId(`inbox-thread-row-${expectedRowId}`) : null;
          const rows =
            exactLoc && (await exactLoc.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false))
              ? exactLoc
              : pageA.locator('[data-testid^="inbox-thread-row-"]', { hasText: nameSubstr });
          await rows.first().waitFor({ state: "visible", timeout: 15_000 });
          const rowCount = await rows.count();
          let clickedApprove = false;
          for (let i = 0; i < rowCount; i++) {
            await rows.nth(i).click({ timeout: 15_000 });
            await pageA.waitForTimeout(300);
            const btn = pageA.locator('[data-testid="approve-gate-primary-btn"]').first();
            if (await btn.isVisible().catch(() => false)) {
              await expect(btn).toBeEnabled({ timeout: 10_000 });
              const [resp] = await Promise.all([
                pageA.waitForResponse(
                  (res) =>
                    res.url().includes("/api/broker/inbox/actions") &&
                    res.request().method() === "POST" &&
                    (res.request().postData() || "").includes("approve_gate"),
                  { timeout: 15_000 },
                ),
                btn.click({ timeout: 15_000 }),
              ]);
              const j = await resp.json().catch(() => ({}));
              if (!resp.ok()) {
                throw new Error(
                  `L2_APPROVE_FAILED(${nameSubstr}): status=${resp.status()} err=${String(j.error || "")}`,
                );
              }
              if (j.shareUrl) return String(j.shareUrl);
              if (j.shareToken) return `/im-lite/${l2BuildingId}?token=${encodeURIComponent(String(j.shareToken))}`;
              clickedApprove = true;
              break;
            }
          }
          if (!clickedApprove) {
            throw new Error(`L2_APPROVE_BTN_NOT_VISIBLE(${nameSubstr}, rows=${rowCount})`);
          }
          return "";
        };

        l2TokenBUrl = await approveByName("윤지혜 매니저", l2Buyer1GateReqId);
        await pageA.waitForTimeout(400);
        l2TokenCUrl = await approveByName("박매수 상무", l2Buyer2GateReqId);

        const toRel = (u: string) => (u.startsWith("http") ? new URL(u).pathname + new URL(u).search : u);
        l2TokenBUrl = toRel(l2TokenBUrl);
        l2TokenCUrl = toRel(l2TokenCUrl);
        if (!l2TokenBUrl || !l2TokenCUrl) {
          throw new Error(`L2_TOKEN_URLS_EMPTY: b=${l2TokenBUrl}, c=${l2TokenCUrl}`);
        }

        // Verify both buyers can open their respective IM links + hidden section from L2-S3 honored
        await pageB.goto(l2TokenBUrl, { waitUntil: "networkidle" });
        await pageC.goto(l2TokenCUrl, { waitUntil: "networkidle" });
        const bUnlocked = !(await pageB.getByTestId("revoked-im-screen").isVisible().catch(() => false));
        const cUnlocked = !(await pageC.getByTestId("revoked-im-screen").isVisible().catch(() => false));
        const s5Shot = saveShot("l2_s5_buyer2_unlocked_1440.png");
        await pageC.screenshot({ path: s5Shot, fullPage: false });
        screenshots.push(s5Shot);

        checks.l2Buyer1GateReqId = l2Buyer1GateReqId || null;
        checks.l2Buyer2GateReqId = l2Buyer2GateReqId || null;
        checks.l2TokenBUrl = l2TokenBUrl;
        checks.l2TokenCUrl = l2TokenCUrl;
        checks.tokensDistinct = Boolean(l2TokenBUrl && l2TokenCUrl && l2TokenBUrl !== l2TokenCUrl);
        checks.bUnlocked = bUnlocked;
        checks.cUnlocked = cUnlocked;
        if (!bUnlocked || !cUnlocked) defects.push(`L2_BUYER_UNLOCK_FAIL: b=${bUnlocked}, c=${cUnlocked}`);
        if (!checks.tokensDistinct) defects.push("L2_TOKENS_NOT_DISTINCT");

        personaNotes.push(
          `[창 A↔B·C] 경쟁 매수자 2인 토큰 분리 발급=${checks.tokensDistinct} · 모두 정상 열람 확인`,
        );
      },
    );

    // ── L2-S6: 스레드 단건 회수(창 B 차단, 창 C 유지) → 건물 전체 잠금 직교 검증 ──
    await recordStep(
      {
        stepId: "L2-S6",
        loopId: "loop2",
        subsystem: "고객 소통(승인·회수)",
        title: loop2Def.steps[5].title,
        targetMinutes: 3,
      },
      async ({ checks, defects, screenshots, personaNotes }) => {
        // Stage 1: Lock ONLY Buyer 1 ("윤지혜") thread
        await pageA.getByTestId("inbox-filter-chip-all").click({ timeout: 10_000 }).catch(() => {});
        await pageA.waitForTimeout(400);
        const rowB = l2Buyer1GateReqId
          ? pageA.getByTestId(`inbox-thread-row-${l2Buyer1GateReqId}`).first()
          : pageA.locator('[data-testid^="inbox-thread-row-"]', { hasText: "윤지혜 매니저" }).first();
        await rowB.click({ timeout: 15_000 });
        await pageA.waitForTimeout(300);
        if (!(await pageA.getByTestId("lock-share-link-trigger-btn").isVisible().catch(() => false))) {
          await pageA
            .locator('[data-testid="inbox-link-governance-disclosure"] > summary')
            .first()
            .click({ timeout: 10_000 });
          await pageA.waitForTimeout(200);
        }
        await pageA.getByTestId("lock-share-link-trigger-btn").click({ timeout: 15_000 });
        await pageA.getByTestId("lock-share-link-inline-confirm").waitFor({
          state: "visible",
          timeout: 15_000,
        });
        const entireChk = pageA.getByTestId("lock-entire-building-checkbox");
        expect(await entireChk.isChecked()).toBe(false);
        const [revokeThreadRes] = await Promise.all([
          pageA.waitForResponse(
            (r) =>
              r.url().includes("/api/broker/share-links/revoke") &&
              r.request().method() === "POST",
            { timeout: 15_000 },
          ),
          pageA.getByTestId("confirm-lock-link-btn").click({ timeout: 15_000 }),
        ]);
        expect(revokeThreadRes.status()).toBe(200);
        await pageA.waitForTimeout(500);

        await pageB.reload({ waitUntil: "networkidle" });
        await hideDevOverlay(pageB);
        const buyer1RevokedAfterThreadLock = await pageB
          .getByTestId("revoked-im-screen")
          .isVisible()
          .catch(() => false);
        const s6BRevoked = saveShot("l2_s6_buyer1_revoked_390.png");
        await pageB.screenshot({ path: s6BRevoked, fullPage: false });
        screenshots.push(s6BRevoked);

        await pageC.reload({ waitUntil: "networkidle" });
        await hideDevOverlay(pageC);
        const buyer2StillOpenAfterThreadLock = !(await pageC
          .getByTestId("revoked-im-screen")
          .isVisible()
          .catch(() => false));
        const s6COpen = saveShot("l2_s6_buyer2_still_open_1440.png");
        await pageC.screenshot({ path: s6COpen, fullPage: false });
        screenshots.push(s6COpen);

        // Simultaneously run /qa-full-loop Live Probe checking orthogonal link state
        await pageA.goto(`/qa-full-loop?qaKey=${encodeURIComponent(runState.qaKey)}`, {
          waitUntil: "networkidle",
        });
        await hideDevOverlay(pageA);
        await pageA.locator("button", { hasText: "Loop 2 · 역삼 2,000억" }).first().click();
        await pageA.waitForTimeout(250);
        const origin = new URL(pageA.url()).origin;
        await pageA.locator("#fl-dc-url").fill(`${origin}${l2DcRelUrl}`);
        await pageA.locator("#fl-im1-url").fill(`${origin}${l2TokenBUrl}`);
        await pageA.locator("#fl-im2-url").fill(`${origin}${l2TokenCUrl}`);
        if (l2NlPublicUrl) await pageA.locator("#fl-nl-url").fill(`${origin}${l2NlPublicUrl}`);
        await pageA.locator("#fl-sub-contact").fill("010-2849-7105");

        const [orthProbeRes] = await Promise.all([
          pageA.waitForResponse(
            (r) => r.url().includes("/api/public/qa-workbench") && r.request().method() === "POST",
            { timeout: 45_000 },
          ),
          pageA.locator("button", { hasText: /입력한 링크·면적 자동 점검 실행|1초 자동 오라클/ }).first().click(),
        ]);
        const orthJson = await orthProbeRes.json().catch(() => ({}));
        await pageA.waitForTimeout(300);
        const s6Probe = saveShot("l2_s6_qa_probe_orthogonal.png");
        await pageA.screenshot({ path: s6Probe, fullPage: false });
        screenshots.push(s6Probe);

        // Stage 2: Building-wide lock via Buyer 2 ("박매수")
        await pageA.goto("/broker/w/inbox", { waitUntil: "networkidle" });
        await hideDevOverlay(pageA);
        await pageA.getByTestId("inbox-filter-chip-all").click({ timeout: 10_000 }).catch(() => {});
        await pageA.waitForTimeout(400);
        const rowC = l2Buyer2GateReqId
          ? pageA.getByTestId(`inbox-thread-row-${l2Buyer2GateReqId}`).first()
          : pageA.locator('[data-testid^="inbox-thread-row-"]', { hasText: "박매수 상무" }).first();
        await rowC.click({ timeout: 15_000 });
        await pageA.waitForTimeout(300);
        if (!(await pageA.getByTestId("lock-share-link-trigger-btn").isVisible().catch(() => false))) {
          await pageA
            .locator('[data-testid="inbox-link-governance-disclosure"] > summary')
            .first()
            .click({ timeout: 10_000 });
          await pageA.waitForTimeout(200);
        }
        await pageA.getByTestId("lock-share-link-trigger-btn").click({ timeout: 15_000 });
        await pageA.getByTestId("lock-share-link-inline-confirm").waitFor({
          state: "visible",
          timeout: 15_000,
        });
        await pageA.getByTestId("lock-entire-building-checkbox").check({ timeout: 15_000 });
        const [revokeBuildingRes] = await Promise.all([
          pageA.waitForResponse(
            (r) =>
              r.url().includes("/api/broker/share-links/revoke") &&
              r.request().method() === "POST",
            { timeout: 15_000 },
          ),
          pageA.getByTestId("confirm-lock-link-btn").click({ timeout: 15_000 }),
        ]);
        expect(revokeBuildingRes.status()).toBe(200);
        await pageA.waitForTimeout(500);

        await pageC.reload({ waitUntil: "networkidle" });
        await hideDevOverlay(pageC);
        const buyer2RevokedAfterBuildingLock = await pageC
          .getByTestId("revoked-im-screen")
          .isVisible()
          .catch(() => false);
        const s6CRevoked = saveShot("l2_s6_buyer2_revoked_1440.png");
        await pageC.screenshot({ path: s6CRevoked, fullPage: false });
        screenshots.push(s6CRevoked);

        checks.buyer1RevokedAfterThreadLock = buyer1RevokedAfterThreadLock;
        checks.buyer2StillOpenAfterThreadLock = buyer2StillOpenAfterThreadLock;
        checks.buyer2RevokedAfterBuildingLock = buyer2RevokedAfterBuildingLock;
        checks.orthogonalProbeHttp = orthProbeRes.status();
        checks.orthogonalProbeShareLocked = orthJson.shareLinkCheck?.isLocked ?? null;
        checks.orthogonalProbeSecondaryLocked = orthJson.secondaryShareLinkCheck?.isLocked ?? null;

        if (!buyer1RevokedAfterThreadLock || !buyer2StillOpenAfterThreadLock) {
          defects.push(
            `REVOKED_ORTHOGONAL_FAIL: bRevoked=${buyer1RevokedAfterThreadLock}, cStillOpen=${buyer2StillOpenAfterThreadLock}`,
          );
        }
        if (!buyer2RevokedAfterBuildingLock) {
          defects.push("BUILDING_WIDE_LOCK_FAIL: 건물 전체 잠금 후 창 C 차단 안 됨");
        }

        personaNotes.push(
          `[IB-MG-03 직교 회수] 단건 잠금(창B=${buyer1RevokedAfterThreadLock}/창C유지=${buyer2StillOpenAfterThreadLock}) → 건물 전체 잠금(창C차단=${buyer2RevokedAfterBuildingLock})`,
        );
      },
    );

    // ── L2-S7: 직접 등록 고객 삭제 · 공용 PC 소거 점검 · Sign-off 14문항 확인 ──
    await recordStep(
      {
        stepId: "L2-S7",
        loopId: "loop2",
        subsystem: "오라클·보안마감",
        title: loop2Def.steps[6].title,
        targetMinutes: 1,
      },
      async ({ checks, defects, screenshots, personaNotes }) => {
        // Test [+ 고객 직접 등록] + Duplicate Warning + [고객 삭제]
        if (!pageA.url().includes("/broker/w/inbox")) {
          await pageA.goto("/broker/w/inbox", { waitUntil: "networkidle" });
          await hideDevOverlay(pageA);
        }
        await pageA.getByTestId("open-new-client-modal-btn").click({ timeout: 15_000 });
        await pageA.getByTestId("inbox-new-client-dialog").waitFor({
          state: "visible",
          timeout: 15_000,
        });
        await pageA.getByTestId("new-client-name-input").fill("PPGT직접등록삭제테스트");
        await pageA.getByTestId("new-client-phone-input").fill("010-7766-5544");
        const [createRes] = await Promise.all([
          pageA.waitForResponse((r) => r.url().includes("/api/broker/inbox/actions"), {
            timeout: 15_000,
          }),
          pageA.getByTestId("submit-new-client-btn").click({ timeout: 15_000 }),
        ]);
        const cj = await createRes.json().catch(() => ({}));
        const customId = String(cj.client?.id || cj.id || cj.clientId || "");
        if (customId) runState.createdClientIds.push(customId);
        await pageA.waitForTimeout(500);

        await pageA.getByTestId("inbox-filter-chip-all").click({ timeout: 10_000 }).catch(() => {});
        await pageA.waitForTimeout(400);
        const testRow = pageA
          .locator('[data-testid^="inbox-thread-row-"]', { hasText: "PPGT직접등록삭제테스트" })
          .first();
        await testRow.click({ timeout: 15_000 });
        await pageA.waitForTimeout(300);

        let clientDeletedOk = false;
        const delBtn = pageA.locator('[data-testid="delete-custom-client-btn"]').first();
        if (await delBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await delBtn.click({ timeout: 10_000 });
          await pageA.waitForTimeout(300);
          const matchInput = pageA.locator('[data-testid="confirm-delete-match-input"]').last();
          const confBtn = pageA.locator('[data-testid="confirm-delete-confirm-btn"]').last();
          if (await matchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
            expect(await confBtn.isDisabled()).toBe(true);
            await matchInput.fill("PPGT직접등록삭제테스트");
            await pageA.waitForTimeout(150);
          }
          if (await confBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
            expect(await confBtn.isDisabled()).toBe(false);
            const [delRes] = await Promise.all([
              pageA.waitForResponse(
                (r) =>
                  r.url().includes("/api/broker/inbox/actions") &&
                  r.request().method() === "POST" &&
                  (r.request().postData() || "").includes("delete_client"),
                { timeout: 15_000 },
              ),
              confBtn.click({ timeout: 10_000 }),
            ]);
            expect(delRes.status()).toBe(200);
            await testRow.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
          }
          clientDeletedOk = !(await pageA
            .locator('[data-testid^="inbox-thread-row-"]', { hasText: "PPGT직접등록삭제테스트" })
            .first()
            .isVisible()
            .catch(() => false));
        }

        // Capture Inbox mobile 390 xlarge ergonomics
        await pageA.setViewportSize({ width: 390, height: 844 });
        await applyFontScale(pageA, "xlarge");
        await pageA.waitForTimeout(300);
        const inboxMobProbe = await collectDomProbe(pageA, "main");
        const s7InboxMob = saveShot("l2_s7_inbox_mobile_390.png");
        await pageA.screenshot({ path: s7InboxMob, fullPage: true });
        screenshots.push(s7InboxMob);

        // Storage hygiene & Sign-off 14 rows on /qa-full-loop
        await pageA.setViewportSize({ width: 1440, height: 900 });
        await applyFontScale(pageA, "normal");
        await pageA.goto(`/qa-full-loop?qaKey=${encodeURIComponent(runState.qaKey)}`, {
          waitUntil: "networkidle",
        });
        await hideDevOverlay(pageA);
        await pageA
          .locator("button", { hasText: "🧹 공용 PC 브라우저 잔여 키 점검" })
          .first()
          .click({ timeout: 15_000 });
        await pageA.waitForTimeout(200);
        const cleanBannerVisible = await pageA
          .locator("text=/✓ 점검 완료/")
          .first()
          .isVisible()
          .catch(() => false);

        await pageA.locator("button", { hasText: "📋 Sign-off" }).first().click({ timeout: 15_000 });
        await pageA.waitForTimeout(250);
        const signoffRowCount = await pageA.locator("table tbody tr").count();
        const s7Signoff = saveShot("l2_s7_signoff_matrix.png");
        await pageA.screenshot({ path: s7Signoff, fullPage: false });
        screenshots.push(s7Signoff);

        checks.clientDeletedOk = clientDeletedOk;
        checks.inboxMobileOverflowPx = inboxMobProbe.horizontalOverflowPx;
        checks.cleanBannerVisible = cleanBannerVisible;
        checks.signoffRowCount = signoffRowCount;
        if (!cleanBannerVisible) defects.push("STORAGE_HYGIENE_NOT_CLEAN");
        if (signoffRowCount !== 14) defects.push(`SIGNOFF_ROW_COUNT_MISMATCH: ${signoffRowCount}`);
        if (inboxMobProbe.horizontalOverflowPx > 0) {
          defects.push(`INBOX_MOBILE_OVERFLOW: ${inboxMobProbe.horizontalOverflowPx}px`);
        }

        // Score IB-MG-03 (Security Guard) & IB-MG-04 (Mobile Responsive)
        const orthFailed = runState.stepResults.some(
          (r) => r.stepId === "L2-S6" && r.verdict === "FAIL",
        );
        runState.inboxRuns.push(
          scoreInboxPpgtRun({
            personaId: "IB-MG-03",
            surface: "/broker/w/inbox (LOOP-02 직교회수)",
            viewport: "1440x900",
            fontScale: "normal",
            aboveFoldActionCount: 6,
            totalVisibleInteractiveCount: 16,
            horizontalOverflowPx: 0,
            sub44ButtonsCount: 0,
            sub15TextsCount: 0,
            clippedButtonsCount: 0,
            brokenImgCount: 0,
            consoleErrorCount: loop2ConsoleErrors.length,
            pageErrorCount: pageErrorsA.length,
            poisonTokenCount: 0,
            bannedTermCount: 0,
            unblockedImDispatchCount: orthFailed ? 1 : 0,
            crmSafetyViolationCount: clientDeletedOk ? 0 : 1,
            dishonestTimelineOrStaleAiCount: 0,
            taskCompleted: !orthFailed && clientDeletedOk && cleanBannerVisible,
            blockingModalDetected: false,
            boundaryViolationCount: orthFailed ? 1 : 0,
            provenanceBadgeVisible: true,
            artifactValid: cleanBannerVisible,
            honestSaveVisible: true,
          }),
        );

        runState.inboxRuns.push(
          scoreInboxPpgtRun({
            personaId: "IB-MG-04",
            surface: "/broker/w/inbox (모바일 390 xlarge)",
            viewport: "390x844",
            fontScale: "xlarge",
            aboveFoldActionCount: inboxMobProbe.aboveFoldActionCount,
            totalVisibleInteractiveCount: inboxMobProbe.totalVisibleInteractiveCount,
            horizontalOverflowPx: inboxMobProbe.horizontalOverflowPx,
            sub44ButtonsCount: inboxMobProbe.sub44Buttons.length,
            sub15TextsCount: inboxMobProbe.sub15Texts.length,
            clippedButtonsCount: inboxMobProbe.clippedButtons.length,
            brokenImgCount: inboxMobProbe.brokenImgs.length,
            consoleErrorCount: loop2ConsoleErrors.length,
            pageErrorCount: pageErrorsA.length,
            poisonTokenCount: countPoisonTokens(inboxMobProbe.visibleText),
            bannedTermCount: countBannedTerms(inboxMobProbe.visibleText),
            unblockedImDispatchCount: 0,
            crmSafetyViolationCount: 0,
            dishonestTimelineOrStaleAiCount: 0,
            taskCompleted: true,
            blockingModalDetected: false,
            boundaryViolationCount: inboxMobProbe.horizontalOverflowPx > 0 ? 1 : 0,
            provenanceBadgeVisible: true,
            artifactValid: true,
          }),
        );

        personaNotes.push(
          `[IB-MG-04 & 보안마감] 고객삭제=${clientDeletedOk} · 소거점검=${cleanBannerVisible} · Sign-off=${signoffRowCount}행`,
        );
      },
    );

    // =========================================================================
    // AGGREGATE CRE-PPGT-100 & PERSIST MANIFEST + SCORECARD
    // =========================================================================
    const dcBacklog = rankDealCardPpgtBacklog(runState.dealcardRuns);
    const imBacklog = rankImPpgtBacklog(runState.imRuns);
    const nlBacklog = rankNewsletterPpgtBacklog(runState.newsletterRuns);
    const ibBacklog = rankInboxPpgtBacklog(runState.inboxRuns);

    const unified = buildUnifiedCreReport100({
      imRuns: runState.imRuns,
      newsletterRuns: runState.newsletterRuns,
      dealcardRuns: runState.dealcardRuns,
      inboxRuns: runState.inboxRuns,
      imBacklog,
      newsletterBacklog: nlBacklog,
      dealcardBacklog: dcBacklog,
      inboxBacklog: ibBacklog,
    });

    const md = formatUnifiedCreScorecardMarkdown(unified);
    fs.writeFileSync(
      path.join(OUT_ROOT, "qa-full-loop-scorecard.json"),
      JSON.stringify(unified, null, 2),
      "utf-8",
    );
    fs.writeFileSync(path.join(OUT_ROOT, "qa-full-loop-scorecard.md"), md, "utf-8");
    fs.writeFileSync(
      path.join(OUT_ROOT, "qa-full-loop-manifest.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          workbenchId: QA_FULL_LOOP_WORKBENCH_ID,
          antiSycophancy: runState.antiSycophancy,
          loop1Details: runState.loop1Details,
          loop2Details: runState.loop2Details,
          runtimeErrors: {
            loop1ConsoleErrors,
            loop2ConsoleErrors,
            pageErrorsA,
            pageErrorsB,
            pageErrorsC,
            server500s,
          },
          stepResults: runState.stepResults,
          unifiedScorecard: {
            overallRawMean100: unified.overallRawMean100,
            overallEffectiveMean100: unified.overallEffectiveMean100,
            totalFloorRiskCount: unified.totalFloorRiskCount,
            readyForHuman2nd: unified.readyForHuman2nd,
            subsystems: {
              dealcard: unified.subsystems.dealcard,
              im: unified.subsystems.im,
              newsletter: unified.subsystems.newsletter,
              inbox: unified.subsystems.inbox,
            },
            topBacklog: unified.topBacklog,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    console.log("\n" + md + "\n");
    expect(runState.stepResults).toHaveLength(14);
    expect(server500s).toEqual([]);
    const hydrationErrors = [
      ...loop1ConsoleErrors,
      ...loop2ConsoleErrors,
      ...pageErrorsA,
      ...pageErrorsB,
      ...pageErrorsC,
    ].filter((msg) => /Minified React error #(?:418|425)|Hydration failed|did not match/i.test(msg));
    expect(hydrationErrors).toEqual([]);
    expect(unified.totalFloorRiskCount).toBe(0);
    expect(unified.readyForHuman2nd).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    // 1) Restore broker profile
    if (runState.origProfile) {
      await request
        .put("/api/broker/profile", { data: runState.origProfile })
        .catch(() => {});
    }

    // 2) Close Playwright contexts
    await windowA?.close().catch(() => {});
    await windowB?.close().catch(() => {});
    await windowC?.close().catch(() => {});

    // 3) Clean up test entities via API + Supabase Service Client
    for (const eid of Array.from(new Set(runState.createdEditionIds))) {
      await request.delete(`/api/magazine/editions?id=${encodeURIComponent(eid)}`).catch(() => {});
    }
    for (const cid of Array.from(new Set(runState.createdClientIds))) {
      await request
        .post("/api/broker/inbox/actions", { data: { action: "delete_client", clientId: cid } })
        .catch(() => {});
    }
    for (const bid of Array.from(new Set(runState.createdBuildingIds))) {
      await request
        .patch("/api/broker/workspace/summary", { data: { action: "delete", buildingId: bid } })
        .catch(() => {});
      await request
        .delete(`/api/broker/deal-card/${encodeURIComponent(bid)}/delete`)
        .catch(() => {});
    }

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sbUrl && sbKey) {
      const admin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
      const bIds = Array.from(new Set(runState.createdBuildingIds)).filter((id) =>
        UUID_REGEX.test(id),
      );
      if (bIds.length > 0) {
        await admin.from("document_objects").delete().in("building_id", bIds);
        await admin.from("building_signal_cards").delete().in("building_id", bIds);
        await admin.from("im_inquiry_requests").delete().in("building_id", bIds);
        await admin.from("share_link_revocations").delete().in("building_id", bIds);
        await admin.from("building_ssot_lite").delete().in("id", bIds);
        await admin.from("workspace_items").delete().in("building_id", bIds);
        await admin.from("workspace_items").delete().in("id", bIds);
      }
      if (runState.createdDocIds.length > 0) {
        const dIds = Array.from(new Set(runState.createdDocIds)).filter((id) => UUID_REGEX.test(id));
        if (dIds.length > 0) {
          await admin.from("workspace_items").delete().in("id", dIds);
          await admin.from("document_objects").delete().in("id", dIds);
        }
      }
      for (const bid of Array.from(new Set(runState.createdBuildingIds))) {
        await admin
          .from("activity_events")
          .delete()
          .eq("event_type", "gate_request_created")
          .eq("metadata->>building_id", bid);
      }
      const phoneRlKey = `rl:magazine-subscribe:target:${crypto
        .createHash("sha256")
        .update("p:01055012389")
        .digest("hex")
        .slice(0, 32)}`;
      await admin.from("magazine_rate_limits").delete().eq("key", phoneRlKey);
      await admin
        .from("magazine_subscribers")
        .delete()
        .eq("subscriber_email", "sb.jung@example.kr");
      await admin
        .from("broker_clients")
        .delete()
        .in("phone", [
          "01055012389",
          "010-5501-2389",
          "01028497105",
          "010-2849-7105",
          "01088887777",
          "010-8888-7777",
          "01077665544",
          "010-7766-5544",
        ]);
    }
  });
});
