/**
 * @file src/lib/supabase/jsonb-diet.ts
 * @description Supabase PostgreSQL Disk IO Budget 보호를 위한 JSONB 페이로드 다이어트 유틸리티.
 *
 * `document_objects.body` 컬럼에 수백 KB ~ 수 MB의 인라인 Base64 이미지(`data:image/...;base64,...` 또는 `image/png;base64,...`)가
 * 적재되면 매 조회·인라인 편집 시 PostgreSQL TOAST 테이블 Read/Write IO가 급증하여 Disk IO Budget을 고갈시킵니다.
 * 외부 Storage URL(`https://...`)이나 로컬 상대 경로는 그대로 보존하고, 대용량 인라인 Base64 문자열만 제거합니다.
 * (PPTX 렌더링 시에는 `pptx-renderer.ts`의 `enrichForBasicIm`이 좌표/PNU 기반으로 고해상도 지적도를 실시간 주입합니다.)
 */

const INLINE_BASE64_IMAGE_RE = /^(?:data:image\/[a-zA-Z0-9.+-]+;base64,|image\/(?:png|jpe?g|webp|gif);base64,)/i;

/** 인라인 Base64 이미지 문자열 여부 판정 (4KB 초과 또는 data:image/ 프리픽스) */
export function isHeavyInlineBase64Image(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (INLINE_BASE64_IMAGE_RE.test(trimmed)) return true;
  // 프리픽스 없이 순수 base64 블록이 8KB 이상 들어온 경우 방어
  if (trimmed.length > 8192 && !trimmed.includes(' ') && !trimmed.startsWith('http') && !trimmed.startsWith('/')) {
    return true;
  }
  return false;
}

/**
 * DB 저장 직전 `document_objects.body` 또는 `PptxProject` 사본에서 대용량 인라인 Base64 이미지를 제거합니다.
 * 원본 인메모리 객체는 변경하지 않는 얕은+중첩 복제 방식입니다.
 */
export function stripHeavyBase64ForDb<T>(input: T): T {
  if (input == null || typeof input !== 'object') {
    if (isHeavyInlineBase64Image(input)) return null as unknown as T;
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => stripHeavyBase64ForDb(item)) as unknown as T;
  }

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(input as Record<string, any>)) {
    if (
      key === 'cadastralMapImage' ||
      key === 'cadastralMapImageUrl' ||
      key === 'locationMapImage' ||
      key === 'mapImageUrl' ||
      key === 'roadviewImageUrl'
    ) {
      if (isHeavyInlineBase64Image(value)) {
        out[key] = null;
        continue;
      }
      if (value && typeof value === 'object' && isHeavyInlineBase64Image((value as any).base64)) {
        out[key] = null;
        continue;
      }
    }

    if (isHeavyInlineBase64Image(value)) {
      out[key] = null;
    } else if (value && typeof value === 'object') {
      out[key] = stripHeavyBase64ForDb(value);
    } else {
      out[key] = value;
    }
  }

  return out as T;
}
