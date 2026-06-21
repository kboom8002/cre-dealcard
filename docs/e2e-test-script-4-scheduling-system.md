# 🧪 E2E 데모 테스트 스크립트 4/4 — 일정 예약 시스템 (Scheduling & Booking System)

> **범위**: 임장 슬롯 관리 → 예약 플로우 → 대리 예약 → CRM 연동 → 파이프라인 통합 → ICS 내보내기 → 퍼널 연동  
> **대상**: 브로커 사용자 (로그인 상태) + 매수자 사용자 (공개 예약)  
> **환경**: Production (`https://credeal.net`)  
> **전제 조건**: 스크립트 1에서 딜카드 최소 1건, 스크립트 2에서 매수자 의향서 1건, CRM 고객 1건이 생성되어 있을 것

---

## TC-4.1 브로커 일정 대시보드 — 초기 접근 및 렌더링

### TC-4.1.1 스케줄 대시보드 접근 경로 (4가지)

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 더보기(☰) → "📅 일정 관리" 클릭 | `/broker/schedule` 이동 |
| 2 | 코크핏 → "🌅 모닝 정보" 탭 → "오늘의 임장" 버튼 클릭 | `/broker/schedule` 이동 |
| 3 | 딜카드 상세 → "📅 임장 일정 관리" 위젯 → "상세 설정" 링크 클릭 | `/broker/schedule?buildingId={id}` 이동 |
| 4 | 딜카드 생성 완료 후 성공 화면 → "임장 가능 시간 등록하기" CTA 클릭 | `/broker/schedule?buildingId={id}&setup=true` 이동 |

### TC-4.1.2 스케줄 대시보드 — 빈 상태

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker/schedule` 접속 (예약/슬롯 없는 상태) | 헤더: "임장 일정 관리" |
| 2 | 오버뷰 카드 2개 확인 | 좌: "예약 확정/대기 — 0" (amber), 우: "오픈된 슬롯 — 0" (emerald) + "+ 슬롯 추가" 버튼 |
| 3 | "예약 내역" 섹션 확인 | "예약 내역이 없습니다." 안내 메시지 |
| 4 | "오픈된 가용 슬롯" 섹션 확인 | "오픈된 슬롯이 없습니다." + "슬롯 추가하기" 버튼 |

### TC-4.1.3 슬롯 생성 모달 — 자동 오픈 (setup=true)

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker/schedule?buildingId={id}&setup=true` 접속 | 슬롯 생성 모달이 **자동으로 오픈**됨 |
| 2 | "대상 매물" 드롭다운 확인 | `buildingId`에 해당하는 매물이 **사전 선택**되어 있음 |
| 3 | 매물 미선택 시 "슬롯 오픈하기" 버튼 확인 | 버튼 **비활성화** (disabled) |

---

## TC-4.2 임장 슬롯 CRUD

### TC-4.2.1 슬롯 생성 — 정상 플로우

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 오버뷰 카드(emerald)의 "+ 슬롯 추가" 클릭 | 슬롯 생성 모달 오픈 |
| 2 | 모달 헤더 확인 | "새로운 임장 슬롯 오픈" 제목 + X 닫기 버튼 |
| 3 | "대상 매물" 드롭다운에서 매물 선택 | `{area_signal} {asset_type}` 형식으로 매물 목록 표시 |
| 4 | 날짜 입력 (date picker) | `min` 속성: 오늘 날짜 (과거 날짜 선택 불가) |
| 5 | 시간 입력 (time picker) | 시:분 형식 |
| 6 | "슬롯 오픈하기" 버튼 클릭 | 로딩: "오픈 중..." → `availability_slots` INSERT 호출 |
| 7 | 성공 | 모달 닫힘 → 슬롯 목록 자동 갱신 → 오버뷰 카드 숫자 +1 증가 |
| 8 | 실패 시 | `alert("슬롯 생성 중 오류가 발생했습니다.")` |

