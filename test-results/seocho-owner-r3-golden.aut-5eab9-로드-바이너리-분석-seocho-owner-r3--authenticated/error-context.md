# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: seocho-owner-r3-golden.auth.spec.ts >> seocho-owner-r3 골든 E2E (owner_occupied / R3) >> Phase 3: PPTX 다운로드 + 바이너리 분석 [seocho-owner-r3]
- Location: e2e\helpers\golden-test-factory.ts:434:11

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 7
Received:    6
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - region "Notifications alt+T"
  - generic [ref=e2]:
    - button "라이트 모드로 전환" [ref=e4]
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: ✓ 공식 승인 완료
        - link "📊 공식 검증 PPTX 다운로드" [active] [ref=e18] [cursor=pointer]:
          - /url: /api/public/im-lite/2988000b-3ff2-4437-8d07-e798bb10f591/pptx
          - generic [ref=e19]: 📊
          - text: 공식 검증 PPTX 다운로드
      - generic [ref=e20]:
        - generic [ref=e21]:
          - link "IM 보관함" [ref=e23] [cursor=pointer]:
            - /url: /broker/buildings?tab=im
          - generic [ref=e26]: 📄 IM Lite
          - button "공유" [ref=e28]
        - navigation "IM 섹션 탐색" [ref=e31]:
          - button "섹션 1" [ref=e32]
          - button "섹션 2" [ref=e33]
          - button "섹션 3" [ref=e34]
          - button "섹션 4" [ref=e35]
          - button "섹션 5" [ref=e36]
          - button "섹션 6" [ref=e37]
          - button "섹션 7" [ref=e38]
          - button "섹션 8" [ref=e39]
          - button "섹션 9" [ref=e40]
          - button "섹션 10" [ref=e41]
      - generic [ref=e42]:
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: 기타
            - generic [ref=e46]: 📍
            - generic [ref=e47]: 📏
          - heading "서초·양재권역 기타 매각" [level=1] [ref=e48]
          - generic [ref=e49]:
            - generic [ref=e50]: 전문 중개인 검증 완료
            - generic [ref=e53]: 🟢 A등급 — 사옥 매입 검토 가능
          - paragraph
          - paragraph [ref=e54]: 서초·양재권역 소재, 기타, 매각 희망가 230억 원대
          - paragraph [ref=e55]: "AI 생성: 2026. 9. 25. · 크리딜 모바일 IM Lite"
        - generic [ref=e58]:
          - generic [ref=e59]:
            - generic [ref=e60]: 기타
            - generic [ref=e61]:
              - generic [ref=e62]: 📍
              - text: 서초·양재권역
            - generic [ref=e63]:
              - generic [ref=e64]: 💰
              - text: 230억 원
          - generic [ref=e65]:
            - generic [ref=e66]:
              - paragraph [ref=e67]: 건축 연면적
              - paragraph [ref=e68]: 2,104.88㎡ (636.7평)
            - generic [ref=e69]:
              - paragraph [ref=e70]: 매각 희망가
              - paragraph [ref=e71]: 230억 원
            - generic [ref=e72]:
              - paragraph [ref=e73]: 자기자본 소요
              - paragraph [ref=e74]: 230억
            - generic [ref=e75]:
              - paragraph [ref=e76]: 자가/임차 절감액
              - paragraph [ref=e77]: 5.3억
          - generic [ref=e78]:
            - paragraph [ref=e79]: 💡 3대 핵심 투자 포인트
            - list [ref=e80]:
              - listitem [ref=e81]:
                - generic [ref=e82]: "01"
                - generic [ref=e83]: "사옥 가치: 서초·양재권역 소재 단독 사옥으로 기업 브랜딩 및 자산 축적 효과"
              - listitem [ref=e84]:
                - generic [ref=e85]: "02"
                - generic [ref=e86]: "비용 절감: 기존 임차료 대비 사옥 매입 시 실질 비용 절감 및 손익분기 분석"
              - listitem [ref=e87]:
                - generic [ref=e88]: "03"
                - generic [ref=e89]: "실사 점검: 등기·건축물대장·시설물 상태 점검을 통한 매입 리스크 진단"
          - generic [ref=e90]:
            - paragraph [ref=e91]: ⚠️ 핵심 리스크 및 점검 사항
            - paragraph [ref=e92]: 공실률 미확인, 등기·건축물대장 현장 실사 필요. 투자 결정 전 반드시 직접 검증하시기 바랍니다.
          - generic [ref=e94]:
            - progressbar [ref=e95]
            - generic [ref=e97]: 보충 자료 필요
        - generic [ref=e100] [cursor=pointer]:
          - generic [ref=e102]:
            - generic:
              - img "서초·양재권역 기타 매각 위치 지도"
            - generic [ref=e103]:
              - link "카카오맵 길찾기" [ref=e104]:
                - /url: https://map.kakao.com/link/map/%EC%84%9C%EC%B4%88%C2%B7%EC%96%91%EC%9E%AC%EA%B6%8C%EC%97%AD%20%EA%B8%B0%ED%83%80%20%EB%A7%A4%EA%B0%81,37.4856705505955,127.030527120794
              - link "N 네이버 지도" [ref=e107]:
                - /url: https://map.naver.com/p/search/37.4856705505955,127.030527120794
                - generic [ref=e108]: "N"
                - text: 네이버 지도
          - generic [ref=e109]: 위치 지도
          - generic [ref=e110]: 1 / 1
          - generic [ref=e112]: +1장 더보기
        - generic [ref=e114]:
          - button "1 🏢 이 매물, 어떤 자산인가 ✓ 공부 확인 SSoT 자동 ✓ 확인됨" [ref=e117]:
            - generic [ref=e118]: "1"
            - generic [ref=e119]:
              - generic [ref=e120]:
                - generic [ref=e121]: 🏢
                - generic [ref=e122]: 이 매물, 어떤 자산인가
              - generic [ref=e123]: ✓ 공부 확인
            - generic [ref=e125]:
              - generic [ref=e126]: SSoT 자동
              - generic [ref=e127]: ✓ 확인됨
          - button "2 🎯 왜 지금 이 매물을 사야 하는가 AI 생성 ◇ AI 추론" [ref=e132]:
            - generic [ref=e133]: "2"
            - generic [ref=e135]:
              - generic [ref=e136]: 🎯
              - generic [ref=e137]: 왜 지금 이 매물을 사야 하는가
            - generic [ref=e138]:
              - generic [ref=e139]: AI 생성
              - generic [ref=e140]: ◇ AI 추론
          - generic [ref=e143]:
            - button "3 📍 이 입지, 투자할 만한 곳인가 AI 생성 ◇ AI 추론" [ref=e145]:
              - generic [ref=e146]: "3"
              - generic [ref=e148]:
                - generic [ref=e149]: 📍
                - generic [ref=e150]: 이 입지, 투자할 만한 곳인가
              - generic [ref=e151]:
                - generic [ref=e152]: AI 생성
                - generic [ref=e153]: ◇ AI 추론
            - generic [ref=e156]:
              - paragraph [ref=e157]: 💬 이 매물에 관심이 있으시나요?
              - generic [ref=e158]:
                - button "👍 1-tap 관심" [ref=e159]
                - button "📄 상세 자료 요청" [ref=e160]
          - button "4 📄 등기부 권리관계와 소유 구조는 어떠한가 AI 생성 ◇ AI 추론" [ref=e163]:
            - generic [ref=e164]: "4"
            - generic [ref=e166]:
              - generic [ref=e167]: 📄
              - generic [ref=e168]: 등기부 권리관계와 소유 구조는 어떠한가
            - generic [ref=e169]:
              - generic [ref=e170]: AI 생성
              - generic [ref=e171]: ◇ AI 추론
          - button "5 ⚠️ 리스크는 무엇이고 대응책은 있는가 ✓ 공부 확인 SSoT 자동 ✓ 확인됨" [ref=e176]:
            - generic [ref=e177]: "5"
            - generic [ref=e178]:
              - generic [ref=e179]:
                - generic [ref=e180]: ⚠️
                - generic [ref=e181]: 리스크는 무엇이고 대응책은 있는가
              - generic [ref=e182]: ✓ 공부 확인
            - generic [ref=e184]:
              - generic [ref=e185]: SSoT 자동
              - generic [ref=e186]: ✓ 확인됨
          - button "6 🚀 검토 후 다음 단계는 무엇인가 AI 생성 ◇ AI 추론" [ref=e191]:
            - generic [ref=e192]: "6"
            - generic [ref=e194]:
              - generic [ref=e195]: 🚀
              - generic [ref=e196]: 검토 후 다음 단계는 무엇인가
            - generic [ref=e197]:
              - generic [ref=e198]: AI 생성
              - generic [ref=e199]: ◇ AI 추론
          - button "7 📊 자가 사용 vs 임차 유지, 무엇이 유리한가 AI 생성 ◇ AI 추론" [ref=e204]:
            - generic [ref=e205]: "7"
            - generic [ref=e207]:
              - generic [ref=e208]: 📊
              - generic [ref=e209]: 자가 사용 vs 임차 유지, 무엇이 유리한가
            - generic [ref=e210]:
              - generic [ref=e211]: AI 생성
              - generic [ref=e212]: ◇ AI 추론
          - button "8 📄 실사 체크리스트 및 확인사항 AI 생성 ◇ AI 추론" [ref=e217]:
            - generic [ref=e218]: "8"
            - generic [ref=e220]:
              - generic [ref=e221]: 📄
              - generic [ref=e222]: 실사 체크리스트 및 확인사항
            - generic [ref=e223]:
              - generic [ref=e224]: AI 생성
              - generic [ref=e225]: ◇ AI 추론
          - button "9 🏠 사옥으로 활용하기에 적합한가 AI 생성 ◇ AI 추론" [ref=e230]:
            - generic [ref=e231]: "9"
            - generic [ref=e233]:
              - generic [ref=e234]: 🏠
              - generic [ref=e235]: 사옥으로 활용하기에 적합한가
            - generic [ref=e236]:
              - generic [ref=e237]: AI 생성
              - generic [ref=e238]: ◇ AI 추론
          - generic [ref=e241]:
            - button "10 📄 면책 조항 SSoT 자동" [ref=e243]:
              - generic [ref=e244]: "10"
              - generic [ref=e246]:
                - generic [ref=e247]: 📄
                - generic [ref=e248]: 면책 조항
              - generic [ref=e249]: SSoT 자동
            - button "📄 프라이빗 투자설명서(IM) 신청" [ref=e254]
        - generic [ref=e255]:
          - heading "담당 중개인" [level=2] [ref=e256]
          - generic [ref=e258]:
            - link "E" [ref=e259] [cursor=pointer]:
              - /url: /broker-profile/test-broker-kim
            - generic [ref=e261]:
              - generic [ref=e263]:
                - link "E2E 테스트 브로커" [ref=e264] [cursor=pointer]:
                  - /url: /broker-profile/test-broker-kim
                - text: 크리딜 부동산중개법인
              - generic [ref=e265]: 강남 · 서초 · 꼬마빌딩 · 상가
              - generic [ref=e267]:
                - button "📞 전화" [disabled] [ref=e268]
                - button "💬 카카오" [disabled] [ref=e272]
                - button "📧 이메일" [ref=e276]
        - generic [ref=e281]:
          - generic [ref=e282]:
            - heading "⚡ 이 매물 중개 허브 바로가기" [level=3] [ref=e283]:
              - generic [ref=e284]: ⚡
              - text: 이 매물 중개 허브 바로가기
            - link "딜카드 보기 →" [ref=e285] [cursor=pointer]:
              - /url: /broker/deal-card/2988000b-3ff2-4437-8d07-e798bb10f591
          - generic [ref=e286]:
            - link "🎯 AI 매수자 매칭" [ref=e287] [cursor=pointer]:
              - /url: /broker/matching?buildingId=2988000b-3ff2-4437-8d07-e798bb10f591
            - link "🏢 임차의향서 매칭" [ref=e289] [cursor=pointer]:
              - /url: /broker/tenant-intents?buildingId=2988000b-3ff2-4437-8d07-e798bb10f591
        - link "공적장부 교차검증 Data Verified by CREDEAL 나도 60초 만에 기관급 딜카드·매거진 만들기" [ref=e292] [cursor=pointer]:
          - /url: /powered-by?ctx=im&ref=2988000b-3ff2-4437-8d07-e798bb10f591
          - generic [ref=e299]:
            - generic [ref=e300]:
              - generic [ref=e301]: 공적장부 교차검증
              - generic [ref=e302]: Data Verified by CREDEAL
            - paragraph [ref=e303]: 나도 60초 만에 기관급 딜카드·매거진 만들기
        - generic [ref=e307]:
          - paragraph [ref=e308]: ⚠️ 면책 조항 본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.
          - paragraph [ref=e309]: "보호된 필드: 상세 지번, 건물명, 소유주명"
      - generic [ref=e310]:
        - generic [ref=e311]:
          - generic [ref=e312]: 💼 중개인 전용 모드
          - generic [ref=e315]:
            - link "딜카드" [ref=e316] [cursor=pointer]:
              - /url: /broker/deal-card/2988000b-3ff2-4437-8d07-e798bb10f591
            - link "매칭" [ref=e317] [cursor=pointer]:
              - /url: /broker/matching?buildingId=2988000b-3ff2-4437-8d07-e798bb10f591
            - link "임차의향" [ref=e318] [cursor=pointer]:
              - /url: /broker/tenant-intents?buildingId=2988000b-3ff2-4437-8d07-e798bb10f591
            - button "👁️ 매수자시점" [ref=e319]
            - link "✏️ IM 승인·편집" [ref=e320] [cursor=pointer]:
              - /url: /broker/im-approval/aeb306d6-c89e-4b9c-a65d-98bb69d13ecb
        - generic [ref=e321]:
          - button "카카오톡 공유" [ref=e322]
          - generic [ref=e327]:
            - button "📊 PPTX (기관투자형)" [ref=e328]
            - button "▼" [ref=e330]
          - button "📄 PDF" [ref=e332]
          - button "링크 복사" [ref=e333]: 🔗
  - button "Open Next.js Dev Tools" [ref=e339] [cursor=pointer]
  - alert [ref=e343]
