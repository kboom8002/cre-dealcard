# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: seocho-basic-golden.auth.spec.ts >> 서초동 FM빌딩 Basic IM 골든 테스트 (Rule 47 준거) >> Phase 4: PPTX 다운로드 & AdmZip 바이너리 + 콘텐츠 정합성 검증 (Rule 47 준거)
- Location: e2e\seocho-basic-golden.auth.spec.ts:385:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
      - paragraph [ref=e21]: ℹ️ B등급 데이터 — DCF 분석은 A등급 이상에서 제공됩니다. 데이터를 보강해 주세요.
      - generic [ref=e22]:
        - generic [ref=e23]:
          - link "IM 보관함" [ref=e25] [cursor=pointer]:
            - /url: /broker/buildings?tab=im
          - generic [ref=e28]: 📄 IM Lite
          - button "공유" [ref=e30]
        - navigation "IM 섹션 탐색" [ref=e33]:
          - button "섹션 1" [ref=e34]
          - button "섹션 2" [ref=e35]
          - button "섹션 3" [ref=e36]
          - button "섹션 4" [ref=e37]
          - button "섹션 5" [ref=e38]
          - button "섹션 6" [ref=e39]
          - button "섹션 7" [ref=e40]
          - button "섹션 8" [ref=e41]
          - button "섹션 9" [ref=e42]
          - button "섹션 10" [ref=e43]
          - button "섹션 11" [ref=e44]
      - generic [ref=e45]:
        - generic [ref=e46]:
          - generic [ref=e47]:
            - generic [ref=e48]: 상가빌딩
            - generic [ref=e49]: 📍
            - generic [ref=e50]: 📏
          - heading "서초·양재권역 상가빌딩 매각" [level=1] [ref=e51]
          - generic [ref=e52]:
            - generic [ref=e53]: 전문 중개인 검증 완료
            - generic [ref=e56]: 🟡 B등급 — 기본 수익률 산출
          - paragraph
          - paragraph [ref=e57]: "서초·양재권역 소재, 상가빌딩, 매각 희망가 230억 원대. 서초·양재권역 소재 자산입니다. 🚇 교통 및 도로 접근성 - 🚇 지하철 및 대중교통 : 양재역 3호선 ("
          - paragraph [ref=e58]: "AI 생성: 2026. 9. 13. · 크리딜 모바일 IM Lite"
        - generic [ref=e61]:
          - generic [ref=e62]:
            - generic [ref=e63]: 상가빌딩
            - generic [ref=e64]: 📍 서초·양재권역
            - generic [ref=e65]: 💰 200억대
          - generic [ref=e66]:
            - generic [ref=e67]:
              - paragraph [ref=e68]: 매각 희망가
              - paragraph [ref=e69]: 200억대
            - generic [ref=e70]:
              - paragraph [ref=e71]: 실투자금(내 돈)
              - paragraph [ref=e72]: 239.8억
            - generic [ref=e73]:
              - paragraph [ref=e74]: 연 수익률 (총임대료)
              - paragraph [ref=e75]: 0.9%
            - generic [ref=e76]:
              - paragraph [ref=e77]: 자기자본수익률 (ROE)
              - paragraph [ref=e78]: 0.9%
          - generic [ref=e79]:
            - paragraph [ref=e80]: 💡 3대 핵심 투자 포인트
            - list [ref=e81]:
              - listitem [ref=e82]:
                - generic [ref=e83]: "01"
                - generic [ref=e84]: "입지 가치: 서초·양재권역 소재 자산으로 중장기 자산 가치 및 안정적 수요 검토"
              - listitem [ref=e85]:
                - generic [ref=e86]: "02"
                - generic [ref=e87]: "임대 구조: 200억대 수준의 가격대 및 현 임대차 기반의 현금흐름 분석"
              - listitem [ref=e88]:
                - generic [ref=e89]: "03"
                - generic [ref=e90]: "실사 점검: 계약서 및 공부 확인을 통한 권리관계·물리적 상태 정밀 진단"
          - generic [ref=e91]:
            - paragraph [ref=e92]: ⚠️ 핵심 리스크 및 점검 사항
            - paragraph [ref=e93]: 공실률 미확인, 등기·건축물대장 현장 실사 필요. 투자 결정 전 반드시 직접 검증하시기 바랍니다.
          - generic [ref=e94]: 보충 자료 필요
        - generic [ref=e100]:
          - generic [ref=e101] [cursor=pointer]:
            - generic [ref=e103]:
              - generic [ref=e104]:
                - link "카카오맵 길찾기" [ref=e105]:
                  - /url: https://map.kakao.com/link/map/%EC%84%9C%EC%B4%88%C2%B7%EC%96%91%EC%9E%AC%EA%B6%8C%EC%97%AD%20%EC%83%81%EA%B0%80%EB%B9%8C%EB%94%A9%20%EB%A7%A4%EA%B0%81,37.4859418041926,127.029622344577
                - link "N 네이버 지도" [ref=e108]:
                  - /url: https://map.naver.com/p/search/37.4859418041926,127.029622344577
                  - generic [ref=e109]: "N"
                  - text: 네이버 지도
              - generic [ref=e110]: © OpenStreetMap
            - generic [ref=e111]: 위치 지도
            - generic [ref=e112]: 1 / 13
          - generic [ref=e114] [cursor=pointer]:
            - img "건물 외관" [ref=e116]
            - generic [ref=e117]: 건물 외관
            - generic [ref=e118]: 2 / 13
            - paragraph [ref=e121]: 건물 외관
          - generic [ref=e122] [cursor=pointer]:
            - img "실내 공간" [ref=e124]
            - generic [ref=e125]: 실내 공간
            - generic [ref=e126]: 3 / 13
            - paragraph [ref=e129]: 실내 공간
          - generic [ref=e130] [cursor=pointer]:
            - img "실내 공간" [ref=e132]
            - generic [ref=e133]: 실내 공간
            - generic [ref=e134]: 4 / 13
            - paragraph [ref=e137]: 실내 공간
          - generic [ref=e138] [cursor=pointer]:
            - img "실내 공간" [ref=e140]
            - generic [ref=e141]: 실내 공간
            - generic [ref=e142]: 5 / 13
            - paragraph [ref=e145]: 실내 공간
          - generic [ref=e146] [cursor=pointer]:
            - img "실내 공간" [ref=e148]
            - generic [ref=e149]: 실내 공간
            - generic [ref=e150]: 6 / 13
            - paragraph [ref=e153]: 실내 공간
          - generic [ref=e154] [cursor=pointer]:
            - img "실내 공간" [ref=e156]
            - generic [ref=e157]: 실내 공간
            - generic [ref=e158]: 7 / 13
            - paragraph [ref=e161]: 실내 공간
          - generic [ref=e162] [cursor=pointer]:
            - img "실내 공간" [ref=e164]
            - generic [ref=e165]: 실내 공간
            - generic [ref=e166]: 8 / 13
            - paragraph [ref=e169]: 실내 공간
          - generic [ref=e170] [cursor=pointer]:
            - img "실내 공간" [ref=e172]
            - generic [ref=e173]: 실내 공간
            - generic [ref=e174]: 9 / 13
            - paragraph [ref=e177]: 실내 공간
          - generic [ref=e178] [cursor=pointer]:
            - img "실내 공간" [ref=e180]
            - generic [ref=e181]: 실내 공간
            - generic [ref=e182]: 10 / 13
            - paragraph [ref=e185]: 실내 공간
          - generic [ref=e186] [cursor=pointer]:
            - img "실내 공간" [ref=e188]
            - generic [ref=e189]: 실내 공간
            - generic [ref=e190]: 11 / 13
            - paragraph [ref=e193]: 실내 공간
          - generic [ref=e194] [cursor=pointer]:
            - img "실내 공간" [ref=e196]
            - generic [ref=e197]: 실내 공간
            - generic [ref=e198]: 12 / 13
            - paragraph [ref=e201]: 실내 공간
          - generic [ref=e202] [cursor=pointer]:
            - img "실내 공간" [ref=e204]
            - generic [ref=e205]: 실내 공간
            - generic [ref=e206]: 13 / 13
            - paragraph [ref=e209]: 실내 공간
        - generic [ref=e224]:
          - button "1 📍 이 입지, 투자할 만한 곳인가 AI 생성 ◇ AI 추론" [ref=e227]:
            - generic [ref=e228]: "1"
            - generic [ref=e230]:
              - generic [ref=e231]: 📍
              - generic [ref=e232]: 이 입지, 투자할 만한 곳인가
            - generic [ref=e233]:
              - generic [ref=e234]: AI 생성
              - generic [ref=e235]: ◇ AI 추론
          - button "2 📄 등기부 권리관계와 소유 구조는 어떠한가 AI 생성 ◇ AI 추론" [ref=e240]:
            - generic [ref=e241]: "2"
            - generic [ref=e243]:
              - generic [ref=e244]: 📄
              - generic [ref=e245]: 등기부 권리관계와 소유 구조는 어떠한가
            - generic [ref=e246]:
              - generic [ref=e247]: AI 생성
              - generic [ref=e248]: ◇ AI 추론
          - generic [ref=e251]:
            - button "3 📄 토지 현황과 이용 조건은 어떠한가 AI 생성 ◇ AI 추론" [ref=e253]:
              - generic [ref=e254]: "3"
              - generic [ref=e256]:
                - generic [ref=e257]: 📄
                - generic [ref=e258]: 토지 현황과 이용 조건은 어떠한가
              - generic [ref=e259]:
                - generic [ref=e260]: AI 생성
                - generic [ref=e261]: ◇ AI 추론
            - generic [ref=e264]:
              - paragraph [ref=e265]: 💬 이 매물에 관심이 있으시나요?
              - generic [ref=e266]:
                - button "👍 1-tap 관심" [ref=e267]
                - button "📄 상세 자료 요청" [ref=e268]
          - button "4 📋 임대 현황과 공실은 실제로 어떤가 ● 중개인 현장확인 SSoT 자동 ✓ 확인됨" [ref=e271]:
            - generic [ref=e272]: "4"
            - generic [ref=e273]:
              - generic [ref=e274]:
                - generic [ref=e275]: 📋
                - generic [ref=e276]: 임대 현황과 공실은 실제로 어떤가
              - generic [ref=e277]: ● 중개인 현장확인
            - generic [ref=e279]:
              - generic [ref=e280]: SSoT 자동
              - generic [ref=e281]: ✓ 확인됨
          - generic [ref=e284]:
            - button "5 💰 내 돈 넣으면 수익이 나오는 딜인가 ✓ 공부 확인 SSoT 자동 ✓ 확인됨" [ref=e286]:
              - generic [ref=e287]: "5"
              - generic [ref=e288]:
                - generic [ref=e289]:
                  - generic [ref=e290]: 💰
                  - generic [ref=e291]: 내 돈 넣으면 수익이 나오는 딜인가
                - generic [ref=e292]: ✓ 공부 확인
              - generic [ref=e294]:
                - generic [ref=e295]: SSoT 자동
                - generic [ref=e296]: ✓ 확인됨
            - generic [ref=e300]:
              - heading "💰 자금 구조 분석" [level=3] [ref=e301]
              - generic [ref=e302]:
                - img "자금 구조 도넛 차트" [ref=e304]:
                  - generic [ref=e308]: 매각가
                  - generic [ref=e309]: 242.7억
                - generic [ref=e310]:
                  - generic [ref=e311]:
                    - generic [ref=e313]: 자기자본
                    - generic [ref=e314]: 239.8억
                    - generic [ref=e315]: 98.8%
                  - generic [ref=e316]:
                    - generic [ref=e318]: 보증금
                    - generic [ref=e319]: 2.9억
                    - generic [ref=e320]: 1.2%
              - generic [ref=e321]:
                - generic [ref=e322]: 레버리지 수익률 0.9%
                - generic [ref=e323]: NOI ÷ 자기자본
              - paragraph [ref=e324]: ※ AI 추정값. 실제 자금 구조는 대출 조건·보증금 변동에 따라 달라질 수 있습니다.
          - button "6 ⚠️ 리스크는 무엇이고 대응책은 있는가 ✓ 공부 확인 SSoT 자동" [ref=e327]:
            - generic [ref=e328]: "6"
            - generic [ref=e329]:
              - generic [ref=e330]:
                - generic [ref=e331]: ⚠️
                - generic [ref=e332]: 리스크는 무엇이고 대응책은 있는가
              - generic [ref=e333]: ✓ 공부 확인
            - generic [ref=e335]: SSoT 자동
          - button "7 🚀 검토 후 다음 단계는 무엇인가 AI 생성 ◇ AI 추론" [ref=e341]:
            - generic [ref=e342]: "7"
            - generic [ref=e344]:
              - generic [ref=e345]: 🚀
              - generic [ref=e346]: 검토 후 다음 단계는 무엇인가
            - generic [ref=e347]:
              - generic [ref=e348]: AI 생성
              - generic [ref=e349]: ◇ AI 추론
          - button "8 📄 실사 체크리스트 및 확인사항 AI 생성 ◇ AI 추론" [ref=e354]:
            - generic [ref=e355]: "8"
            - generic [ref=e357]:
              - generic [ref=e358]: 📄
              - generic [ref=e359]: 실사 체크리스트 및 확인사항
            - generic [ref=e360]:
              - generic [ref=e361]: AI 생성
              - generic [ref=e362]: ◇ AI 추론
          - button "9 📄 면책조항 및 표기 기준 AI 생성 ◇ AI 추론" [ref=e367]:
            - generic [ref=e368]: "9"
            - generic [ref=e370]:
              - generic [ref=e371]: 📄
              - generic [ref=e372]: 면책조항 및 표기 기준
            - generic [ref=e373]:
              - generic [ref=e374]: AI 생성
              - generic [ref=e375]: ◇ AI 추론
          - button "10 📄 investment_thesis — 생성 시간 초과 SSoT 자동 ! 확인 필요" [ref=e380]:
            - generic [ref=e381]: "10"
            - generic [ref=e383]:
              - generic [ref=e384]: 📄
              - generic [ref=e385]: investment_thesis — 생성 시간 초과
            - generic [ref=e386]:
              - generic [ref=e387]: SSoT 자동
              - generic [ref=e388]: "! 확인 필요"
          - generic [ref=e391]:
            - button "11 📄 면책 조항 SSoT 자동" [ref=e393]:
              - generic [ref=e394]: "11"
              - generic [ref=e396]:
                - generic [ref=e397]: 📄
                - generic [ref=e398]: 면책 조항
              - generic [ref=e399]: SSoT 자동
            - button "📄 프라이빗 투자설명서(IM) 신청" [ref=e404]
        - generic [ref=e405]:
          - heading "담당 중개인" [level=2] [ref=e406]
          - generic [ref=e408]:
            - link "E" [ref=e409] [cursor=pointer]:
              - /url: /broker-profile/e2e-테스트-브로커-204246
            - generic [ref=e411]:
              - generic [ref=e413]:
                - link "E2E 테스트 브로커" [ref=e414] [cursor=pointer]:
                  - /url: /broker-profile/e2e-테스트-브로커-204246
                - text: 크리딜 부동산중개법인
              - generic [ref=e415]:
                - button "📞 전화" [disabled] [ref=e416]
                - button "💬 카카오" [disabled] [ref=e420]
                - button "📧 이메일" [ref=e424]
        - generic [ref=e429]:
          - generic [ref=e430]:
            - heading "⚡ 이 매물 중개 허브 바로가기" [level=3] [ref=e431]:
              - generic [ref=e432]: ⚡
              - text: 이 매물 중개 허브 바로가기
            - link "딜카드 보기 →" [ref=e433] [cursor=pointer]:
              - /url: /broker/deal-card/2988000b-3ff2-4437-8d07-e798bb10f591
          - generic [ref=e434]:
            - link "🎯 AI 매수자 매칭" [ref=e435] [cursor=pointer]:
              - /url: /broker/matching?buildingId=2988000b-3ff2-4437-8d07-e798bb10f591
            - link "🏢 임차의향서 매칭" [ref=e437] [cursor=pointer]:
              - /url: /broker/tenant-intents?buildingId=2988000b-3ff2-4437-8d07-e798bb10f591
        - generic [ref=e439]:
          - paragraph [ref=e440]: ⚠️ 면책 조항 본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.
          - paragraph [ref=e441]: "보호된 필드: 상세 지번, 건물명, 소유주명"
      - generic [ref=e442]:
        - generic [ref=e443]:
          - generic [ref=e444]: 💼 중개인 전용 모드
          - generic [ref=e447]:
            - link "딜카드" [ref=e448] [cursor=pointer]:
              - /url: /broker/deal-card/2988000b-3ff2-4437-8d07-e798bb10f591
            - link "매칭" [ref=e449] [cursor=pointer]:
              - /url: /broker/matching?buildingId=2988000b-3ff2-4437-8d07-e798bb10f591
            - link "임차의향" [ref=e450] [cursor=pointer]:
              - /url: /broker/tenant-intents?buildingId=2988000b-3ff2-4437-8d07-e798bb10f591
            - button "👁️ 매수자시점" [ref=e451]
            - link "✏️ IM 승인·편집" [ref=e452] [cursor=pointer]:
              - /url: /broker/im-approval/4d147604-477f-4e43-8970-81d4c87aec0b
        - generic [ref=e453]:
          - button "카카오톡 공유" [ref=e454]
          - generic [ref=e459]:
            - button "📊 PPTX (기관투자형)" [ref=e460]
            - button "▼" [ref=e462]
          - button "📄 PDF" [ref=e464]
          - button "🔗" [ref=e465]
  - generic [ref=e470] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e471]
    - generic [ref=e475]:
      - button "Open issues overlay" [ref=e476]:
        - generic [ref=e477]:
          - generic [ref=e478]: "1"
          - generic [ref=e479]: "2"
        - generic [ref=e480]:
          - text: Issue
          - generic [ref=e481]: s
      - button "Collapse issues badge" [ref=e482]
  - alert [ref=e485]