### TC-4.2.2 슬롯 생성 — 데이터 검증

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 생성된 슬롯 DB 확인 | `availability_slots` 테이블에 레코드 존재 |
| 2 | `slot_date` 필드 확인 | 입력한 날짜와 일치 |
| 3 | `slot_start` 필드 확인 | 입력한 날짜+시간의 ISO 타임스탬프 |
| 4 | `slot_end` 필드 확인 | `slot_start` + 1시간 (자동 계산) |
| 5 | `slot_type` 필드 확인 | `site_tour` |
| 6 | `status` 필드 확인 | `available` |
| 7 | `owner_id` 필드 확인 | 현재 로그인한 브로커의 user.id |
| 8 | `building_id` 필드 확인 | 선택한 매물의 ID |

### TC-4.2.3 슬롯 목록 — 렌더링 검증

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 슬롯 2~3개 추가 생성 | 각 슬롯이 "오픈된 가용 슬롯" 섹션에 표시 |
| 2 | 슬롯 정렬 확인 | `slot_start` 오름차순 (가장 빠른 날짜가 위) |
| 3 | 각 슬롯 카드 정보 확인 | 날짜/시간 (한국어 포맷: "M월 D일 HH:MM") + 매물 area_signal |
| 4 | 슬롯 hover 시 | opacity 0.8 → 1.0 트랜지션 |

---

## TC-4.3 매수자 예약 플로우 (Public BookingFlow)

### TC-4.3.1 예약 페이지 접근

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/buildings/{buildingId}/schedule` 접속 | 예약 페이지 렌더링 |
| 2 | 좌측 영역 확인 | "방문 예약" 제목 + 안내 문구 + AI 추천 슬롯 카드(ScheduleAdvisorCard) |
| 3 | 우측 영역 확인 | BookingFlow 컴포넌트 (CalendarPicker 초기 표시) |

### TC-4.3.2 Step 1 — 날짜 선택 (CalendarPicker)

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 캘린더 로딩 확인 | `availability_slots` DB에서 오늘 이후 슬롯 조회 → 날짜 목록 렌더링 |
| 2 | 예약 가능 날짜가 하이라이트 표시 | 가용 날짜만 선택 가능 (불가 날짜는 비활성화) |
| 3 | 가용 날짜 없을 경우 | "현재 예약 가능한 일정이 없습니다." 안내 |
| 4 | 가용 날짜 클릭 | 선택됨 → 자동으로 Step 2(시간 선택)로 전환 (x→0 애니메이션) |

### TC-4.3.3 Step 2 — 시간 선택 (TimeSlotSelector)

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | "날짜 다시 선택" 뒤로가기 버튼 확인 | 클릭 시 Step 1로 복귀 |
| 2 | 선택한 날짜 헤더 표시 | "2026-06-25" 형식 |
| 3 | 해당 날짜의 슬롯 목록 확인 | 시작~종료 시간 (예: "14:00 ~ 15:00") + 상태 |
| 4 | `available` 슬롯 클릭 | 예약 처리 시작 |
| 5 | `full`(예약완료) 슬롯 확인 | 비활성화 표시 |

### TC-4.3.4 Step 2 → Step 3 — 예약 처리 및 확인

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 슬롯 클릭 후 예약 처리 | Loader2 스피너 + "예약 처리 중..." 표시 |
| 2 | `bookings` 테이블 INSERT 확인 | `slot_id`, `requester_id`, `status: 'hold'` |
| 3 | `availability_slots` UPDATE 확인 | 해당 슬롯 `status: 'booked'`로 변경 |
| 4 | Step 3 (확인 화면) 렌더링 | ✅ CheckCircle2 아이콘(emerald) + "예약이 신청되었습니다" |
| 5 | 안내 문구 확인 | "선택하신 일정이 가승인 되었습니다. 담당자의 최종 확인 후 확정됩니다." |
| 6 | "확인" 버튼 클릭 | Step 1(날짜 선택)으로 리셋 + 슬롯 목록 갱신 |

### TC-4.3.5 예약 실패 방어

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 이미 예약된 슬롯에 동시 예약 시도 | `alert("예약에 실패했습니다.")` |
| 2 | 미로그인 상태에서 예약 시도 | `requester_id: null`로 INSERT (게스트 예약 허용) |

---

## TC-4.4 대리 예약 (Proxy Booking)

### TC-4.4.1 브로커 → 매수자 대리 예약

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | BookingFlow에 `proxyBuyerId` prop 전달 | 대리 예약 모드 활성화 |
| 2 | 슬롯 선택 → 예약 처리 | `bookings` INSERT 시 `booked_by: broker.id` 필드 설정 |
| 3 | `buyer_intent_id` 확인 | `proxyBuyerId` 값이 저장됨 |
| 4 | 예약 완료 화면 | 일반 예약과 동일한 확인 UI |

### TC-4.4.2 RLS 정책 — 대리 예약 허용

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 브로커가 자신의 슬롯에 대해 타인 명의로 booking 생성 | RLS 통과 (INSERT 성공) |
| 2 | 브로커가 타 브로커의 슬롯에 대해 booking 생성 | RLS 통과 (requester 기준 검증) |
| 3 | `booked_by` 필드가 NULL이 아닌 booking 조회 | 대리 예약 건으로 식별 가능 |

---

## TC-4.5 딜카드 상세 — 스케줄 섹션 위젯

### TC-4.5.1 ScheduleSection 렌더링

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker/deal-card/{id}` 접속 | ScheduleSection 위젯이 MatchedBuyersSection 아래에 표시 |
| 2 | 위젯 헤더 확인 | 📅 아이콘 + "임장 일정 관리" + "상세 설정 >" 링크 |
| 3 | 카드 2개 확인 (슬롯 존재 시) | 좌: "예약 대기/확정 — N건" / 우: "오픈된 슬롯 — N개" |
| 4 | "상세 설정" 링크 클릭 | `/broker/schedule?buildingId={id}` 이동 |

