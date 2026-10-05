/**
 * 카카오 공유 실행기 (U2-26, T2-14, T3-10)
 *
 * - SDK 가 없거나 초기화/전송에 실패하면 클립보드 복사로 폴백하고 그 사실을 호출부에 알린다.
 *   (실패를 성공으로 위장하지 않는다: 반환값으로 'kakao' | 'copied' | 'failed' 를 구분)
 * - DOM/전역에 의존하지 않도록 kakao·copy 를 주입받아 단위테스트한다.
 */

export interface KakaoLike {
  isInitialized(): boolean;
  init(appKey: string): void;
  Share: { sendDefault(options: Record<string, unknown>): void };
}

export interface KakaoFeedInput {
  title: string;
  description: string;
  /** 쿼리형 절대 URL (buildOgImageUrl) */
  imageUrl: string;
  /** 매거진 열람 절대 URL */
  link: string;
  buttonTitle?: string;
}

export type KakaoShareOutcome = 'kakao' | 'copied' | 'failed';

export function buildKakaoFeedPayload(input: KakaoFeedInput): Record<string, unknown> {
  const link = { mobileWebUrl: input.link, webUrl: input.link };
  return {
    objectType: 'feed',
    content: {
      title: input.title,
      description: input.description,
      imageUrl: input.imageUrl,
      link,
    },
    buttons: [{ title: input.buttonTitle ?? '매거진 보기', link }],
  };
}

/** 카카오 피드 설명 문구 — 80자 제한, 잘렸을 때만 말줄임 */
export function clipDescription(text: string, max = 80): string {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

export async function shareViaKakaoOrCopy(opts: {
  kakao?: KakaoLike | null;
  appKey?: string | null;
  input: KakaoFeedInput;
  copy: (text: string) => Promise<void>;
}): Promise<KakaoShareOutcome> {
  const { kakao, appKey, input, copy } = opts;

  if (kakao) {
    try {
      if (!kakao.isInitialized() && appKey) kakao.init(appKey);
      if (kakao.isInitialized()) {
        kakao.Share.sendDefault(buildKakaoFeedPayload(input));
        return 'kakao';
      }
    } catch (e) {
      console.error('[kakao-share] sendDefault failed, falling back to clipboard', e);
    }
  }

  try {
    await copy(input.link);
    return 'copied';
  } catch (e) {
    console.error('[kakao-share] clipboard copy failed', e);
    return 'failed';
  }
}
