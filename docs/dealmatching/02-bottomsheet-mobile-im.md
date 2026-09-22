# 02. 바텀시트 → 모바일 IM E2E 테스트 가이드

> **범위**: 딜카드 → 바텀시트 데이터 입력 → 데이터 등급 산출 → 모바일 IM 렌더링  
> **UI**: `CreateMobileImButton` → `ImDataBottomSheet` → `useImDataForm`  
> **API**: `GET /api/public/im-lite/[buildingId]`  
> **전제조건**: 딜카드가 생성된 상태 (01번 가이드 완료)

---

## 1. 바텀시트 진입 경로

```
딜카드 페이지 → Sticky CTA "⚡ 기본 IM" 클릭
→ ImDataBottomSheet 오픈
→ 2단계 모드: Basic(기본) / Pro(전문)
```

### 진입 시 자동 prefill 항목
딜카드에서 파싱된 데이터가 바텀시트 필드에 자동 주입됩니다:

| prefill 항목 | 소스 | 바텀시트 필드 |
|:---|:---|:---|
| `prefillAskingPrice` | layers.finance.asking_price_krw | 매각희망가 |
| `prefillTotalDeposit` | layers.lease_summary.total_deposit_krw | 총보증금 |
| `prefillMonthlyRent` | layers.lease_summary.monthly_rent_krw | 월세 |
| `prefillLoanAmount` | layers.finance.loan_amount_krw | 대출금액 |
| `prefillMgmtFee` | layers.finance.mgmt_fee_krw | 관리비 |
| `prefillVacancyPct` | layers.lease_summary.vacancy_pct | 공실률 |
| `initialInvestmentPosture` | layers.investment_posture | 포스처 선택 |
| `existingPhotoUrls` | 기존 사진 URL | 사진 갤러리 |

---

## 2. 포스처별 테스트 시나리오

### TC-BS01: 수익형 (income) — P1 당산동

**입력 데이터**:
| 필드 | 값 | 비고 |
|:---|:---|:---|
| 투자 포스처 | 수익형 (income) | 포스처 셀렉터에서 선택 |
| 매각희망가 | 115억 (11500000 만원) | |
| 총보증금 | 29000 만원 | |
| 월세 | 1946 만원 | |
| 관리비 | 380 만원 | |
| 대출 상태 | 미확인 | |
| 공실률 | 0% (만실) | 만실 버튼 클릭 |
| 브로커 한줄평 | 당산역 도보 5분 만실 수익형 빌딩 | 선택 |
| 자산유형 | 근생빌딩 | 주소 기반 자동 감지 |

**기대 결과**:
- 데이터 등급: **B 이상**
- 바텀시트 하단에 등급 표시 (DataGradeFooter)
- "IM 생성하기" 버튼 활성화

---

### TC-BS02: 개발형 (development) — P4 잠원동

**입력 데이터**:
| 필드 | 값 |
|:---|:---|
| 투자 포스처 | 개발형 (development) |
| 매각희망가 | 24226만원 (약 242억) |
| 총보증금 | 103000 만원 |
| 월세 | 3335 만원 |
| 개발 목표 용도 | 업무시설 (office) |
| 개발 목표 규모 | 1530 평 |
| 예상 분양가/평 | 4500 만원 |
| 예상 건축비/평 | 1200 만원 |
| 시공사 상태 | 미정 (undecided) |
| 명도 책임 | 매도인 (seller) |
| 명도 임차인 수 | 11 |
| 명도 예상 비용 | 5000 만원 |
| 명도 예상 기간 | 6 개월 |
| 인허가 종류 | 건축허가 |
| 인허가 상태 | 진행중 (in_progress) |
| 인허가 예상 기간 | 12 개월 |

**기대 결과**:
- DevelopmentSpecSection 컴포넌트 렌더링
- 명도/인허가 섹션 표시
- 데이터 등급: **A** (R3 수준 데이터 제공)

---

### TC-BS03: 자가사용형 (owner_occupied) — P3 서초동

