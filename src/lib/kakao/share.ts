/**
 * 카카오톡 공유 공용 헬퍼 (Kakao JS SDK 2.7.2 · NEXT_PUBLIC_KAKAO_APP_KEY).
 *
 * - ensureKakaoSdk(): SDK 스크립트를 1회만 로드하고 init 한다.
 * - shareKakaoFeed(): 피드형 카톡 공유 창을 연다. SDK 를 쓸 수 없으면 링크 복사로 폴백.
 *
 * 반환값은 실제로 일어난 일만 말한다:
 *  - 'kakao'  : 카카오톡 공유 창을 열었음 (전송 완료 여부는 SDK 가 알려주지 않음)
 *  - 'copied' : SDK 를 쓸 수 없어 링크/문구를 클립보드에 복사했음
 *  - 'failed' : 둘 다 실패
 */
import { copyText } from '@/lib/ux/clipboard';

const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';

type KakaoGlobal = {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Share: { sendDefault: (options: Record<string, unknown>) => void };
};

function getKakao(): KakaoGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Kakao?: KakaoGlobal }).Kakao;
}

let sdkPromise: Promise<boolean> | null = null;

export function ensureKakaoSdk(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
  if (!appKey) return Promise.resolve(false);

  const initIfNeeded = (): boolean => {
    const k = getKakao();
    if (!k) return false;
    try {
      if (!k.isInitialized()) k.init(appKey);
      return true;
    } catch {
      return false;
    }
  };

  if (getKakao()) return Promise.resolve(initIfNeeded());
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement('script');
    const done = () => resolve(initIfNeeded());
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => {
      sdkPromise = null;
      resolve(false);
    }, { once: true });
    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
    // 이미 로드 완료된 기존 스크립트 대응
    setTimeout(() => {
      if (getKakao()) done();
    }, 0);
  });
  return sdkPromise;
}

export interface KakaoFeedShareInput {
  /** 카톡 말풍선 제목 (딜카드 '한 줄 제목' 등) */
  title: string;
  /** 설명 — 피드백에 따라 기본은 비움 */
  description?: string;
  /** 절대 URL 썸네일 */
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  /** 열릴 페이지 (절대 URL) */
  url: string;
  /** 버튼 문구 (기본 '자세히 보기') */
  buttonTitle?: string;
  /** SDK 를 못 쓸 때 복사할 문구 (기본: 제목 + 줄바꿈 + URL) */
  fallbackText?: string;
}

export type KakaoShareResult = 'kakao' | 'copied' | 'failed';

export async function shareKakaoFeed(input: KakaoFeedShareInput): Promise<KakaoShareResult> {
  const ready = await ensureKakaoSdk();
  const k = getKakao();
  if (ready && k?.Share?.sendDefault) {
    try {
      k.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: input.title,
          description: input.description ?? '',
          imageUrl: input.imageUrl,
          imageWidth: input.imageWidth ?? 1200,
          imageHeight: input.imageHeight ?? 630,
          link: { webUrl: input.url, mobileWebUrl: input.url },
        },
        buttons: [
          {
            title: input.buttonTitle ?? '자세히 보기',
            link: { webUrl: input.url, mobileWebUrl: input.url },
          },
        ],
      });
      return 'kakao';
    } catch {
      // fall through to copy
    }
  }
  const copied = await copyText(input.fallbackText ?? `${input.title}\n${input.url}`);
  return copied ? 'copied' : 'failed';
}

/** 사이트 절대 URL (OG/공유용) */
export function getSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://credeal.net';
}
