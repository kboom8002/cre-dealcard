# P2 신사동 590 ICL빌딩 — Basic IM 파이프라인 E2E 골든 테스트 로그

- **실행 일시**: 2026-09-21T01:53:10.274Z
- **매물명**: 신사동 590 ICL빌딩
- **포스처**: 매매차익형 (trading)
- **매각 희망가**: 760억 원
- **생성 슬라이드 면수**: 7면
- **PPTX 파일 용량**: 3097 KB

## 단계별 검증 결과
| 단계 | 검증 항목 | 결과 | 세부 내용 |
|:---|:---|:---:|:---|
| Step 1 | 데이터셋 로드 | **PASS** | 메모 223자, 바텀시트 제원 완료 (매각가 760억) |
| Step 2 | 메모 슬롯 추출 | **PASS** | 주소: 서울 강남구 신사동 590, 매각가: 760억, 대지: 321.2평, 연면적: 1,010.9평 |
| Step 3 | 바텀시트 구조화 | **PASS** | 실사진 5장 확인, 위경도(37.52188, 127.02984), PNU: 1168010700105900000 |
| Step 4 | im-core 품질/재무 | **PASS** | 등급: B (Expected: A), 토지평당가: 2.36억, Tier: verified |
| Step 5 | 모바일 IM 입력 조립 | **PASS** | 총 7면 계약 시퀀스 확정 |
| Step 6 | PPTX 렌더링 | **PASS** | 크기: 3097KB, 면수: 7면 (경고 0건) |
| Step 7 | 바이너리 4대 단언 | **PASS** | Poison Token 0, Mock Leak 0, Evasive 0, Price Band 차단 전체 통과 |
| Step 8 | 슬라이드 이미지 캡처 (trading) | **PASS** | 7개 슬라이드 150 DPI PNG 생성 완료 |
| Step 9 | Income 9면 풀스펙 렌더링/캡처 | **PASS** | 9면 생성 (A24 렌트롤, A23 수익률 포함) |

## 생성된 슬라이드 캡처 파일 목록
- **Slide 1**: `C:\Users\User\cre-dealcard\docs\test\golden-outputs\p2-sinsa-r3\captures\sinsa_basic_slide_01.png` (63 KB)
- **Slide 2**: `C:\Users\User\cre-dealcard\docs\test\golden-outputs\p2-sinsa-r3\captures\sinsa_basic_slide_02.png` (113 KB)
- **Slide 3**: `C:\Users\User\cre-dealcard\docs\test\golden-outputs\p2-sinsa-r3\captures\sinsa_basic_slide_03.png` (799 KB)
- **Slide 4**: `C:\Users\User\cre-dealcard\docs\test\golden-outputs\p2-sinsa-r3\captures\sinsa_basic_slide_04.png` (1396 KB)
- **Slide 5**: `C:\Users\User\cre-dealcard\docs\test\golden-outputs\p2-sinsa-r3\captures\sinsa_basic_slide_05.png` (527 KB)
- **Slide 6**: `C:\Users\User\cre-dealcard\docs\test\golden-outputs\p2-sinsa-r3\captures\sinsa_basic_slide_06.png` (2505 KB)
- **Slide 7**: `C:\Users\User\cre-dealcard\docs\test\golden-outputs\p2-sinsa-r3\captures\sinsa_basic_slide_07.png` (98 KB)
