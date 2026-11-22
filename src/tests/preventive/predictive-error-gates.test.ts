import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { assertBuildingOwner, assertDocOwner } from "@/lib/authz/assert-owner";
import { formatKoreanCurrencyReadout } from "@/lib/rent-roll/tsv-parser";
import { formatPyeong } from "@/lib/utils/area-conversion";
import { formatBasicCoverTitle } from "@/domain/building/mobile-im/pptx/pptx-renderer";
import { buildBasicImSlideDefaults } from "@/domain/building/pptx-studio/studio-service";
import { parseMemoIntoCard4 } from "@/lib/deal-card/memo-pairing";
import { classifyPoi } from "@/domain/building/mobile-im/pptx/location-poi-selector";
import { buildYieldSetFromBody } from "@/domain/building/mobile-im/yield-set";
import {
  isRealUploadedPhotoUrl,
  resolveRenderablePhotoSrc,
} from "@/app/(broker)/broker/w/im/_components/im-workspace-types";

const REPO_ROOT = process.cwd();
const SRC_ROOT = path.join(REPO_ROOT, "src");

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("Predictive Error Audit — Preventive Regression Gates (Gates 1-8)", () => {
  it("Gate 1 (Storage Bucket SSOT): zero legacy hyphenated storage bucket calls anywhere in src/", () => {
    const files = collectTsFiles(SRC_ROOT).filter(
      (f) => !f.endsWith("predictive-error-gates.test.ts"),
    );
    const legacyBucket = "building" + "-photos";
    const badHits: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf-8");
      const matches = text.matchAll(/\.storage\.from\(\s*['"`]([^'"`]+)['"`]/g);
      for (const m of matches) {
        if (m[1] === legacyBucket) {
          badHits.push(path.relative(REPO_ROOT, file));
        }
      }
    }
    expect(badHits).toEqual([]);
  });

  it("Gate 2 (UUID Boundary Safety): assertBuildingOwner & assertDocOwner map Postgres 22P02 to 404 NOT_FOUND and teaser event guards isUuid", async () => {
    const mock22p02Client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: {
                code: "22P02",
                message: 'invalid input syntax for type uuid: "bld-non-uuid"',
              },
            }),
          }),
        }),
      }),
    };

    const bldRes = await assertBuildingOwner(
      mock22p02Client as unknown as Parameters<typeof assertBuildingOwner>[0],
      "bld-non-uuid",
      "user-1",
    );
    expect(bldRes.ok).toBe(false);
    if (!bldRes.ok) {
      expect(bldRes.status).toBe(404);
      expect(bldRes.code).toBe("NOT_FOUND");
    }

    const docRes = await assertDocOwner(
      mock22p02Client as unknown as Parameters<typeof assertDocOwner>[0],
      "doc-non-uuid",
      "user-1",
    );
    expect(docRes.ok).toBe(false);
    if (!docRes.ok) {
      expect(docRes.status).toBe(404);
      expect(docRes.code).toBe("NOT_FOUND");
    }

    const teaserEventSrc = fs.readFileSync(
      path.join(SRC_ROOT, "app/api/public/teaser/event/route.ts"),
      "utf-8",
    );
    expect(teaserEventSrc).toContain("22P02");
    expect(teaserEventSrc).toContain("invalid input syntax for type uuid");
    expect(teaserEventSrc).toContain("isUuid(targetIdStr)");
  });

  it("Gate 3 (SSR Hydration Hazard Guard): audited interactive pages do not seed useState with Date.now/Math.random/randomUUID/localStorage", () => {
    const targetFiles = [
      "src/app/qa-full-loop/page.tsx",
      "src/app/qa-full-loop/_components/QaFullLoopWorkbenchClient.tsx",
      "src/app/qa-full-loop-v2/page.tsx",
      "src/app/dealcard-im-test/page.tsx",
      "src/app/newsletter-inbox-test/page.tsx",
      "src/app/(broker)/broker/w/im/page.tsx",
      "src/app/(broker)/broker/im-approval/[id]/im-approval-client.tsx",
      "src/components/workspace/WorkspaceShell.tsx",
    ];
    const hazardousInitRe =
      /useState<[^>]*>\(\(\)\s*=>\s*\{?[\s\S]{0,220}?(?:Date\.now\(|Math\.random\(|randomUUID\(|mintUniqueFreshImIds\(|localStorage\.getItem|createSessionId\(|createDcImSessionId\(|createQaSessionId\()/;

    for (const rel of targetFiles) {
      const content = fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8");
      expect(content, `${rel} still contains non-deterministic useState initializer`).not.toMatch(
        hazardousInitRe,
      );
    }
  });

  it("Gate 4 (Korean Mega-Deal Comma & Unit Formatting): 4-digit eok/pyeong retain Ko-KR commas while <1000 inputs stay intact", () => {
    expect(formatKoreanCurrencyReadout(13800000)).toBe("= 1,380억 원");
    expect(formatKoreanCurrencyReadout(950000)).toBe("= 95억 원");
    expect(formatPyeong(14256.7, 1)).toBe("4,312.7");
    expect(formatPyeong(440, 1)).toBe("133.1");

    const yeosamTitle = formatBasicCoverTitle({
      address: "서울특별시 강남구 역삼동 648-23",
      buildingName: "여삼빌딩",
      mainPurpose: "업무시설",
      askingPriceManwon: 20000000,
    });
    expect(yeosamTitle).toContain("2,000억");

    const dongaTitle = formatBasicCoverTitle({
      address: "경기도 부천시 원미구 중동 1142",
      buildingName: "동아빌딩",
      mainPurpose: "근린생활시설",
      askingPriceManwon: 1380000,
    });
    expect(dongaTitle).toContain("138억");
  });

  it("Gate 5 (DealCard Memo Parser Regression Guard): prioritizes explicit asking price & active income posture over comparison/future clauses", () => {
    const loop1Memo = [
      "[매물명] 부천 중동 동아빌딩",
      "[주소] 경기도 부천시 원미구 중동 1142",
      "[매매금액] 138억원 (인근 유사 건물 90~106억 원대 실거래 대비 급매)",
      "[연면적] 4,312평",
      "[규모/구조/주용도] 지하1층/지상5층, 철근콘크리트조, 업무시설 · 근린생활시설",
      "[임대현황] 전층 우량 병원·학원 임대 중 (보증금 5억 / 월 4,500만)",
      "[핵심포인트] 수익률 / 주차 / 중동역 도보 3분 초역세권 코너",
    ].join("\n");

    const card1 = parseMemoIntoCard4(loop1Memo);
    // Blind price band for 138억 is "120~140억" — must NOT fall back to comparison range "90~106억"
    expect(card1.priceBand).toBe("120~140억");
    expect(card1.priceBand).not.toContain("90~106");
    expect(card1.posture).toBe("income");
    expect(card1.area).toBeTruthy();
    expect(card1.points).not.toContain("수익률");
    expect(card1.points).not.toContain("주차");

    const loop2Memo = [
      "[매물명] 역삼동 여삼빌딩",
      "[주소] 서울특별시 강남구 역삼동 648-23",
      "[매각금액] 2,000억 원",
      "[규모/구조/주용도] 지하4층/지상15층, 업무시설",
      "[임대현황] 현재 1~15층 다국적 IT기업 장기 임차 중 (보증금 120억 / 월 8억)",
      "[개발잠재력] 향후 리모델링 및 증축 신축 검토 가능한 대로변 코너",
    ].join("\n");

    const card2 = parseMemoIntoCard4(loop2Memo);
    expect(card2.priceBand).toBe("2,000~2,200억");
    expect(card2.posture).toBe("income");
    expect(card2.use).toContain("업무");
  });

  it("Gate 6 (POI Department Store Purity & Expected Rent Roll Yield Sync)", () => {
    const fakeNames = ["가발백화점", "안경백화점", "속옷백화점", "타이어백화점"];
    for (const fakeName of fakeNames) {
      expect(
        classifyPoi({
          name: fakeName,
          category: "landmark",
          categoryName: "도소매",
          lat: 37.5,
          lng: 127.0,
          distanceM: 350,
        }),
        `${fakeName} must never be classified as shopping_major`,
      ).not.toBe("shopping_major");
    }

    expect(
      classifyPoi({
        name: "현대백화점 중동점",
        category: "landmark",
        categoryName: "가정,생활 > 백화점",
        lat: 37.5,
        lng: 127.0,
        distanceM: 350,
      }),
    ).toBe("shopping_major");

    const yieldSet = buildYieldSetFromBody({
      ssot_summary: {
        asking_price_manwon: 1380000,
        total_deposit_manwon: 50000,
        monthly_rent_total_krw: 4000 * 10000,
      },
      expected_rent_roll: [
        { floor: "1층", status: "vacant", depositManwon: 20000, monthlyRentManwon: 3000 },
        { floor: "2층", status: "occupied", depositManwon: 50000, monthlyRentManwon: 4000 },
      ],
    });
    // Both rows must count: (7,000만 * 12 = 8.4억) / (138억 - 7억 = 131억) = 6.41%
    expect(yieldSet.stabilized?.value).toBeCloseTo(6.41, 1);
  });

  it("Gate 7 (Fail-Closed QA Route & Building-Wide Revoke Sync)", () => {
    for (const relLayout of [
      "app/qa-full-loop/layout.tsx",
      "app/qa-full-loop-v2/layout.tsx",
    ]) {
      const layoutSrc = fs.readFileSync(path.join(SRC_ROOT, relLayout), "utf-8");
      expect(layoutSrc).toContain("matchQaKeyRole");
      expect(layoutSrc).toContain("notFound()");
    }

    const revokeSrc = fs.readFileSync(
      path.join(SRC_ROOT, "app/api/broker/share-links/revoke/route.ts"),
      "utf-8",
    );
    expect(revokeSrc).toMatch(/rawScope\s*===\s*['"]building['"]\s*\|\|\s*!token/);
    expect(revokeSrc).toContain("is_revoked");
  });

  it("Gate 8 (Trillion Readout, Studio Commas, Legacy->UUID Backlink & Orphan UUID Gate Filter)", () => {
    // 1. Trillion-won currency readout + comma parity
    expect(formatKoreanCurrencyReadout(105_000_000)).toBe("= 1조 500억 원");
    expect(formatKoreanCurrencyReadout(100_000_000)).toBe("= 1조 원");
    expect(formatKoreanCurrencyReadout(13_800_000)).toBe("= 1,380억 원");
    expect(formatKoreanCurrencyReadout(12_000)).toBe("= 1억 2,000만 원");

    // 2. Studio Basic IM slide defaults comma-format asking price (1,900억 원, never 1900억 원)
    const studioDefaults = buildBasicImSlideDefaults("여삼빌딩", {
      ssot_summary: {
        asking_price_manwon: 19_000_000,
        land_area_sqm: 1452.2,
        total_gross_area_sqm: 14256.64,
      },
    });
    const studioAllText = JSON.stringify(studioDefaults);
    expect(studioAllText).toContain("1,900억 원");
    expect(studioAllText).not.toContain("1900억 원");

    // 3. im/page.tsx passes legacyBuildingId and quick-generate back-links non-UUID DealCard without clobbering
    const imPageSrc = fs.readFileSync(
      path.join(SRC_ROOT, "app/(broker)/broker/w/im/page.tsx"),
      "utf-8",
    );
    expect(imPageSrc).toContain("legacyBuildingId");

    const qgSrc = fs.readFileSync(
      path.join(SRC_ROOT, "app/api/broker/im-lite/quick-generate/route.ts"),
      "utf-8",
    );
    expect(qgSrc).toContain("legacyBuildingId");
    expect(qgSrc).toContain("body.legacyBuildingId");
    expect(qgSrc).toContain(".eq('legacy_id', legacyBuildingId)");
    expect(qgSrc).toContain("linkedExistingLegacyDealCard");

    // 4. Inbox query events & pending-count ignore orphaned/ghost UUID events not in gate_requests
    const inboxEventsSrc = fs.readFileSync(
      path.join(SRC_ROOT, "lib/inbox/inbox-query-events.ts"),
      "utf-8",
    );
    expect(inboxEventsSrc).toContain("allOwnedBuildingIds.length > 0 && UUID_RE.test(bId) && !allOwnedBuildingIds.includes(bId)");
    expect(inboxEventsSrc).toContain("UUID_RE.test(bId) && (!meta.gate_request_id || UUID_RE.test(gateId))");

    const inboxPendingSrc = fs.readFileSync(
      path.join(SRC_ROOT, "lib/inbox/inbox-pending-count.ts"),
      "utf-8",
    );
    expect(inboxPendingSrc).toContain("isUuid(bId) && (!meta.gate_request_id || isUuid(gateId))");

    // 5. Real uploaded photo URLs (https/http/data) must never be overwritten by QA-gated testguide-assets
    expect(qgSrc).toContain("isRealUploadedUrl");
    const qgStoreSrc = fs.readFileSync(
      path.join(SRC_ROOT, "lib/im-lite/quick-generate-store.ts"),
      "utf-8",
    );
    expect(qgStoreSrc).toContain("isRealUploadedUrl");

    for (const relFile of [
      "lib/workspace/summary/patch-upsert-im.ts",
      "app/api/broker/buildings/route.ts",
      "app/(broker)/broker/w/im/_components/im-workspace-types.ts",
      "app/(broker)/broker/w/im/page.tsx",
      "app/(broker)/broker/w/im/_hooks/useImServerHydration.ts",
    ]) {
      const content = fs.readFileSync(path.join(SRC_ROOT, relFile), "utf-8");
      expect(content, `${relFile} must guard real uploaded URLs via isRealUploadedPhotoUrl`).toContain(
        "isRealUploadedPhotoUrl",
      );
    }

    const realSupabaseUrl =
      "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/drafts/u/b/im-photos/123.jpg";
    const legacyTestguideUrl =
      "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/01_exterior.jpg";

    expect(isRealUploadedPhotoUrl(realSupabaseUrl)).toBe(true);
    expect(isRealUploadedPhotoUrl(legacyTestguideUrl)).toBe(false);
    expect(
      resolveRenderablePhotoSrc({
        name: "01_부천_동아빌딩_전면외관.jpg",
        url: realSupabaseUrl,
      }),
    ).toBe(realSupabaseUrl);

    // 6. Concurrent draft upsert must never downgrade a published/sent workspace item; magazine-editor initial fetch disables cache
    const wsRepoSrc = fs.readFileSync(
      path.join(SRC_ROOT, "lib/workspace/workspace-repository.ts"),
      "utf-8",
    );
    expect(wsRepoSrc).toContain("existingIsPublished");

    const magEditorSrc = fs.readFileSync(
      path.join(SRC_ROOT, "app/(broker)/broker/magazine-editor/page.tsx"),
      "utf-8",
    );
    expect(magEditorSrc).toMatch(
      /\/api\/magazine\/editions\?broker_id=me&type=all&limit=50",\s*\{\s*cache:\s*"no-store"/,
    );

    // 7. Orphaned UUIDs skip legacy building FK writes & get-summary never resurrects deleted UUID ghosts; slow lookup guards live rentRoll
    const patchUpsertSrc = fs.readFileSync(
      path.join(SRC_ROOT, "lib/workspace/summary/patch-upsert.ts"),
      "utf-8",
    );
    expect(patchUpsertSrc).toContain("buildingExistsInSsot !== false");

    const getSummarySrc = fs.readFileSync(
      path.join(SRC_ROOT, "lib/workspace/summary/get-summary.ts"),
      "utf-8",
    );
    expect(getSummarySrc).toContain("liveUuidSet");

    expect(imPageSrc).toContain("latestRentRollRef");
    expect(imPageSrc).toContain("liveRentRoll");

    // 8. Orphaned UUIDs never violate Postgres FK workspace_items_building_id_fkey (23503)
    expect(patchUpsertSrc).toContain("verifiedSsotBuildingId");
    expect(wsRepoSrc).toContain("23503");
    expect(wsRepoSrc).toContain("workspace_items_building_id_fkey");

    // 9. TOCTOU protection: SQL conditional update + client autosave flush before mark_sent
    expect(wsRepoSrc).toContain(".neq('status', 'sent')");
    expect(wsRepoSrc).toContain(".neq('status', 'published')");
    const dcPageSrc = fs.readFileSync(
      path.join(SRC_ROOT, "app/(broker)/broker/w/dealcards/page.tsx"),
      "utf-8",
    );
    expect(dcPageSrc).toMatch(/handleMarkSent[\s\S]{0,300}autosave\.flush\(\)/);
  });

  it("Gate 9 (P1 IM Step 4 Photo Density Disclosure + P3 Studio Dot & Dynamic Yield Subtitle)", () => {
    const imPanelsSrc = fs.readFileSync(
      path.join(SRC_ROOT, "app/(broker)/broker/w/im/_components/ImEditorPanels.tsx"),
      "utf-8",
    );
    expect(imPanelsSrc).toContain("expandedPhotoKey");
    expect(imPanelsSrc).toContain("im-photo-edit-toggle-");
    expect(imPanelsSrc).not.toMatch(/\btext-xs\b/);

    const studioPreviewSrc = fs.readFileSync(
      path.join(SRC_ROOT, "app/(broker)/broker/basic-im-studio/[buildingId]/components/SlidePreview.tsx"),
      "utf-8",
    );
    expect(studioPreviewSrc).toContain('className="inline-flex items-center gap-1.5 min-w-0"');
    expect(studioPreviewSrc).toContain('className="shrink-0 opacity-70"');

    const a23YieldSrc = fs.readFileSync(
      path.join(SRC_ROOT, "domain/building/mobile-im/pptx/archetypes/a23-yield-formula.ts"),
      "utf-8",
    );
    expect(a23YieldSrc).toContain("landHistoryPoints.length");
    expect(a23YieldSrc).toContain("최근 ${landHistoryYearCount}개년 지가 추이 및 토지 평당 매매가");
    expect(a23YieldSrc).not.toContain("'최근 5개년 지가 추이 및 토지 평당 매매가'");
  });
});
