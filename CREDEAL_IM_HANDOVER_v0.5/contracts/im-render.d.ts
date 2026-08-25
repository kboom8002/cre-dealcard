/**
 * im-render.d.ts — 렌더 계약 (PPTX · 모바일 · PDF)
 *
 * 렌더러는 **판단하지 않습니다.** 블록 게이팅과 페이지 편성은 이미
 * 레지스트리와 코어가 끝냈습니다. 렌더러는 받은 계획을 그리기만 합니다.
 *
 * 이 분리가 없으면 "모바일에는 나오는데 PPTX 에는 안 나온다" 같은
 * 불일치가 생깁니다 — 두 렌더러가 각자 판단하기 때문입니다.
 */

import type { Grade, Level, Stage } from './im-registry';
import type { IMCore, Maybe, Val } from './im-core';

// ═══════════════════════════════════════════════════════════════════════
// 계획 — 그리기 전에 확정됩니다
// ═══════════════════════════════════════════════════════════════════════

export interface BlockPlan {
  key: string;
  label: string;
  open: boolean;
  /** 잠겼을 때 화면에 그대로 쓰는 문장. */
  lockedMsg?: string;
  /** 이 블록을 열려면 채워야 하는 필드. 바텀시트로 연결됩니다. */
  resolvesWith?: string[];
}

export interface PagePlan {
  key: string;
  title: string;
  builder: string;
  blocks: BlockPlan[];
  photos: ResolvedPhoto[];
  /** placeholder 면 "확인 필요" 안내 면으로 대체합니다. */
  omitted?: 'skip' | 'placeholder';
}

export interface RenderPlan {
  dealId: string;
  preset: string;
  grade: Grade;
  stage: Stage;
  pages: PagePlan[];
  /** 12면 미만이면 워터마크가 붙습니다. */
  watermark?: string;
  /** 발행을 막는 게이트. 하나라도 있으면 렌더는 하되 발행 API 가 4xx 입니다. */
  blockingGates: GateResult[];
  warnings: GateResult[];
}

export interface GateResult {
  code: string;
  level: Level;
  /** 🔴 입력값을 담지 않습니다. 필드명만. */
  field?: string;
  resolvesWith?: string;
}

/**
 * 계획을 세웁니다. **렌더러보다 먼저 돌아야 합니다.**
 * 여기서 PagePlan 이 확정되면 PPTX·모바일·PDF 가 같은 계획을 씁니다.
 */
export declare function plan(
  core: IMCore,
  opts: { preset: string; stage: Stage },
): RenderPlan;

// ═══════════════════════════════════════════════════════════════════════
// 사진
// ═══════════════════════════════════════════════════════════════════════

export interface ResolvedPhoto {
  slot: string;
  /** 마스킹 처리본의 서명 URL. 원본 URL 이 여기 오면 안 됩니다. */
  url: string;
  widthPx: number;
  heightPx: number;
  /** 🔴 이 값이 없으면 G20 이 발행을 막습니다. */
  maskingApproval?: {
    approvedBy: string;
    approvedAt: string;
    regions: number;
    pipelineVersion: string;
  };
  /** min_px 미달이면 true — IMGQ01 경고. */
  belowMinimum: boolean;
}

/**
 * 슬롯에 사진을 배정합니다. 화소 미달·마스킹 미승인은 여기서 걸러집니다.
 * 걸러진 슬롯은 대체 슬롯을 찾고, 없으면 '사진 미제출' 안내를 넣습니다.
 */
export declare function resolvePhotos(
  dealId: string,
  slots: string[],
  stage: Stage,
): ResolvedPhoto[];

// ═══════════════════════════════════════════════════════════════════════
// 렌더러
// ═══════════════════════════════════════════════════════════════════════

export interface RenderResult {
  buffer: Uint8Array;
  pages: number;
  /** 렌더 중 발생한 기하 문제. 오버플로는 여기 담기고 G01 이 봅니다. */
  geometryIssues: GeometryIssue[];
  /** 생성에 걸린 밀리초. 불변조건 15 의 한계는 120초입니다. */
  elapsedMs: number;
}

export interface GeometryIssue {
  page: number;
  slot: string;
  kind: 'overflow' | 'orphan_heading' | 'truncated_label' | 'contrast';
  detail: string;
}

export declare function renderPptx(plan: RenderPlan, core: IMCore): Promise<RenderResult>;
export declare function renderMobile(plan: RenderPlan, core: IMCore): Promise<RenderResult>;

/**
 * PDF 는 PPTX 를 변환하지 않고 **같은 계획에서 직접** 뽑습니다.
 * 변환 경로는 서버 폰트·자간이 달라 줄바꿈이 어긋납니다 (D22-1 결정 D1).
 */
export declare function renderPdf(plan: RenderPlan, core: IMCore): Promise<RenderResult>;

// ═══════════════════════════════════════════════════════════════════════
// 활자
// ═══════════════════════════════════════════════════════════════════════

export interface TypeSpec {
  family: string;
  /** 임베딩 없이 내보내면 수신자 PC 에서 줄바꿈이 무너집니다. */
  embedded: boolean;
  fallbacks: string[];
  sizes: Record<string, number>;
}

/**
 * 문자열이 상자에 들어가는지 미리 잽니다.
 * 안 들어가면 폰트를 줄이고, 그래도 안 되면 다음 면으로 흘리고,
 * 그래도 안 되면 **자르지 않고 빌드를 멈춥니다.**
 * 라벨·표 헤더·단위·출처·제목·수치는 어떤 경우에도 자르지 않습니다.
 */
export declare function fitText(
  text: string,
  boxIn: { w: number; h: number },
  spec: TypeSpec,
): { size: number; lines: string[]; overflow: boolean };

// ═══════════════════════════════════════════════════════════════════════
// 감사 — 재현 가능해야 합니다
// ═══════════════════════════════════════════════════════════════════════

export interface PublishRecord {
  dealId: string;
  publishedAt: string;
  stage: Stage;
  preset: string;
  grade: Grade;
  /** 입력 스냅샷의 해시. 원문을 남기지 않습니다. */
  inputHash: string;
  /** 이때 쓰인 가정값 버전. 나중에 값이 바뀌어도 소급하지 않습니다. */
  assumptionsVersion: number;
  registryVersions: Record<string, number>;
  codeVersion: string;
  photoApprovals: string[];
  gateResults: GateResult[];
}

/**
 * 발행 기록으로 같은 IM 을 다시 만듭니다.
 * 수치가 하나라도 다르면 재현 실패입니다 — 감사에서 이것을 봅니다.
 */
export declare function reproduce(record: PublishRecord): Promise<RenderResult>;