**입력 데이터**:
| 필드 | 값 |
|:---|:---|
| 투자 포스처 | 자가사용형 (owner_occupied) |
| 매각희망가 | 230억 |
| 공실률 | 37% (직접입력) |
| 예상 사용 인원 | 50명 |
| 1인당 필요면적 | 3.3평 |
| 사용 희망 층수 | 2~5F |
| 현재 임대료 | 1500 만원/월 |

**기대 결과**:
- OwnerOccupiedSpecSection 컴포넌트 렌더링
- 공실률 37% 표시 + 경고 메시지 확인
- 데이터 등급: **A**

---

### TC-BS04: 운영형 (operating) — P6 호텔

**입력 데이터**:
| 필드 | 값 |
|:---|:---|
| 투자 포스처 | 운영형 (operating) |
| 매각희망가 | 300억 |
| 자산유형 | 호텔 (hotel) |
| 객실수 | 94 |
| ADR (평균일일요금) | 95000 |
| 객실가동률 | 78% |
| GOP 마진 | 38% |
| 운영 모델 | 위탁운영 (MC) |
| 운영사명 | 에이치에비뉴 |
| 운영 단위 | 객실 (room) |
| 운영 단위 수 | 94 |
| 영업허가 양도 | 가능 |
| 연매출 | 282200 만원 |
| 연 GOP | 107237 만원 |

**기대 결과**:
- HospitalitySpecSection 렌더링 (호텔 전용)
- OperatingPerfSection 렌더링 (운영 실적)
- 데이터 등급: **B**

---

### TC-BS05: 단기매매형 (trading) — P2 신사동

**입력 데이터**:
| 필드 | 값 |
|:---|:---|
| 투자 포스처 | 단기매매형 (trading) |
| 매각희망가 | 760억 |
| 취득일 | 2023-06 |
| 취득가 | 650억 |
| 보유기간 | 36 개월 |
| 10년 내 전매횟수 | 2 |
| 매도인 사유 | 포트폴리오 리밸런싱 |

**기대 결과**:
- HoldingHistorySection 렌더링
- ManualCompsSection 렌더링 (비교사례)
- 데이터 등급: **A**

---

## 3. 공통 검증 항목

### 3.1 포스처 선택 UI
| 테스트 | 동작 | 검증 |
|:---|:---|:---|
| **TC-BS06** | 포스처 미선택 상태 | W-8: 기본값 없음, 브로커가 반드시 선택 |
| **TC-BS07** | postureProposal 존재 시 | AI 추천 포스처 표시 + 신뢰도 배지 |
| **TC-BS08** | 포스처 변경 | 관련 섹션 동적 표시/숨김 |

### 3.2 사진 업로드
| 테스트 | 동작 | 검증 |
|:---|:---|:---|
| **TC-BS09** | 기존 사진 표시 | prefill된 URL로 이미지 렌더링 |
| **TC-BS10** | 새 사진 업로드 | 최대 12장 제한, 프리뷰 표시 |
| **TC-BS11** | 대표 사진 지정 (★) | 노란 별 아이콘 활성화 |
| **TC-BS12** | 외관 사진 지정 (🏢) | 파란 아이콘 활성화 |
| **TC-BS13** | 사진 분류 변경 | 드롭다운 8종 (외관/로비/실내/주차장/옥상/출입구/기계/도면) |
| **TC-BS14** | 사진 삭제 (×) | 목록에서 제거 확인 |

### 3.3 공실률 입력 (VacancySection)
| 테스트 | 입력 | 검증 |
|:---|:---|:---|
| **TC-BS15** | 만실 (0%) 클릭 | 만실 버튼 하이라이트, 경고 없음 |
| **TC-BS16** | ~10% 클릭 | 버튼 하이라이트 + "⚠️ 공실률 10% 반영" |
| **TC-BS17** | 직접입력 25% | 직접입력 필드 활성화 |
| **TC-BS18** | 만실 선택 + 메모에 "공실" | 💡 충돌 경고 표시 |
| **TC-BS19** | 30% 선택 + 메모에 "만실" | 💡 충돌 경고 표시 |

