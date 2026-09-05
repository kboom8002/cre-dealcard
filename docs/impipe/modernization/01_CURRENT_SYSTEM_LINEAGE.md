# 01. 현행 시스템 계통도 및 데이터 흐름 감사 보고서 (Lineage Audit)

> **문서 식별자**: `CIM-M0-LINEAGE-v1.0`  
> **감사 일자**: 2026-09-03  
> **상태**: 동결 (Baseline Frozen)  

## 1. 현행 엔드포인트 및 모듈 호출 맵

```mermaid
flowchart TD
    Client["브라우저 / 중개인 UI"]
    
    subgraph API_Layer ["src/app/api/broker/im-lite/"]
        ParseMemo["parse-memo/route.ts"]
        GenAsync["generate-async/route.ts"]
        GenRoute["generate/route.ts"]
        GenHandler["generate/handler.ts"]
        SaveSec["[id]/save-sections/route.ts"]
        ApproveRoute["[id]/approve/route.ts"]
        JobStatus["job-status/route.ts"]
    end
    
    subgraph Domain_Layer ["src/domain/building/"]
        ClaimReg["im-core/claim-registry.ts"]
        ApproveGate["im-core/approval-gate.ts"]
        QG_V02["mobile-im/quality-gates-v02.ts"]
        PptxRender["mobile-im/pptx/pptx-renderer.ts"]
        DataBinder["mobile-im/pptx/data-binder.ts"]
        GoldenIM["mobile-im/golden-im-manager.ts"]
    end
    
    subgraph Storage_Layer ["Database & Object Storage"]
        DocObjects[("document_objects (body JSONB)")]
        SSOTLite[("buildings_ssot_lite")]
        StorageFiles[("S3 / Supabase Storage (PPTX)")]
    end

    Client -->|1. 메모 입력| ParseMemo
    ParseMemo -->|추출값 반환| Client
    Client -->|2. IM 생성 요청| GenRoute --> GenHandler
    GenHandler -->|SSOT 조회| SSOTLite
    GenHandler -->|게이트 검사| QG_V02
    GenHandler -->|임시 문서 저장| DocObjects
    Client -->|3. 섹션 수정| SaveSec --> DocObjects
    Client -->|4. 승인 요청| ApproveRoute
    ApproveRoute -->|빈 Registry 생성 후 검사| ApproveGate
    ApproveRoute -->|상태 'published' 변경| DocObjects
    ApproveRoute -->|골든 IM 등록| GoldenIM
    DocObjects -->|5. PPTX 변환 시 body 직접 참조| DataBinder --> PptxRender --> StorageFiles
```

## 2. 현행 데이터 흐름 결함 감사 요약
1. **단일 거대 JSONB 의존**: 모든 중간 상태가 `document_objects.body`에 덮어써지며 단계별 불변 스냅샷이 부재함.
2. **비동기 큐의 멱등성 결여**: `generate-async` 및 `job-status`가 단순 상태 폴링에 의존하며, 작업자 크래시 시 복구(Resumability) 체크포인트가 없음.
3. **승인과 렌더의 결속 부재**: `ApproveRoute`에서 승인된 이후 사용자가 `save-sections`를 호출하면 `published` 상태인 채로 본문이 수정되는 승인 표류(Approval Drift)가 발생함.
