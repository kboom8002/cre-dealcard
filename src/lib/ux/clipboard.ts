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
    ta.focus();
    ta.select();
    if (typeof ta.setSelectionRange === 'function') {
      ta.setSelectionRange(0, text.length);
    }
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

/**
 * 비동기 저장 후 클립보드 복사를 사용자 제스처 컨텍스트 안에서 즉시 시작한다.
 * ClipboardItem(Promise<Blob>) 지원 브라우저에서는 클릭 제스처를 유지한 채 비동기 텍스트를 복사하고,
 * 미지원/거부 환경에서는 텍스트 해석 후 copyText 폴백을 수행한다.
 */
export async function copyTextFromPromise(
  getText: () => Promise<string | null | undefined>,
): Promise<{ ok: boolean; text: string | null }> {
  if (typeof window === 'undefined') return { ok: false, text: null };

  let resolvedText: string | null = null;
  let sharedPromise: Promise<string | null> | null = null;
  const resolveOnce = (): Promise<string | null> => {
    if (!sharedPromise) {
      sharedPromise = getText().then((val) => {
        resolvedText = typeof val === 'string' && val.length > 0 ? val : null;
        return resolvedText;
      });
    }
    return sharedPromise;
  };

  const canUseClipboardItem =
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator?.clipboard?.write === 'function' &&
    window.isSecureContext !== false;

  if (canUseClipboardItem) {
    try {
      const blobPromise = resolveOnce().then((val) => {
        if (!val) {
          throw new Error('EMPTY_CLIPBOARD_TEXT');
        }
        return new Blob([val], { type: 'text/plain' });
      });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': blobPromise }),
      ]);
      return { ok: true, text: resolvedText };
    } catch {
      // fall through to resolved copyText fallback
    }
  }

  try {
    const text = await resolveOnce();
    if (!text) return { ok: false, text: null };
    const ok = await copyText(text);
    return { ok, text };
  } catch {
    return { ok: false, text: resolvedText };
  }
}
