# 현행 게이트에서 목표 하네스로의 이전표

| 현행 | 문제 | 목표 위치 | 조치 |
|---|---|---|---|
| Memo Quality Gate | 한 항목만 탐지해도 딜카드 생성 진행 | P-MEMO-CANDIDATE | 내부 후보 통과로 한정 |
| X01 주소 존재 | 블라인드 공개주소와 내부 식별주소 혼합 | 딜카드 식별·공개 분리 | 내부 자산식별과 표시주소 별도 검사 |
| X02 PNU 유효 | 공부 전 단계 딜카드까지 일괄 차단 | Evidence Core 입구 | 외부 딜카드 필수에서 분리 |
| X05 필지합 | 자료 미수신과 실제 불일치 구분 부족 | Snapshot reconciliation | NOT_RUN/INDETERMINATE/FAIL 분리 |
| CRE semantic gate | 재사용 가치 높음 | Content family | 산출물별 문맥으로 실행 |
| Cross validator | 재사용 가치 높음 | Evidence/Content | 실제 근거참조와 결속 |
| G04 등급 D 차단 | 전체자료 등급으로 문서 전체 차단 | Claim eligibility | 종속 산출항목만 차단 |
| G17/G18 등 결측 기본통과 | 관측 미실행을 PASS로 처리 | Layout/Content | NOT_RUN 반환 |
| G23 렌트롤 전량표기 | 무조건 true | Mobile/PPTX rentroll observer | 원본행·출력행 직접대조 |
| G26 사진 3매 | D55 적응형 사진과 충돌 | Channel layout profile | 사진상태별 적용성 |
| G31~G36 | PPTX에서 가치 높음 | P-PPTX-RELEASE | 실제 렌더 관측기로 이전 |
| G34 겹침 warn | 가독성 실패를 허용 | P-PPTX-RELEASE | 의미 있는 가림은 block |
| G37 타 매물 사진 | 관측값 0 고정 | Photo hash observer | 승인사진 해시 대조 |
| G38~G41 | 수익형에 가치 높음 | Claim/content profile | claimPresence 기반 적용 |
| G48/G49 | 결측값 기본 0 | Evidence profile | Registry 실제 집계 필수 |
| G50 asOf warn | 핵심수치에서 부족 | Claim risk class | RC별 block/warn 차등 |
| G51 계산 재현 | 결측이면 통과 | Calculation observer | 계산객체 없으면 NOT_RUN |
| G52 면수 | false 고정 | PPTX structure observer | 앞면·부록 역할 실제분류 |
| ApprovalGate | 빈 Registry | Approval Service V2 | 저장객체 재수화·해시결속 |
| Funding/Tier/Consent | 품질과 권한 혼합 | Entitlement/Distribution | 문서 하네스 밖으로 분리 |

