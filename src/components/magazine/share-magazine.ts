/**
 * src/components/magazine/share-magazine.ts — 뷰어 공유 오케스트레이션 (U2-26)
 *
 * 순서: 카카오 SDK → 기기 공유 시트(navigator.share) → 링크 복사.
 * 카카오 SDK 가 없거나 실패하면 "링크 복사" 로 폴백하고, 호출부가 토스트로 알린다(실패를 성공으로 위장하지 않음).
 * 브라우저 전역에 의존하지 않도록 의존성을 주입받는다(단위테스트 가능).
 */
import {
  shareViaKakaoOrCopy,
  type KakaoFeedInput,
  type KakaoLike,
} from '@/lib/magazine/kakao-share';

export type ShareOutcome = 'kakao' | 'native' | 'copied' | 'cancelled' | 'failed';

export interface ShareDeps {
  kakao?: KakaoLike | null;
  appKey?: string | null;
  share?: ((data: { title: string; text: string; url: string }) => Promise<void>) | null;
  writeClipboard?: ((text: string) => Promise<void>) | null;
}

export async function shareMagazine(
  input: KakaoFeedInput & { shareText: string },
  deps: ShareDeps,
): Promise<ShareOutcome> {
  let native = false;
  let cancelled = false;

  const outcome = await shareViaKakaoOrCopy({
    kakao: deps.kakao ?? null,
    appKey: deps.appKey ?? null,
    input,
    copy: async (text) => {
      if (deps.share) {
        try {
          await deps.share({ title: input.title, text: input.shareText, url: text });
          native = true;
          return;
        } catch (err) {
          if ((err as { name?: string } | null)?.name === 'AbortError') {
            cancelled = true; // 사용자가 공유 시트를 닫음 — 실패 아님
            return;
          }
          // 공유 시트 실패 → 클립보드로 계속
        }
      }
      if (!deps.writeClipboard) throw new Error('clipboard unavailable');
      await deps.writeClipboard(text);
    },
  });

  if (outcome === 'kakao') return 'kakao';
  if (outcome === 'failed') return 'failed';
  if (cancelled) return 'cancelled';
  return native ? 'native' : 'copied';
}