### TC-4.5.2 ScheduleSection — 슬롯 없을 때

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 슬롯 미등록 매물의 딜카드 상세 접속 | 오버뷰 카드: "예약 대기/확정 — 0건" / "오픈된 슬롯 — 0개" |
| 2 | CTA 버튼 확인 | "임장 가능 시간 등록하기" 버튼 (amber, 전체 너비) |
| 3 | CTA 클릭 | `/broker/schedule?buildingId={id}&setup=true` 이동 |

### TC-4.5.3 ScheduleSection — 로딩 상태

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 위젯 초기 로딩 | 스켈레톤 UI (h-24, animate-pulse) 표시 |
| 2 | 데이터 로드 완료 | 실제 카운트 데이터로 교체 |

---

## TC-4.6 CRM 고객 상세 — 예약 이력 섹션

### TC-4.6.1 예약 이력 표시

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker/clients/{id}` 접속 (예약 이력 있는 고객) | "📅 임장/미팅 예약" 섹션이 AI 추천 매물 섹션과 연락 이력 사이에 표시 |
| 2 | 섹션 헤더 확인 | "📅 임장/미팅 예약 (N건)" |
| 3 | 각 예약 카드 확인 | 매물 area_signal + "임장" 라벨 + 상태 배지 + 날짜/시간 |

### TC-4.6.2 예약 상태 배지 색상

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `status: confirmed` 예약 확인 | 🟢 emerald 배지 "확정" |
| 2 | `status: hold` 예약 확인 | 🟡 amber 배지 "대기" |
| 3 | `status: cancelled` 또는 `completed` | 🔘 zinc 배지 "취소/완료" |

### TC-4.6.3 예약 이력 — 빈 상태

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 예약 이력이 없는 고객 상세 접속 | "📅 임장/미팅 예약" 섹션 자체가 **비표시** (조건부 렌더링) |

### TC-4.6.4 API 응답 — bookings 데이터 포함

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `GET /api/broker/clients/{id}` 호출 | 응답에 `bookings` 배열 포함 |
| 2 | 각 booking 객체 확인 | `id`, `status`, `created_at`, `slot.slot_start`, `slot.building.area_signal` |
| 3 | booking 조건 확인 | `client.linked_buyer_intent_ids`에 연결된 의향서의 bookings만 반환 |
| 4 | 최대 반환 수 확인 | 10건 제한 (`limit(10)`) |

---

## TC-4.7 파이프라인 전환 — 미팅 스케줄 필수 입력

### TC-4.7.1 im_created → buyer_meeting 전환 시 스케줄 필수

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker/pipeline` → im_created 단계의 딜 선택 | StageTransitionModal 오픈 |
| 2 | `buyer_meeting` 전환 선택 | 필수 필드 목록에 `meeting_schedule` 포함 확인 |
| 3 | `meeting_schedule` 미입력 상태에서 "전환" 클릭 | 유효성 검증 실패: `missing: ['meeting_schedule']` |
| 4 | `meeting_schedule` 입력 (날짜/시간) + 기타 필수 필드 입력 | 유효성 검증 통과 → `POST /api/broker/pipeline/transition` 성공 |

