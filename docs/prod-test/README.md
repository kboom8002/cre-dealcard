# CRE IM 파이프라인 프로덕션 환경 E2E 검증 테스트 세트

본 디렉터리는 CREDEAL 시스템의 IM 파이프라인을 **실제 프로덕션 웹 환경**에서 중개인 사용자가 직접 입력하고 검증할 수 있도록 마련된 **실매물 3건 × 데이터 성숙도 3단계 (총 9개 시나리오) 완전 테스트 패키지**입니다.

---

## 1. 테스트 대상 매물 3종 (핵심 포스처 대표)

| 폴더 | 매물명 | 대표 포스처 | 자산 규모 | 핵심 검증 포인트 |
|---|---|---|---|---|
| `01-dangsan-income/` | **서울 영등포구 당산동 근생** | `income` (수익형) | 115.00억원 | • 1F+2F 통합계약(Group B) 단일 처리<br>• 자가사용 2구획 공실률(0%) 제외<br>• 300㎡ 면적 불일치 C19 블로커<br>• LTV 50% 역레버리지 경고 |
| `02-yeoksam-hq/` | **서울 강남구 역삼동 신축급 사옥** | `owner_occupied` (사옥형) | 120.00억원 | • 사옥 단독 명칭 표기(간판 설치권) 표준화<br>• 잔금 시점 매도법인 명도 확약<br>• 지하 스튜디오 임대 승계 vs 만기 명도<br>• 2021년 토지 거래 대비 원가 밸류에이션 |
| `03-jamwon-dev/` | **서울 서초구 잠원동 신축부지** | `development` (개발형) | 242.27억원 (총투입 332억) | • 투입비 3단 + 취득세(11.14억) 의무 산입<br>• 한시 조례(2028-05-18 만료) 잔여일 카운트다운<br>• 층별 Stacking Plan 및 개발 후 수익률(3.51%)<br>• PF 자기자본비율 연차별 강화 규제 |

---

## 2. 데이터 성숙도 해상도 3단계 (Maturity Levels)

```
Level 1 (Draft / R1)          Level 2 (Standard / R2)         Level 3 (Verified / R3)
[약식 브리핑 메모]             [정형 메모 + 엑셀 렌트롤]         [완전 실사본 + 다면 에셋]
       │                              │                               │
       ▼                              ▼                               ▼
• 결측치 방어 / 폴백 검증       • 표준 렌트롤 자동 파싱          • 16슬라이드 Full IM 완편
• G35/G37 결측 경고 발동       • A/B 등급 판정                  • S등급 판정 / 전 게이트 통과
• Blind Teaser 생성            • IM Lite Draft 자동 생성        • PPTX 다운로드 & AI 시각 검수
```

1. **Level 1 (Draft / Low Resolution - R1)**:
   - **구성**: 거친 메모 (`memo.txt`) + 기본 바텀시트 (`bottom_sheet.json`) + 테스트 가이드 (`test_guide.md`)
   - **목적**: 불완전한 카톡/구두 메모에서 AI 슬롯 추출 무결성, 최소 기본값으로 딜카드 생성, 결측치 경고 게이트 점검.
2. **Level 2 (Standard / Medium Resolution - R2)**:
   - **구성**: 정형 브리핑 (`memo.txt`) + 표준 렌트롤 (`rentroll.xlsx`) + 외관 사진 (`images/01_exterior.jpg`) + 바텀시트 + 가이드
   - **목적**: 웹 스튜디오(`/studio/lease`)에서 Excel 파일 드래그 앤 드롭 업로드, 자동 컬럼 매핑, 금융 레버리지(LTV 40%), IM Lite 생성 검증.
3. **Level 3 (Verified / High Resolution - R3)**:
   - **구성**: 완전 실사 메모 (`memo.txt`) + 상세 렌트롤 (`rentroll.xlsx`) + 4종 고화질 이미지 (`images/`) + 완전 SSoT 바텀시트 + 가이드
   - **목적**: 전 스튜디오 탭 100% 입력, S등급 판정, 16슬라이드 PPTX 다운로드, 모든 발행 게이트(G01~G45) 통과, 비중복 렌더링 무결성 검수.

---

## 3. 프로덕션 웹 UI 테스트 실행 흐름 (E2E Walkthrough)

```
[1단계: 딜카드 생성] ──► [2단계: 스튜디오 데이터 입력] ──► [3단계: IM 검수 및 PPTX 다운로드]
 /broker/deal-card/new     /broker/buildings/[id]/studio     /broker/deal-card/[id]/pptx-editor
  • memo.txt 복사 붙여넣기   • /lease: rentroll.xlsx 업로드    • 모바일 IM 웹 뷰어 검수
  • blind 공개 모드 설정     • /files: 이미지 업로드           • 16면 PPTX 다운로드
  • AI 추출 지표 확인        • /disclosure: 공개 범위 확정     • 게이트 통과 내역 점검
```