```

# Test source

```ts
  391 |     const docId = fs.existsSync(docIdFile) ? fs.readFileSync(docIdFile, 'utf-8').trim() : '';
  392 | 
  393 |     await page.setViewportSize({ width: 1280, height: 800 });
  394 |     const pptxPath = path.join(SCREENSHOT_DIR, 'seocho-basic-im.pptx');
  395 | 
  396 |     // 1. PPTX 다운로드
  397 |     try {
  398 |       const imUrl = docId ? `/im-lite/${buildingId}?doc=${docId}` : `/im-lite/${buildingId}`;
  399 |       await page.goto(imUrl);
  400 |       await page.waitForLoadState('networkidle');
  401 | 
  402 |       const pptxBtn = page.locator('button:has-text("PPTX"), a:has-text("PPTX"), button:has-text("다운로드")').first();
  403 |       await pptxBtn.waitFor({ state: 'visible', timeout: 8000 });
  404 |       const [download] = await Promise.all([
  405 |         page.waitForEvent('download', { timeout: 120_000 }),
  406 |         pptxBtn.click(),
  407 |       ]);
  408 |       await download.saveAs(pptxPath);
  409 |       console.log('  ✅ UI 버튼으로 PPTX 다운로드 완료');
  410 |     } catch {
  411 |       console.log('  ⚠️ UI 다운로드 버튼 미발견 → API 직접 호출 폴백');
  412 |       const pptxApiUrl = `/api/public/im-lite/${buildingId}/pptx?tier=basic`;
  413 |       const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  414 |       await page.goto(pptxApiUrl);
  415 |       const download = await downloadPromise;
  416 |       await download.saveAs(pptxPath);
  417 |       console.log('  ✅ API 직접 호출로 PPTX 다운로드 완료');
  418 |     }
  419 | 
  420 |     // 2. 파일 크기 검증
  421 |     expect(fs.existsSync(pptxPath)).toBe(true);
  422 |     const stats = fs.statSync(pptxPath);
  423 |     console.log(`  📊 PPTX 용량: ${(stats.size / 1024).toFixed(1)} KB`);
  424 |     expect(stats.size).toBeGreaterThan(100_000); // 100KB 이상
  425 | 
  426 |     // 3. AdmZip 바이너리 심층 분석
  427 |     const AdmZip = require('adm-zip');
  428 |     const zip = new AdmZip(pptxPath);
  429 |     const entries = zip.getEntries();
  430 | 
  431 |     const slideEntries = entries.filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
  432 |     console.log(`  📄 총 슬라이드 면수: ${slideEntries.length}면`);
  433 | 
  434 |     // ─── 단언 ①: 면수 (basic-im-guide §2 표준 9섹션, +지적도 optional → 9~10면) ───
  435 |     expect(slideEntries.length).toBeGreaterThanOrEqual(9);
  436 |     expect(slideEntries.length).toBeLessThanOrEqual(10);
  437 |     console.log('  ✅ Basic IM 면수 범위(9~10면) 부합');
  438 | 
  439 |     // ─── OpenXML 전체 텍스트 추출 헬퍼 ───
  440 |     function extractSlideText(slideXml: string): string {
  441 |       return slideXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  442 |     }
  443 |     const allSlideTexts = slideEntries.map((e: any) => extractSlideText(e.getData().toString('utf-8')));
  444 |     const fullPptxText = allSlideTexts.join('\n');
  445 | 
  446 |     // ─── 단언 ②: 결함 토큰 (NaN, undefined, null, [object Object]) 0건 ───
  447 |     for (const slide of slideEntries) {
  448 |       const xml = slide.getData().toString('utf-8');
  449 |       expect(xml).not.toContain('>NaN<');
  450 |       expect(xml).not.toContain('>undefined<');
  451 |       expect(xml).not.toContain('>null<');
  452 |       expect(xml).not.toContain('[object Object]');
  453 |     }
  454 |     console.log('  ✅ OpenXML 결함 토큰 (NaN, undefined, null) 0건 검증 완료');
  455 | 
  456 |     // ─── 단언 ③: 표지(Slide 1) 4요소 — 주소, 매각가, 작성일 ───
  457 |     const slide1Text = allSlideTexts[0] || '';
  458 |     const hasCoverAddress = /서초/.test(slide1Text);
  459 |     const hasCoverPrice = /\d+억/.test(slide1Text) || /매각/.test(slide1Text);
  460 |     const hasCoverDate = /2026\.\d{2}\.\d{2}/.test(slide1Text) || /2026-\d{2}-\d{2}/.test(slide1Text);
  461 |     console.log(`  표지 주소: ${hasCoverAddress ? '✅' : '⚠️'} | 매각가: ${hasCoverPrice ? '✅' : '⚠️'} | 작성일: ${hasCoverDate ? '✅' : '⚠️'}`);
  462 |     // soft-assert (신규 기능이므로 경고만)
  463 |     if (!hasCoverAddress) console.log('    ⚠️ 표지에 주소 키워드("서초") 미발견');
  464 |     if (!hasCoverPrice) console.log('    ⚠️ 표지에 매각가("N억") 미발견');
  465 | 
  466 |     // ─── 단언 ④: 핵심 섹션 키워드 존재 (basic-im-guide §2 표준 9단계) ───
  467 |     const sectionKeywords = [
  468 |       { name: '요약(투자 지표)', pattern: /투자\s*지표|핵심\s*투자|Investment/ },
  469 |       { name: '물건 개요', pattern: /물건\s*개요|건물\s*개요|건축물|Property/ },
  470 |       { name: '입지', pattern: /입지|위치|Location/ },
  471 |       { name: '토지', pattern: /토지|Land/ },
  472 |       { name: '임대차', pattern: /임대차|Rent\s*Roll|렌트롤/ },
  473 |       { name: '수익률', pattern: /수익률|Yield|Cap\s*Rate/ },
  474 |       { name: '사진', pattern: /사진|Gallery|현장/ },
  475 |       { name: '면책/유의', pattern: /면책|유의|문의|Disclaimer|Closing/ },
  476 |     ];
  477 |     let sectionHits = 0;
  478 |     for (const kw of sectionKeywords) {
  479 |       const found = kw.pattern.test(fullPptxText);
  480 |       if (found) sectionHits++;
  481 |       console.log(`  섹션 "${kw.name}": ${found ? '✅' : '❌'}`);
  482 |     }
  483 |     expect(sectionHits).toBeGreaterThanOrEqual(6); // 8개 중 최소 6개 발견
  484 |     console.log(`  ✅ 핵심 섹션 ${sectionHits}/8 키워드 확인 완료`);
  485 | 
  486 |     // ─── 단언 ⑤: 안정화 수익률 카드 존재 (C2 해소 검증) ───
  487 |     const hasStabilized = /Stabilized|안정화/.test(fullPptxText);
  488 |     const hasAnalystAssumption = /분석가정|분석\s*가정/.test(fullPptxText);
  489 |     console.log(`  안정화 수익률: ${hasStabilized ? '✅' : '⚠️'} | 분석가정: ${hasAnalystAssumption ? '✅' : '⚠️'}`);
  490 |     // 서초동 데이터에 3개층 공실이 있으므로 반드시 안정화 카드가 존재해야 함