### TC-4.7.2 Bridge State Machine — meeting_schedule 검증

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `BRIDGE_CONTRACTS` 배열에서 `im_created → buyer_meeting` 확인 | `requiredFields: ['buyer_intent_lite_id', 'match_grade', 'meeting_schedule']` |
| 2 | `meeting_schedule` 없이 `validateTransition()` 호출 | `{ valid: false, missing: ['meeting_schedule'] }` 반환 |
| 3 | 모든 필드 포함하여 `validateTransition()` 호출 | `{ valid: true, missing: [] }` 반환 |

---

## TC-4.8 매칭 센터 — 스케줄 CTA 통합

### TC-4.8.1 S/A 등급 매칭 그룹 CTA

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker/matching` → S 또는 A 등급 매칭 그룹 확인 | 그룹 하단에 "바로 임장 잡기" CTA 버튼 표시 |
| 2 | CTA 클릭 | `/broker/schedule` 이동 |
| 3 | B/C 등급 매칭 그룹 확인 | CTA 버튼 **미표시** |

### TC-4.8.2 MatchCard — 일정 조율 액션

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | S 등급 매칭 카드 펼치기 | "일정 조율" 액션 버튼 표시 |
| 2 | "일정 조율" 버튼 클릭 | `/broker/schedule` 이동 |
| 3 | A 등급 카드에서도 동일 확인 | "일정 조율" 버튼 존재 |
| 4 | B/C 등급 카드 확인 | "일정 조율" 버튼 **미표시** |

---

## TC-4.9 코크핏 대시보드 — 오늘의 스케줄 위젯

### TC-4.9.1 Today's Schedule 위젯

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker` (코크핏 대시보드) 접속 | "📅 오늘의 임장 일정" 위젯이 상단에 표시 |
| 2 | 오늘 예약된 임장이 있을 경우 | 각 건별로 시간, 건물명, 매수자 이름 표시 |
| 3 | 위젯 하단 링크 확인 | "전체 일정 보기 →" 클릭 시 `/broker/schedule` 이동 |
| 4 | 오늘 임장이 없을 경우 | "오늘 예정된 임장이 없습니다" 메시지 또는 위젯 비표시 |

### TC-4.9.2 Gate 요청 알림 — 임장 예약 CTA

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 알림 피드에서 `gate_request_reviewed` 타입 알림 확인 | "📅 임장 예약하기" CTA 버튼 표시 |
| 2 | CTA 클릭 | `/buildings/{buildingId}/schedule` 이동 (공개 예약 페이지) |

