/**
 * @file safe-write.ts
 * @description 골든 테스트 PPTX 출력 시 EBUSY 파일 잠금 방지 유틸리티.
 *
 * PowerPoint에서 이전 산출물을 열어둔 상태에서 테스트를 재실행하면
 * EBUSY 에러가 발생합니다. 이 유틸리티는 잠금 감지 시 타임스탬프 폴백
 * 경로로 저장하여 테스트 실패를 방지합니다.
 */
import { writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

/**
 * EBUSY 안전 쓰기. 파일이 잠겨있으면 타임스탬프 폴백 경로에 저장.
 * @returns 실제 저장된 경로
 */
export function safeWritePptx(path: string, data: Buffer): string {
  try {
    writeFileSync(path, data);
    return path;
  } catch (e: any) {
    if (e.code === 'EBUSY') {
      const dir = dirname(path);
      const name = basename(path, '.pptx');
      const fallback = join(dir, `${name}_${Date.now()}.pptx`);
      writeFileSync(fallback, data);
      console.warn(`⚠️ 파일 잠금(EBUSY) → 폴백 저장: ${fallback}`);
      return fallback;
    }
    throw e;
  }
}
