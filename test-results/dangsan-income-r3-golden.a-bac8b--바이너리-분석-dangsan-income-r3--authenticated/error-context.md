# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dangsan-income-r3-golden.auth.spec.ts >> dangsan-income-r3 골든 E2E (income / R3) >> Phase 3: PPTX 다운로드 + 바이너리 분석 [dangsan-income-r3]
- Location: e2e\helpers\golden-test-factory.ts:434:11

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 9
Received:    8
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
          - /url: /api/public/im-lite/073de8e9-dbea-410d-9c5b-f8021ffff5ab/pptx
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
          - button "섹션 12" [ref=e45]
      - generic [ref=e46]:
        - generic [ref=e47]:
          - generic [ref=e48]:
            - generic [ref=e49]: 근생빌딩
            - generic [ref=e50]: 📍
            - generic [ref=e51]: 📏 436.0평
          - heading "당산권역 근생빌딩 매각" [level=1] [ref=e52]
          - generic [ref=e53]:
            - generic [ref=e54]: 전문 중개인 검증 완료
            - generic [ref=e57]: 🟡 B등급 — 기본 수익률 산출
          - paragraph
          - paragraph [ref=e58]: 당산권역 소재, 근생빌딩, 매각 희망가 115억 원대
          - paragraph [ref=e59]: "AI 생성: 2026. 9. 25. · 크리딜 모바일 IM Lite"
        - generic [ref=e62]:
          - generic [ref=e63]:
            - generic [ref=e64]: 근생빌딩
            - generic [ref=e65]:
              - generic [ref=e66]: 📍
              - text: 당산권역
            - generic [ref=e67]:
              - generic [ref=e68]: 💰
              - text: 115억 원
          - generic [ref=e69]:
            - generic [ref=e70]:
              - paragraph [ref=e71]: 매각 희망가
              - paragraph [ref=e72]: 115억 원
            - generic [ref=e73]:
              - paragraph [ref=e74]: 실투자금(내 돈)
              - paragraph [ref=e75]: 118.4억
            - generic [ref=e76]:
              - paragraph [ref=e77]: 연 수익률 (총임대료)
              - paragraph [ref=e78]: 1.6%
            - generic [ref=e79]:
              - paragraph [ref=e80]: 자기자본수익률 (ROE)
              - paragraph [ref=e81]: 1.6%
          - generic [ref=e82]:
            - paragraph [ref=e83]: 💡 3대 핵심 투자 포인트
            - list [ref=e84]:
              - listitem [ref=e85]:
                - generic [ref=e86]: "01"
                - generic [ref=e87]: "입지 가치: 당산권역 소재 자산으로 중장기 자산 가치 및 안정적 수요 검토"
              - listitem [ref=e88]:
                - generic [ref=e89]: "02"
                - generic [ref=e90]: "임대 구조: 110억대 수준의 가격대 및 현 임대차 기반의 현금흐름 분석"
              - listitem [ref=e91]:
                - generic [ref=e92]: "03"
                - generic [ref=e93]: "실사 점검: 계약서 및 공부 확인을 통한 권리관계·물리적 상태 정밀 진단"
          - generic [ref=e94]:
            - paragraph [ref=e95]: ⚠️ 핵심 리스크 및 점검 사항
            - paragraph [ref=e96]: 공실률 미확인, 등기·건축물대장 현장 실사 필요. 투자 결정 전 반드시 직접 검증하시기 바랍니다.
          - generic [ref=e98]:
            - progressbar [ref=e99]
            - generic [ref=e101]: 보충 자료 필요
        - generic [ref=e104] [cursor=pointer]:
          - generic [ref=e106]:
            - generic:
              - img "당산권역 근생빌딩 매각 위치 지도"
            - generic [ref=e107]:
              - link "카카오맵 길찾기" [ref=e108]:
                - /url: https://map.kakao.com/link/map/%EB%8B%B9%EC%82%B0%EA%B6%8C%EC%97%AD%20%EA%B7%BC%EC%83%9D%EB%B9%8C%EB%94%A9%20%EB%A7%A4%EA%B0%81,37.5305639270671,126.904360817521
              - link "N 네이버 지도" [ref=e111]:
                - /url: https://map.naver.com/p/search/37.5305639270671,126.904360817521
                - generic [ref=e112]: "N"
                - text: 네이버 지도
          - generic [ref=e113]: 위치 지도
          - generic [ref=e114]: 1 / 1
          - generic [ref=e116]: +1장 더보기
        - generic [ref=e118]:
          - button "1 🏢 이 건물, 어떤 자산인가 ✓ 공부 확인 SSoT 자동 ✓ 확인됨" [ref=e121]:
            - generic [ref=e122]: "1"
            - generic [ref=e123]:
              - generic [ref=e124]:
                - generic [ref=e125]: 🏢
                - generic [ref=e126]: 이 건물, 어떤 자산인가
              - generic [ref=e127]: ✓ 공부 확인
            - generic [ref=e129]:
              - generic [ref=e130]: SSoT 자동
              - generic [ref=e131]: ✓ 확인됨
          - button "2 📍 이 입지, 투자할 만한 곳인가 AI 생성 ◇ AI 추론" [ref=e136]:
            - generic [ref=e137]: "2"
            - generic [ref=e139]:
              - generic [ref=e140]: 📍
              - generic [ref=e141]: 이 입지, 투자할 만한 곳인가
            - generic [ref=e142]:
              - generic [ref=e143]: AI 생성
              - generic [ref=e144]: ◇ AI 추론
          - generic [ref=e147]:
            - button "3 📄 등기부 권리관계와 소유 구조는 어떠한가 AI 생성 ◇ AI 추론" [ref=e149]:
              - generic [ref=e150]: "3"
              - generic [ref=e152]:
                - generic [ref=e153]: 📄
                - generic [ref=e154]: 등기부 권리관계와 소유 구조는 어떠한가
              - generic [ref=e155]:
                - generic [ref=e156]: AI 생성
                - generic [ref=e157]: ◇ AI 추론
            - generic [ref=e160]:
              - paragraph [ref=e161]: 💬 이 매물에 관심이 있으시나요?
              - generic [ref=e162]:
                - button "👍 1-tap 관심" [ref=e163]
                - button "📄 상세 자료 요청" [ref=e164]
          - button "4 📄 토지 현황과 이용 조건은 어떠한가 AI 생성 ◇ AI 추론" [ref=e167]:
            - generic [ref=e168]: "4"
            - generic [ref=e170]:
              - generic [ref=e171]: 📄
              - generic [ref=e172]: 토지 현황과 이용 조건은 어떠한가
            - generic [ref=e173]:
              - generic [ref=e174]: AI 생성
              - generic [ref=e175]: ◇ AI 추론
          - generic [ref=e178]:
            - button "5 📋 임대 현황과 공실은 실제로 어떤가 ● 중개인 현장확인 SSoT 자동" [ref=e180]:
              - generic [ref=e181]: "5"
              - generic [ref=e182]:
                - generic [ref=e183]:
                  - generic [ref=e184]: 📋
                  - generic [ref=e185]: 임대 현황과 공실은 실제로 어떤가
                - generic [ref=e186]: ● 중개인 현장확인
              - generic [ref=e188]: SSoT 자동
            - generic [ref=e192]:
              - generic [ref=e193]:
                - generic [ref=e194]:
                  - generic [ref=e195]:
                    - generic [ref=e196]: ARCHITECTURAL STACKING
                    - heading "당산권역 근생빌딩 매각 건축 입면 셋백 스태킹 플랜" [level=3] [ref=e197]
                  - paragraph [ref=e198]: 상층부 테라스 후퇴(Setback) 및 지하층 굴착 심도 단면 실루엣 실측 렌트롤
                - generic [ref=e199]:
                  - button "전체 (8)" [ref=e200]
                  - button "앵커 테넌트" [ref=e201]
                  - button "일반 업무" [ref=e203]
                  - button "리테일/근생" [ref=e205]
                  - button "주차/기계" [ref=e207]
                  - button "공실" [ref=e209]
              - generic [ref=e211]:
                - generic [ref=e212]:
                  - paragraph [ref=e213]: 연면적
                  - paragraph [ref=e214]: 436 평
                  - paragraph [ref=e215]: 건축물대장 기준
                - generic [ref=e216]:
                  - paragraph [ref=e217]: 전용률
                  - paragraph [ref=e218]: 55 %
                  - paragraph [ref=e219]: 지상 78.4% 수준
                - generic [ref=e220]:
                  - paragraph [ref=e221]: WALE (잔여 임대)
                  - paragraph [ref=e222]: 2.1 년
                  - paragraph [ref=e223]: 앵커사 만기 2026년
                - generic [ref=e224]:
                  - paragraph [ref=e225]: 공실률
                  - paragraph [ref=e226]: 0 %
                  - paragraph [ref=e227]: 전층 만실 운용
              - generic [ref=e228]:
                - generic [ref=e229]:
                  - generic [ref=e230]:
                    - generic [ref=e231]:
                      - generic [ref=e232]: 🏢
                      - text: 건축 입면 단면 실루엣
                    - generic [ref=e233]: "* 층을 탭/클릭하면 상세 제원이 동기화됩니다"
                  - generic [ref=e234]:
                    - button "1F 약국" [ref=e236]:
                      - generic [ref=e237]: 1F
                      - generic [ref=e238]: 약국
                    - button "1F 내과" [ref=e240]:
                      - generic [ref=e241]: 1F
                      - generic [ref=e242]: 내과
                    - button "2F 🚫 공실" [ref=e244]:
                      - generic [ref=e245]: 2F
                      - generic [ref=e246]: 🚫 공실
                    - button "3F 헬스장" [ref=e248]:
                      - generic [ref=e249]: 3F
                      - generic [ref=e250]: 헬스장
                    - button "4F 와인매장" [ref=e252]:
                      - generic [ref=e253]: 4F
                      - generic [ref=e254]: 와인매장
                    - button "4F 🚫 공실" [ref=e256]:
                      - generic [ref=e257]: 4F
                      - generic [ref=e258]: 🚫 공실
                    - button "5F 내과" [ref=e260]:
                      - generic [ref=e261]: 5F
                      - generic [ref=e262]: 내과
                    - generic [ref=e263]: 지표면 (GL ±0.0m)
                    - generic [ref=e268]:
                      - generic [ref=e269]: "-3.5m"
                      - button "B1 🚫 공실" [ref=e270]:
                        - generic [ref=e271]: B1
                        - generic [ref=e272]: 🚫 공실
                - generic [ref=e273]:
                  - generic [ref=e274]:
                    - generic [ref=e275]:
                      - generic [ref=e276]: 🔍 층별 상세 인스펙터
                      - generic [ref=e277]: 층을 선택하세요
                    - generic [ref=e278]: 좌측 단면 실루엣에서 층을 클릭하거나 아래 표에서 행을 선택하세요.
                  - generic [ref=e279]:
                    - generic [ref=e280]:
                      - generic [ref=e281]: 📊 층별 임대차 매트릭스
                      - generic [ref=e282]: 8개 층
                    - table [ref=e284]:
                      - rowgroup [ref=e285]:
                        - row [ref=e286]:
                          - columnheader "층" [ref=e287]
                          - columnheader "주요 입주사" [ref=e288]
                          - columnheader "전용(평)" [ref=e289]
                          - columnheader "만기" [ref=e290]
                      - rowgroup [ref=e291]:
                        - row [ref=e292] [cursor=pointer]:
                          - cell "B1" [ref=e293]
                          - cell "🚫 공실" [ref=e294]
                          - cell "96.0" [ref=e295]
                          - cell "-" [ref=e296]
                        - row [ref=e297] [cursor=pointer]:
                          - cell "1F" [ref=e298]
                          - cell "약국" [ref=e299]
                          - cell "24.0" [ref=e300]
                          - cell "-" [ref=e301]
                        - row [ref=e302] [cursor=pointer]:
                          - cell "1F" [ref=e303]
                          - cell "내과" [ref=e304]
                          - cell "32.0" [ref=e305]
                          - cell "-" [ref=e306]
                        - row [ref=e307] [cursor=pointer]:
                          - cell "2F" [ref=e308]
                          - cell "🚫 공실" [ref=e309]
                          - cell "76.0" [ref=e310]
                          - cell "-" [ref=e311]
                        - row [ref=e312] [cursor=pointer]:
                          - cell "3F" [ref=e313]
                          - cell "헬스장" [ref=e314]
                          - cell "76.0" [ref=e315]
                          - cell "-" [ref=e316]
                        - row [ref=e317] [cursor=pointer]:
                          - cell "4F" [ref=e318]
                          - cell "와인매장" [ref=e319]
                          - cell "51.0" [ref=e320]
                          - cell "-" [ref=e321]
                        - row [ref=e322] [cursor=pointer]:
                          - cell "4F" [ref=e323]
                          - cell "🚫 공실" [ref=e324]
                          - cell "25.0" [ref=e325]
                          - cell "-" [ref=e326]
                        - row [ref=e327] [cursor=pointer]:
                          - cell "5F" [ref=e328]
                          - cell "내과" [ref=e329]
                          - cell "56.0" [ref=e330]
                          - cell "-" [ref=e331]
              - generic [ref=e332]:
                - generic [ref=e333]: ※
                - generic [ref=e334]: 본 스태킹 플랜은 건축물대장 및 실측 임대차계약서 기준이며, 10F~11F는 일조권 및 도로사선 후퇴(Setback)에 따른 옥외 테라스 구조가 적용되어 있습니다.
          - generic [ref=e335]:
            - button "6 💰 내 돈 넣으면 수익이 나오는 딜인가 ✓ 공부 확인 SSoT 자동 ✓ 확인됨" [ref=e337]:
              - generic [ref=e338]: "6"
              - generic [ref=e339]:
                - generic [ref=e340]:
                  - generic [ref=e341]: 💰
                  - generic [ref=e342]: 내 돈 넣으면 수익이 나오는 딜인가
                - generic [ref=e343]: ✓ 공부 확인
              - generic [ref=e345]:
                - generic [ref=e346]: SSoT 자동
                - generic [ref=e347]: ✓ 확인됨
            - generic [ref=e351]:
              - heading "💰 자금 구조 분석" [level=3] [ref=e352]
              - generic [ref=e353]:
                - img "자금 구조 도넛 차트" [ref=e355]:
                  - generic [ref=e359]: 매각가
                  - generic [ref=e360]: 121.3억
                - generic [ref=e361]:
                  - generic [ref=e362]:
                    - generic [ref=e364]: 자기자본
                    - generic [ref=e365]: 118.4억
                    - generic [ref=e366]: 97.6%
                  - generic [ref=e367]:
                    - generic [ref=e369]: 보증금
                    - generic [ref=e370]: 2.9억
                    - generic [ref=e371]: 2.4%
              - generic [ref=e372]:
                - generic [ref=e373]: 레버리지 수익률 1.6%
                - generic [ref=e374]: NOI ÷ 자기자본
              - paragraph [ref=e375]: ※ AI 추정값. 실제 자금 구조는 대출 조건·보증금 변동에 따라 달라질 수 있습니다.
          - button "7 ⚠️ 리스크는 무엇이고 대응책은 있는가 ✓ 공부 확인 SSoT 자동" [ref=e378]:
            - generic [ref=e379]: "7"
            - generic [ref=e380]:
              - generic [ref=e381]:
                - generic [ref=e382]: ⚠️
                - generic [ref=e383]: 리스크는 무엇이고 대응책은 있는가
              - generic [ref=e384]: ✓ 공부 확인
            - generic [ref=e386]: SSoT 자동
          - button "8 🚀 검토 후 다음 단계는 무엇인가 AI 생성 ◇ AI 추론" [ref=e392]:
            - generic [ref=e393]: "8"
            - generic [ref=e395]:
              - generic [ref=e396]: 🚀
              - generic [ref=e397]: 검토 후 다음 단계는 무엇인가
            - generic [ref=e398]:
              - generic [ref=e399]: AI 생성
              - generic [ref=e400]: ◇ AI 추론
          - button "9 📄 실사 체크리스트 및 확인사항 AI 생성 ◇ AI 추론" [ref=e405]:
            - generic [ref=e406]: "9"
            - generic [ref=e408]:
              - generic [ref=e409]: 📄
              - generic [ref=e410]: 실사 체크리스트 및 확인사항
            - generic [ref=e411]:
              - generic [ref=e412]: AI 생성
              - generic [ref=e413]: ◇ AI 추론
          - button "10 📄 면책조항 및 표기 기준 AI 생성 ◇ AI 추론" [ref=e418]:
            - generic [ref=e419]: "10"
            - generic [ref=e421]:
              - generic [ref=e422]: 📄
              - generic [ref=e423]: 면책조항 및 표기 기준
            - generic [ref=e424]:
              - generic [ref=e425]: AI 생성
              - generic [ref=e426]: ◇ AI 추론
          - button "11 📄 investment_thesis — 생성 시간 초과 SSoT 자동 ! 데이터 수집 중" [ref=e431]:
            - generic [ref=e432]: "11"
            - generic [ref=e434]:
              - generic [ref=e435]: 📄
              - generic [ref=e436]: investment_thesis — 생성 시간 초과
            - generic [ref=e437]:
              - generic [ref=e438]: SSoT 자동
              - generic [ref=e439]: "! 데이터 수집 중"
          - generic [ref=e442]:
            - button "12 📄 면책 조항 SSoT 자동" [ref=e444]:
              - generic [ref=e445]: "12"
              - generic [ref=e447]:
                - generic [ref=e448]: 📄
                - generic [ref=e449]: 면책 조항
              - generic [ref=e450]: SSoT 자동
            - button "📄 프라이빗 투자설명서(IM) 신청" [ref=e455]
        - generic [ref=e456]:
          - heading "담당 중개인" [level=2] [ref=e457]
          - generic [ref=e459]:
            - link "E" [ref=e460] [cursor=pointer]:
              - /url: /broker-profile/test-broker-kim
            - generic [ref=e462]:
              - generic [ref=e464]:
                - link "E2E 테스트 브로커" [ref=e465] [cursor=pointer]:
                  - /url: /broker-profile/test-broker-kim
                - text: 크리딜 부동산중개법인
              - generic [ref=e466]: 강남 · 서초 · 꼬마빌딩 · 상가
              - generic [ref=e468]:
                - button "📞 전화" [disabled] [ref=e469]
                - button "💬 카카오" [disabled] [ref=e473]
                - button "📧 이메일" [ref=e477]
        - generic [ref=e482]:
          - generic [ref=e483]:
            - heading "⚡ 이 매물 중개 허브 바로가기" [level=3] [ref=e484]:
              - generic [ref=e485]: ⚡
              - text: 이 매물 중개 허브 바로가기
            - link "딜카드 보기 →" [ref=e486] [cursor=pointer]:
              - /url: /broker/deal-card/073de8e9-dbea-410d-9c5b-f8021ffff5ab
          - generic [ref=e487]:
            - link "🎯 AI 매수자 매칭" [ref=e488] [cursor=pointer]:
              - /url: /broker/matching?buildingId=073de8e9-dbea-410d-9c5b-f8021ffff5ab
            - link "🏢 임차의향서 매칭" [ref=e490] [cursor=pointer]:
              - /url: /broker/tenant-intents?buildingId=073de8e9-dbea-410d-9c5b-f8021ffff5ab
        - link "공적장부 교차검증 Data Verified by CREDEAL 나도 60초 만에 기관급 딜카드·매거진 만들기" [ref=e493] [cursor=pointer]:
          - /url: /powered-by?ctx=im&ref=073de8e9-dbea-410d-9c5b-f8021ffff5ab
          - generic [ref=e500]:
            - generic [ref=e501]:
              - generic [ref=e502]: 공적장부 교차검증
              - generic [ref=e503]: Data Verified by CREDEAL
            - paragraph [ref=e504]: 나도 60초 만에 기관급 딜카드·매거진 만들기
        - generic [ref=e508]:
          - paragraph [ref=e509]: ⚠️ 면책 조항 본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.
          - paragraph [ref=e510]: "보호된 필드: 상세 지번, 건물명, 소유주명"
      - generic [ref=e511]:
        - generic [ref=e512]:
          - generic [ref=e513]: 💼 중개인 전용 모드
          - generic [ref=e516]:
            - link "딜카드" [ref=e517] [cursor=pointer]:
              - /url: /broker/deal-card/073de8e9-dbea-410d-9c5b-f8021ffff5ab
            - link "매칭" [ref=e518] [cursor=pointer]:
              - /url: /broker/matching?buildingId=073de8e9-dbea-410d-9c5b-f8021ffff5ab
            - link "임차의향" [ref=e519] [cursor=pointer]:
              - /url: /broker/tenant-intents?buildingId=073de8e9-dbea-410d-9c5b-f8021ffff5ab
            - button "👁️ 매수자시점" [ref=e520]
            - link "✏️ IM 승인·편집" [ref=e521] [cursor=pointer]:
              - /url: /broker/im-approval/e7169082-e7af-4454-89fa-01ee3a58a88e
        - generic [ref=e522]:
          - button "카카오톡 공유" [ref=e523]
          - generic [ref=e528]:
            - button "📊 PPTX (기관투자형)" [ref=e529]
            - button "▼" [ref=e531]
          - button "📄 PDF" [ref=e533]
          - button "링크 복사" [ref=e534]: 🔗
  - generic [ref=e539] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e540]
    - generic [ref=e544]:
      - button "Open issues overlay" [ref=e545]:
        - generic [ref=e546]:
          - generic [ref=e547]: "5"
          - generic [ref=e548]: "6"
        - generic [ref=e549]:
          - text: Issue
          - generic [ref=e550]: s
      - button "Collapse issues badge" [ref=e551]
  - alert [ref=e554]
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