---

## TC-4.10 유니버설 메모 — schedule_event 라우팅

### TC-4.10.1 메모 AI 라우팅 — schedule_event 유형

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 유니버설 메모 → "다음주 수요일 오후 3시 성수동 빌딩 임장 잡아야 함" 입력 | AI 라우팅 실행 |
| 2 | 라우팅 결과 확인 | `type: 'schedule_event'`, `confidence: 0.8+` |
| 3 | MemoResultSheet 렌더링 | 📅 아이콘 + "일정 등록" 유형 카드 표시 |
| 4 | "일정 관리로 이동" CTA 클릭 | `/broker/schedule` 이동 |

### TC-4.10.2 MemoRouterOutput 스키마 검증

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `MemoRouterOutputSchema.parse()` 호출 (type: 'schedule_event') | 파싱 성공 (zod 검증 통과) |
| 2 | 유효하지 않은 type 입력 | ZodError 발생 |

---

## TC-4.11 행동 퍼널 — 6단계 확장

### TC-4.11.1 퍼널 6단계 확인

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker/funnel` 접속 | 6단계 퍼널 차트 렌더링 |
| 2 | 단계 순서 확인 | ① 생성 → ② 발송 → ③ 열람 → ④ Gate 통과 → ⑤ **임장 예약** → ⑥ 미팅/계약 |
| 3 | "임장 예약" 단계 색상 확인 | `bg-amber-500` (amber 계열) |
| 4 | "임장 예약" 카운트 데이터 소스 확인 | `bookings` 테이블 → 브로커 소유 슬롯 기반 집계 |

### TC-4.11.2 퍼널 전환율 계산

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | Gate 통과 → 임장 예약 전환율 확인 | `(bookingCount / gateCount) * 100`% 표시 |
| 2 | 임장 예약 → 미팅/계약 전환율 확인 | `(meetingCount / bookingCount) * 100`% 표시 |
| 3 | 기간 필터 변경 (7일 / 30일 / 90일 / 전체) | 각 단계 카운트 및 전환율 동적 업데이트 |

---

## TC-4.12 딜카드 생성 후 — 일정 등록 프롬프트

### TC-4.12.1 딜카드 생성 성공 → 스케줄 설정 유도

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `/broker/deal-card/new` → 딜카드 생성 완료 | 결과 페이지 대신 **중간 성공 화면** 표시 |
| 2 | 성공 화면 구성 확인 | ✅ 아이콘 + "딜카드가 생성되었습니다" + 2개 CTA |
| 3 | CTA 1: "딜카드 상세보기" 확인 | 클릭 → `/broker/deal-card/{id}` 이동 |
| 4 | CTA 2: "📅 임장 가능 시간 등록하기" 확인 | 클릭 → `/broker/schedule?buildingId={id}&setup=true` 이동 |

---

## TC-4.13 ICS 캘린더 내보내기

### TC-4.13.1 ICS 파일 다운로드

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `GET /api/broker/schedule/export` 호출 | Content-Type: `text/calendar; charset=utf-8` |
| 2 | Content-Disposition 확인 | `attachment; filename="schedule.ics"` |
| 3 | ICS 파일 구조 확인 | `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID:-//CRE DealCard//Broker Schedule//KO` |

### TC-4.13.2 ICS 이벤트 데이터 검증

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 확정 예약 1건 이상 존재 시 ICS 다운로드 | `BEGIN:VEVENT` ~ `END:VEVENT` 블록 포함 |
| 2 | `UID` 필드 확인 | `{bookingId}@credeal.net` 형식 |
| 3 | `DTSTART` / `DTEND` 확인 | ISO 8601 UTC 형식 (YYYYMMDDTHHMMSSZ) |
| 4 | `SUMMARY` 확인 | `[확정] {area_signal} 임장 - {clientName}` 형식 |
| 5 | `DESCRIPTION` 확인 | `고객: {이름} 연락처: {전화번호}` |