### 3.4 Pro 모드 전환
| 테스트 | 동작 | 검증 |
|:---|:---|:---|
| **TC-BS20** | "🎯 전문 IM" 탭 클릭 | stage='pro' 전환 |
| **TC-BS21** | Pro 전용 필드 | 취득세, 중개수수료, 법률비용, LTV, 대출이율, 대출기간, 목표IRR |
| **TC-BS22** | 물류 assetType | LogisticsSpecSection 렌더링 (천장고, 도크 등) |

---

## 4. 모바일 IM 조회 API 테스트

### 4.1 정상 조회 (Public)
```bash
curl https://{DOMAIN}/api/public/im-lite/{buildingId}
```

**성공 응답** (200):
```json
{
  "ok": true,
  "data": {
    "buildingId": "uuid",
    "blindName": "당산동 근생빌딩",
    "fullName": "당산동5가 11-47",
    "areaSignal": "영등포·당산",
    "assetType": "근린생활시설",
    "priceBand": "100~200억",
    "sizeSignal": "345평 / 1,141㎡",
    "completenessScore": 72,
    "broker": {
      "displayName": "홍길동",
      "company": "ABC부동산",
      "phone": "010-1234-5678"
    },
    "sections": [
      { "type": "overview", "title": "건물 개요", "content": "..." },
      { "type": "location", "title": "입지 분석", "content": "..." },
      { "type": "lease", "title": "임대차 현황", "content": "..." },
      { "type": "finance", "title": "투자 분석", "content": "..." },
      { "type": "risk", "title": "리스크 요인", "content": "..." },
      { "type": "thesis", "title": "투자 논거", "content": "..." },
      { "type": "next", "title": "다음 단계", "content": "..." }
    ],
    "photos": ["url1", "url2"],
    "coordinates": { "lat": 37.534, "lng": 126.897 }
  }
}
```

### 4.2 에러 케이스
| 테스트 | 입력 | 기대 Status | 기대 응답 |
|:---|:---|:---:|:---|
| **TC-BS23** | 존재하지 않는 buildingId | 404 | `NOT_FOUND` |
| **TC-BS24** | completenessScore < 30 | 403 | `COMPLETENESS_INSUFFICIENT` |
| **TC-BS25** | doc 파라미터로 특정 문서 지정 | 200 | 해당 문서 기반 데이터 |

---

## 5. 데이터 등급 산출 검증

| 등급 | 점수 범위 | 슬라이드 수 | IM 생성 가능 |
|:---:|:---:|:---:|:---:|
| **A** | 85~100 | 9~11면 | ✅ |
| **B** | 60~84 | 7~9면 | ✅ |
| **C** | 30~59 | 7면 (최소) | ✅ (경고 표시) |
| **D** | 0~29 | — | ❌ 차단 (G30) |

**등급별 테스트**:
| 테스트 | 시나리오 | 기대 등급 |
|:---|:---|:---:|
| **TC-BS26** | P1 당산: 렌트롤 8호실 + 사진 21장 | B |
| **TC-BS27** | P4 잠원: 렌트롤 + 개발스펙 + 다필지 | A |
| **TC-BS28** | 주소만 입력 (나머지 공란) | D (차단) |
| **TC-BS29** | 주소 + 매매가만 입력 | C |

---

## 6. 체크리스트

- [ ] 5대 포스처별 바텀시트 전체 필드 입력 및 IM 생성 확인
- [ ] prefill 데이터가 딜카드에서 바텀시트로 정확히 전달되는지 확인
- [ ] 포스처 변경 시 관련 섹션 동적 표시/숨김 확인
- [ ] 사진 업로드/삭제/분류/대표지정 모든 기능 확인
- [ ] 공실률 버튼/직접입력/메모충돌경고 모든 케이스 확인
- [ ] Pro 모드 전용 필드 및 물류센터 스펙 렌더링 확인
- [ ] 모바일 IM API 정상 조회 및 에러 케이스 확인
- [ ] 데이터 등급 A/B/C/D 각각 검증