> 491 |     expect(hasStabilized).toBe(true);
      |                           ^ Error: expect(received).toBe(expected) // Object.is equality
  492 | 
  493 |     // ─── 단언 ⑥: 투자 포인트 회피성 문구 차단 (Rule 37) ───
  494 |     const evasivePhrases = [
  495 |       '본문을 참조', '별도 안내 예정', '추후 확인',
  496 |       '상세.*별첨', '확인 필요',
  497 |     ];
  498 |     const evasiveFound: string[] = [];
  499 |     for (const phrase of evasivePhrases) {
  500 |       if (new RegExp(phrase).test(fullPptxText)) {
  501 |         evasiveFound.push(phrase);
  502 |       }
  503 |     }
  504 |     if (evasiveFound.length > 0) {
  505 |       console.log(`  ⚠️ 회피성 문구 발견: ${evasiveFound.join(', ')}`);
  506 |     } else {
  507 |       console.log('  ✅ 회피성 문구 0건');
  508 |     }
  509 |     // "확인 필요"는 실사 점검 맥락에서 사용 가능하므로 soft-assert
  510 |     const criticalEvasive = evasiveFound.filter(p => !p.includes('확인 필요'));
  511 |     expect(criticalEvasive.length).toBe(0);
  512 | 
  513 |     // ─── 단언 ⑦: 갤러리 슬라이드 1면 완결 (C5 해소 검증) ───
  514 |     const gallerySlides = allSlideTexts.filter(t => /Gallery|현장\s*사진|건물\s*사진/.test(t));
  515 |     console.log(`  📸 갤러리 슬라이드 수: ${gallerySlides.length}면`);
  516 |     expect(gallerySlides.length).toBeLessThanOrEqual(1); // Basic IM: 최대 1면
  517 |     console.log('  ✅ 갤러리 슬라이드 1면 이하 확인');
  518 | 
  519 |     // ─── 미디어 이미지 검증 ───
  520 |     const mediaEntries = entries.filter((e: any) =>
  521 |       /^ppt\/media\/.*\.(jpg|jpeg|png|gif|emf|wmf)$/i.test(e.entryName) && e.header.size > 0
  522 |     );
  523 |     console.log(`  📸 임베딩 미디어 이미지: ${mediaEntries.length}장`);
  524 |     expect(mediaEntries.length).toBeGreaterThanOrEqual(1);
  525 | 
  526 |     await shot(page, 'pptx-verified');
  527 |   });
  528 | 
  529 |   test('Phase 5: LibreOffice 150 DPI PNG 슬라이드 변환 및 시각 검증 (Rule 4)', async () => {
  530 |     console.log('\n🔷 Phase 5: LibreOffice 150 DPI PNG 슬라이드 변환 및 시각 검증');
  531 | 
  532 |     const pptxPath = path.join(SCREENSHOT_DIR, 'seocho-basic-im.pptx');
  533 |     expect(fs.existsSync(pptxPath)).toBe(true);
  534 | 
  535 |     const pptxBuffer = fs.readFileSync(pptxPath);
  536 |     ensureDir(VISUAL_QA_DIR);
  537 | 
  538 |     console.log('  🖼️ LibreOffice + PyMuPDF로 150 DPI PNG 변환 실행...');
  539 |     const captureResult = await convertPptxToSlideImages(pptxBuffer, VISUAL_QA_DIR, 'seocho_basic', 150);
  540 | 
  541 |     console.log(`  ✅ PNG 변환 완료: ${captureResult.slideCount}장 슬라이드 캡처됨`);
  542 |     expect(captureResult.slideCount).toBeGreaterThanOrEqual(9);
  543 | 
  544 |     // 각 슬라이드 이미지 파일 존재 확인
  545 |     for (const imgPath of captureResult.slideImages) {
  546 |       expect(fs.existsSync(imgPath)).toBe(true);
  547 |       const imgStats = fs.statSync(imgPath);
  548 |       expect(imgStats.size).toBeGreaterThan(10_000); // 10KB 이상
  549 |     }
  550 |     console.log('  ✅ 모든 슬라이드 PNG 이미지(150 DPI) 정상 저장 확인');
  551 | 
  552 |     // 변환된 이미지 목록 로깅
  553 |     captureResult.slideImages.forEach((p, idx) => {
  554 |       console.log(`    [Slide ${idx + 1}] ${path.basename(p)} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
  555 |     });
  556 |   });
  557 | });
  558 | 
```