### TC-4.13.3 ICS — 빈 스케줄

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 예약 0건 상태에서 ICS 내보내기 | `BEGIN:VCALENDAR` / `END:VCALENDAR`만 포함 (VEVENT 없음) |

### TC-4.13.4 ICS — 인증 필수

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 미인증 상태로 `GET /api/broker/schedule/export` 호출 | `401 Unauthorized` |

---

## TC-4.14 카카오 알림톡 웹훅 (시뮬레이션)

### TC-4.14.1 예약 Hold 이벤트

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 새 예약 생성 (hold 상태) | `sendKakaoNotification({ event: 'booking_hold', ... })` 호출 가능 |
| 2 | `activity_events` 기록 확인 | `event_type: 'kakao_notification_sent'`, metadata에 payload 포함 |
| 3 | 반환값 확인 | `{ success: true, messageId: 'msg_...' }` |

### TC-4.14.2 예약 확정/취소 이벤트

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `sendKakaoNotification({ event: 'booking_confirmed', ... })` 호출 | 정상 처리 |
| 2 | `sendKakaoNotification({ event: 'booking_cancelled', ... })` 호출 | 정상 처리 |

---

## TC-4.15 Booking Orchestrator — 도메인 로직

### TC-4.15.1 정상 예약 생성

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `createBookingFromMatch({ slotId, requesterId })` 호출 | `{ success: true, bookingId, holdUntil }` |
| 2 | 슬롯 상태 변경 확인 | `available` → `held` |
| 3 | booking 레코드 확인 | `status: 'hold'`, `hold_expires_at` 설정됨 |
| 4 | activity_events 확인 | `event_type: 'booking_hold_created'` 기록 |

### TC-4.15.2 동시 예약 방어 (CAS 패턴)

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 동일 슬롯에 2개 요청 동시 발행 | 1개만 성공, 나머지 `{ success: false, reason: 'concurrent_booking' }` |
| 2 | 이미 booked 상태의 슬롯에 예약 시도 | `{ success: false, reason: 'slot_unavailable' }` |

### TC-4.15.3 도메인별 Hold 타임아웃

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | `domain: undefined` (기본) | holdDuration = 24시간 |
| 2 | `domain: 'wedding'` | holdDuration = 72시간 |
| 3 | `domain: 'consulting'` | holdDuration = 48시간 |
| 4 | `domain: 'counseling'` | holdDuration = 30분 |

### TC-4.15.4 예약 실패 — 롤백

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 슬롯 hold 성공 후 booking INSERT 실패 시 | 슬롯 자동 롤백: `status → available`, `held_by → null` |

---

## TC-4.16 모닝 인텔리전스 — 임장 일정 연동

### TC-4.16.1 "오늘의 임장" 퀵 액션 버튼

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 코크핏 → "🌅 모닝 정보" 탭 접속 | MorningIntelligence 컴포넌트 렌더링 |
| 2 | 상단 액션 버튼 바 확인 | "오늘의 임장" 버튼이 amber 색상으로 가장 왼쪽에 배치 |
| 3 | Calendar 아이콘 확인 | lucide Calendar 아이콘 (w-3.5 h-3.5) 표시 |
| 4 | "오늘의 임장" 클릭 | `/broker/schedule` 이동 |

---

## TC-4.17 크로스 기능 통합 시나리오 (End-to-End)