```

# Test source

```ts
  360 |           const scaleInput = page.locator('input[placeholder="예: 1200"], input[placeholder*="1200"]').first();
  361 |           if (await scaleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  362 |             await scaleInput.fill(String(scalePyung));
  363 |             console.log(`  🏗️ 목표 연면적 ${scalePyung}평 입력`);
  364 |           }
  365 |         } else if (posture === 'owner_occupied') {
  366 |           const occInput = page.locator('input[placeholder*="100"]').first();
  367 |           if (await occInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  368 |             await occInput.fill('50');
  369 |           }
  370 |           const floorInput = page.locator('input[placeholder*="2~5"]').first();
  371 |           if (await floorInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  372 |             await floorInput.fill('지상 2~5층');
  373 |           }
  374 |         } else if (posture === 'trading') {
  375 |           const acqInput = page.locator('input[placeholder*="350000"]').first();
  376 |           if (await acqInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  377 |             await acqInput.fill(String(Math.round(askingPriceManwon * 0.85)));
  378 |           }
  379 |         }
  380 | 
  381 |         // ── 렌트롤 입력 (R2+ income/owner_occupied 지원: RentRollImporter 텍스트 탭) ──
  382 |         if (bs.floor_leases && bs.floor_leases.length > 0 && (posture === 'income' || posture === 'owner_occupied')) {
  383 |           try {
  384 |             const textTab = page.locator('button:has-text("텍스트"), button:has-text("📝 텍스트")').first();
  385 |             if (await textTab.isVisible({ timeout: 2000 }).catch(() => false)) {
  386 |               await textTab.click();
  387 |               await page.waitForTimeout(500);
  388 |               const rentRollArea = page.locator('textarea[placeholder*="층"], textarea[placeholder*="B1"], textarea[placeholder*="임차"]').first();
  389 |               if (await rentRollArea.isVisible({ timeout: 2000 }).catch(() => false)) {
  390 |                 const rentRollText = bs.floor_leases.map((l: any) =>
  391 |                   `${l.floor} ${l.tenant_type || ''} ${l.area_pyeong ? l.area_pyeong + '평 ' : ''}보증금${l.deposit_manwon || 0} 월세${l.rent_manwon || 0} ${l.note || ''}`
  392 |                 ).join('\n');
  393 |                 await rentRollArea.fill(rentRollText);
  394 |                 console.log(`  📝 렌트롤 텍스트 입력 (${bs.floor_leases.length}개 층)`);
  395 |                 const aiParseBtn = page.locator('button:has-text("AI 분석")').first();
  396 |                 if (await aiParseBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
  397 |                   await aiParseBtn.click();
  398 |                   console.log('  🔄 AI 분석 클릭 — 렌트롤 파싱 대기...');
  399 |                   await page.waitForSelector('text=분석이 완료되었습니다', { timeout: 30000 }).catch(async () => {
  400 |                     await page.waitForSelector('text=/폼에 금액|파싱 완료|개 호실/', { timeout: 10000 }).catch(() => {
  401 |                       console.log('  ⚠️ AI 분석 완료 텍스트 미감지 — 대기');
  402 |                     });
  403 |                     await page.waitForTimeout(3000);
  404 |                   });
  405 |                   await page.waitForTimeout(1000);
  406 |                   console.log('  ✅ 렌트롤 AI 파싱 완료');
  407 |                 }
  408 |               }
  409 |             }
  410 |           } catch (e) {
  411 |             console.log('  ⚠️ 렌트롤 텍스트 입력 스킵:', (e as Error).message);
  412 |           }
  413 |         }
  414 | 
  415 |         await page.waitForTimeout(1000);
  416 |         await shot(page, screenshotDir, 'form-filled-ready', stepCounter);
  417 | 
  418 |         // IM 생성 실행
  419 |         const generateBtn = page.locator('button:has-text("⚡ IM 생성"), button:has-text("IM 생성")').last();
  420 |         await expect(generateBtn).toBeEnabled({ timeout: 10_000 });
  421 |         await generateBtn.click();
  422 |         console.log('  🚀 Basic IM 생성 시작...');
  423 |         await shot(page, screenshotDir, 'im-generating-started', stepCounter);
  424 | 
  425 |         const completed = await pollImCompletion(page, imWaitMs);
  426 |         expect(completed).toBe(true);
  427 |         await shot(page, screenshotDir, 'im-generation-complete', stepCounter);
  428 | 
  429 |         state.docId = await approveDocument(page, state.buildingId, screenshotDir);
  430 |         expect(state.docId).toBeTruthy();
  431 |       });
  432 | 
  433 |       // ── Phase 3: PPTX 다운로드 + 바이너리 분석 ──
  434 |       test(`Phase 3: PPTX 다운로드 + 바이너리 분석 [${name}]`, async ({ page }) => {
  435 |         console.log(`\n🔷 Phase 3: ${name} PPTX 다운로드 & 바이너리 분석`);
  436 | 
  437 |         const idFile = path.join(screenshotDir, 'building-id.txt');
  438 |         const docFile = path.join(screenshotDir, 'doc-id.txt');
  439 |         if (!fs.existsSync(idFile) || !fs.existsSync(docFile)) { test.skip(); return; }
  440 |         state.buildingId = fs.readFileSync(idFile, 'utf-8').trim();
  441 |         state.docId = fs.readFileSync(docFile, 'utf-8').trim();
  442 | 
  443 |         state.pptxPath = path.join(screenshotDir, `${name}.pptx`);
  444 |         await downloadPptx(page, state.buildingId, state.docId, state.pptxPath);
  445 |         expect(fs.existsSync(state.pptxPath)).toBe(true);
  446 | 
  447 |         const analysis = analyzePptxZip(state.pptxPath);
  448 |         state.slideCount = analysis.slideCount;
  449 |         state.fullPptxText = analysis.fullPptxText;
  450 |         state.slideEntries = analysis.slideEntries;
  451 |         state.mediaEntries = analysis.mediaCount > 0
  452 |           ? require('adm-zip')(state.pptxPath).getEntries().filter((e: any) => e.entryName.startsWith('ppt/media/'))
  453 |           : [];
  454 | 
  455 |         console.log(`  📊 슬라이드: ${state.slideCount}면, 미디어: ${analysis.mediaCount}건`);
  456 |         console.log(`  📝 텍스트 길이: ${state.fullPptxText.length}자`);
  457 | 
  458 |         // 슬라이드 수 범위 검증
  459 |         if (expectedMinSlides != null) {
> 460 |           expect(state.slideCount).toBeGreaterThanOrEqual(expectedMinSlides);
      |                                    ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  461 |         }
  462 |         if (expectedMaxSlides != null) {
  463 |           expect(state.slideCount).toBeLessThanOrEqual(expectedMaxSlides);
  464 |         }
  465 | 
  466 |         // PPTX 텍스트 저장
  467 |         fs.writeFileSync(path.join(screenshotDir, 'pptx-full-text.txt'), state.fullPptxText);
  468 |       });
  469 | 
  470 |       // ── Phase 4: 9종 단언 (4 바이너리 + 5 콘텐츠) ──
  471 |       test(`Phase 4: 9종 품질 단언 [${name}]`, async () => {
  472 |         console.log(`\n🔷 Phase 4: ${name} 9종 품질 단언`);
  473 | 
  474 |         if (state.slideEntries.length === 0) { test.skip(); return; }
  475 | 
  476 |         // 4대 바이너리 단언
  477 |         assertNoPoisonTokens(state.slideEntries);
  478 |         assertNoDummyData(state.fullPptxText);
  479 |         assertNoEvasivePhrases(state.fullPptxText);
  480 |         assertPriceBandBlocked(state.fullPptxText);
  481 | 
  482 |         // 5종 콘텐츠 단언
  483 |         if (state.mediaEntries.length > 0) {
  484 |           assertMapImagePresence(state.mediaEntries);
  485 |         }
  486 |         assertPriceReflected(state.fullPptxText, askingPriceManwon);
  487 |         if (expectedFloors.length > 0) {
  488 |           assertFloorKeywordsPresent(state.fullPptxText, expectedFloors);
  489 |         }
  490 |         assertNoEvasivePhrasesExtended(state.fullPptxText);
  491 |         assertNoHardcodedFallback(state.fullPptxText);
  492 | 
  493 |         // 키워드 검증
  494 |         for (const kw of expectedKeywords) {
  495 |           expect(state.fullPptxText).toContain(kw);
  496 |           console.log(`  ✅ 키워드 "${kw}" 확인`);
  497 |         }
  498 | 
  499 |         console.log(`\n  🎉 ${name}: 9종 단언 전부 통과!`);
  500 |       });
  501 |     },
  502 | 
  503 |     /** 상태 접근 (특수 검증에서 사용) */
  504 |     getState() {
  505 |       return state;
  506 |     },
  507 | 
  508 |     /** 특수 검증용 유틸: PPTX 전체 텍스트 */
  509 |     getPptxText() {
  510 |       return state.fullPptxText;
  511 |     },
  512 | 
  513 |     /** 스크린샷 디렉토리 */
  514 |     getScreenshotDir() {
  515 |       return screenshotDir;
  516 |     },
  517 | 
  518 |     /** 데이터 디렉토리 */
  519 |     getDataDir() {
  520 |       return absDataDir;
  521 |     },
  522 |   };
  523 | }
  524 | 
```