### 1단계: 딜카드 생성 (`/broker/deal-card/new`)
1. 프로덕션 웹 서비스에 로그인 후 `/broker/deal-card/new` 로 이동합니다.
2. 테스트할 물건의 해당 레벨 폴더에 있는 `memo.txt` 내용을 전체 복사하여 입력창에 붙여넣습니다.
3. 공개 범위를 `보안형 블라인드 딜카드 (blind)` 로 설정한 뒤 **[딜카드 생성하기]**를 클릭합니다.
4. 로딩 프로그레스(정보 추출 → 권역 분석 → 마스킹 → 블라인드 딜카드 생성)가 완료되면 생성된 딜카드 상세로 이동합니다.

### 2단계: 스튜디오 데이터 고도화 (`/broker/buildings/[id]/studio`)
*(Level 2 및 Level 3 테스트 시)*
1. 딜카드 상세 화면 또는 빌딩 목록에서 해당 건물의 **[빌딩 스튜디오]**로 이동합니다.
2. **임대차 롤 업로드 (`/studio/lease`)**:
   - 상단 드래그 앤 드롭 영역에 `rentroll.xlsx` 파일을 업로드합니다.
   - 컬럼(층, 면적, 업종, 보증금, 월세 등)이 테이블에 정확히 바인딩되는지 확인 후 **[임대차 정보 저장하기]**를 클릭합니다.
3. **증빙 서류 및 이미지 업로드 (`/studio/files`)**:
   - `images/` 폴더 내의 사진 에셋을 업로드합니다 (Level 2는 외관 1장, Level 3는 4장 세트).
4. **공개 범위 설정 (`/studio/disclosure`)**:
   - Level 2: 표준 공개 (Standard) / Level 3: 전체 정밀 공개 (Full Disclosure)

### 3단계: IM 검수 및 PPTX 다운로드
1. **스튜디오 대시보드**에서 `SSoT 완결성 점수` (Level 2: 60점 이상, Level 3: 90점 이상 S등급)를 확인합니다.
2. `[IM Lite 뷰어 열기]` 또는 `[PPTX 에디터 / 다운로드]`를 클릭하여 결과물을 점검합니다.
3. 다운로드된 PPTX 파일이 본문 16면 한도를 준수하는지, 한글 실무 표준 용어가 적용되었는지, 좌우 카드 간 중복 문구가 없는지 확인합니다.

---

## 4. 엄격 품질 규칙 점검표 (Quality Gates & Compliance)

테스트 수행 시 시스템이 다음 5대 규칙을 철저히 준수하는지 점검합니다:

1. **페르소나 격리 원칙 (Rule 1)**:
   - 외부 노출 텍스트(딜카드, 티저, 모바일 IM, PPTX 헤드라인)에 '60대 자산가', '법인 대표' 등 지칭 문구가 일체 없어야 합니다.
2. **한국 상업용 부동산 실무 표준 용어 (Rule 2)**:
   - ❌ 네이밍 라이츠 ➔ ✅ **사옥 단독 명칭 표기(간판 설치권)**
   - ❌ 캡레이트 ➔ ✅ **연 순수익률 (Cap Rate)**
   - ❌ GOP ➔ ✅ **실질 영업이익 (GOP)**
   - ❌ TI / Rent Free ➔ ✅ **인테리어 지원금(TI) / 렌트프리(무상임대)**
3. **PPTX 슬라이드 비중복 렌더링 (Rule 3)**:
   - 좌측 영역(Value Proposition 서사)과 우측 카드(지표 요약) 간 불릿/문구가 중복되지 않아야 합니다.
4. **면수 상한 준수 (Rule 10)**:
   - IM **본문 면수는 정확히 16면** 이내여야 합니다 (부록 제외).
5. **특약 및 결측치 게이트 (Pipeline Rules)**:
   - 당산동: C19 면적 300㎡ 불일치 경고, 4층 만기 경과 경고
   - 역삼동: 사옥 명도 확약 게이트 통과, vsLease 비교
   - 잠원동: 취득세(11.14억) 자동 가산, 한시 규제(2028-05-18) 카운트다운

---

## 5. 패키지 디렉터리 세부 구조

```
docs/prod-test/
├── README.md (본 마스터 가이드)
├── 01-dangsan-income/
│   ├── level-1-draft/
│   │   ├── memo.txt
│   │   ├── bottom_sheet.json
│   │   └── test_guide.md
│   ├── level-2-standard/
│   │   ├── memo.txt
│   │   ├── rentroll.xlsx
│   │   ├── bottom_sheet.json
│   │   ├── images/
│   │   │   └── 01_exterior.jpg
│   │   └── test_guide.md
│   └── level-3-verified/
│       ├── memo.txt
│       ├── rentroll.xlsx
│       ├── bottom_sheet.json
│       ├── images/
│       │   ├── 01_exterior.jpg
│       │   ├── 02_aerial.jpg
│       │   ├── 03_entrance.jpg
│       │   └── 04_lobby.jpg
│       └── test_guide.md
├── 02-yeoksam-hq/
│   ├── level-1-draft/ ...
│   ├── level-2-standard/ ...
│   └── level-3-verified/ ...
└── 03-jamwon-dev/
    ├── level-1-draft/ ...
    ├── level-2-standard/ ...
    └── level-3-verified/ ...
```