### TC-4.17.1 전체 예약 라이프사이클

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 딜카드 생성 (`/broker/deal-card/new`) | 딜카드 생성 성공 |
| 2 | 성공 화면 → "임장 가능 시간 등록하기" CTA 클릭 | `/broker/schedule?buildingId={id}&setup=true` |
| 3 | 슬롯 2개 생성 (내일 14:00, 모레 10:00) | 슬롯 목록에 2개 표시 |
| 4 | 매수자가 `/buildings/{id}/schedule` 접속 | BookingFlow 렌더링, 2개 날짜 선택 가능 |
| 5 | 매수자가 내일 14:00 선택 → 예약 | booking 생성 (hold), 슬롯 booked 변경 |
| 6 | 브로커가 `/broker/schedule` 확인 | "예약 확정/대기" 카운트 1로 증가 |
| 7 | 브로커가 파이프라인에서 buyer_meeting 전환 시 | `meeting_schedule` 필수 입력 확인 |
| 8 | 브로커가 `/broker/funnel` 확인 | "임장 예약" 단계에 1건 집계 |
| 9 | 브로커가 고객 CRM 상세 확인 | "📅 임장/미팅 예약" 섹션에 해당 건 표시 |
| 10 | `GET /api/broker/schedule/export` 호출 | ICS 파일에 해당 예약 VEVENT 포함 |

### TC-4.17.2 대리 예약 + CRM 교차 검증

| 단계 | 액션 | 기대 결과 |
|------|------|-----------|
| 1 | 브로커가 특정 매수자 대신 proxy booking 생성 | `bookings.booked_by = broker.id`, `bookings.buyer_intent_id = buyer_intent.id` |
| 2 | 해당 매수자의 CRM 상세 페이지 접속 | "📅 임장/미팅 예약" 섹션에 대리 예약 건 표시 |
| 3 | booking 상태가 confirmed으로 변경 | CRM 상세의 배지가 "확정" (emerald)으로 업데이트 |

---

> [!IMPORTANT]
> **각 TC의 성공 판정 기준**: 해당 단계에서의 HTTP 응답 코드가 2xx이고, UI에 에러 토스트가 발생하지 않으며, 기대 결과에 기술된 데이터가 화면에 정상 렌더링되어야 합니다.

> [!TIP]
> **DB 레벨 검증**: 주요 INSERT/UPDATE 테스트 케이스에서는 Supabase Dashboard 또는 SQL 쿼리로 실제 DB 상태를 교차 확인할 것을 권장합니다.

---

**스크립트 4 체크리스트 요약:**

- [ ] TC-4.1: 스케줄 대시보드 (접근 4경로 / 빈 상태 / 자동 모달)
- [ ] TC-4.2: 임장 슬롯 CRUD (생성 / 데이터 검증 / 목록 렌더링)
- [ ] TC-4.3: 매수자 예약 플로우 (날짜 → 시간 → 확인 / 실패 방어)
- [ ] TC-4.4: 대리 예약 (Proxy Booking / RLS 정책)
- [ ] TC-4.5: 딜카드 ScheduleSection (렌더링 / 빈 상태 / 로딩)
- [ ] TC-4.6: CRM 예약 이력 (표시 / 상태 배지 / API 응답)
- [ ] TC-4.7: 파이프라인 meeting_schedule 필수 (전환 / 스키마)
- [ ] TC-4.8: 매칭 센터 CTA (S/A등급 / MatchCard)
- [ ] TC-4.9: 코크핏 오늘의 스케줄 위젯 + Gate CTA
- [ ] TC-4.10: 메모 schedule_event 라우팅
- [ ] TC-4.11: 퍼널 6단계 확장 (임장 예약 단계 / 전환율)
- [ ] TC-4.12: 딜카드 생성 후 일정 등록 프롬프트
- [ ] TC-4.13: ICS 내보내기 (다운로드 / 이벤트 검증 / 빈 스케줄 / 인증)
- [ ] TC-4.14: 카카오 알림톡 웹훅 (hold / 확정 / 취소)
- [ ] TC-4.15: Booking Orchestrator (정상 / 동시성 / 타임아웃 / 롤백)
- [ ] TC-4.16: 모닝 인텔리전스 임장 연동
- [ ] TC-4.17: 크로스 기능 통합 시나리오 (전체 라이프사이클 / 대리 예약)
