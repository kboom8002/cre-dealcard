/**
 * 정직한 클립보드 복사 — 실제로 복사됐을 때만 true.
 * navigator.clipboard 가 없거나 거부되면 textarea + execCommand 폴백을 시도한다.
 * 호출부는 반환값이 false 이면 "복사가 안 됐어요. 길게 눌러 복사해 주세요" 를 보여준다.
 */
export const COPY_FAILED_MESSAGE = '복사가 안 됐어요. 길게 눌러 직접 복사해 주세요.';

export async function copyText(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || !text) return false;
  try {
    if (navigator?.clipboard?.writeText && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}
