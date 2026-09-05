# 04. 레거시 호환성 및 과거 파일 보존 사양서 (Legacy Preservation Spec)

> **문서 식별자**: `CIM-M0-PRESERVATION-v1.0`  
> **기준일**: 2026-09-03  
> **상태**: 승인 (Approved)  

## 1. 외부 노출 엔드포인트 보존
1. **모바일 IM**: `https://dealcard.credeal.com/im-lite/[id]`
   - 기존 파라미터 및 URL 유지.
   - 요청 수신 시:
     - 신규 파이프라인에서 발행된 물건: `release_records`에서 `channel='mobile'`인 최신 활성 레코드를 읽어 렌더링.
     - 구형 물건: `document_objects.body`를 읽어 기존 UI 컴포넌트로 렌더링.
2. **딜카드 공유**: `https://dealcard.credeal.com/dealcard/[id]`
   - 기존 파라미터 및 URL 영구 유지.

## 2. 과거 발행 파일(PPTX) 다운로드 보존
- 과거 S3/Supabase Storage에 저장된 PPTX 파일(`storage/pptx/[deal_id]/...pptx`)은 삭제하지 않고 영구 보존.
- 신규 PPTX Studio에서 재생성하더라도 과거 버전 파일은 덮어쓰지 않고 새로운 해시 키로 저장.

## 3. 개인정보 취급 및 로그 마스킹
- 과거 로그 및 DB에 잔존하는 소유자 성명, 임차인 상세, 전화번호는 외부 노출 API 호출 시 반드시 마스킹 필터를 통과.
