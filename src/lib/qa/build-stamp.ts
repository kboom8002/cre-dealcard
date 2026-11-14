/**
 * @file src/lib/qa/build-stamp.ts
 * @description 빌드 버전 배지(T1) 및 운영 실발송 정책 SSOT (순수 클라이언트·서버 공용 모듈, Node fs 금지).
 */

export interface BuildStampInfo {
  sha: string;
  shortSha: string;
  builtAt: string;
  env: string;
}

/**
 * 확정된 아웃바운드 운영 점검 정책:
 * - 이메일(Resend): 테스트·운영 점검에서 실제 발송 허용 (`emailLiveAllowed: true`)
 * - 카카오 알림톡(Solapi): 실발송 보류 (`alimtalkLiveAllowed: false` — 드라이런·문구·업그레이드 시트만 점검)
 */
export const QA_OUTBOUND_CHANNEL_POLICY = {
  emailLiveAllowed: true as const,
  alimtalkLiveAllowed: false as const,
  summaryLabel: "실제 사이트 점검: 이메일 발송 허용 · 알림톡 실발송 보류(드라이런)",
} as const;

export function getBuildStampInfo(): BuildStampInfo {
  const rawSha = (
    process.env.NEXT_PUBLIC_BUILD_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    "local"
  ).trim();
  const sha = rawSha || "local";
  const shortSha = sha.slice(0, 8);
  const builtAt = (
    process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || new Date().toISOString()
  ).trim();
  const env = (
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  ).trim();

  return { sha, shortSha, builtAt, env };
}

export function formatBuildStampBadge(info: BuildStampInfo = getBuildStampInfo()): string {
  let kstLabel = "";
  try {
    const dt = new Date(info.builtAt);
    if (!Number.isNaN(dt.getTime())) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(dt);
      const get = (type: string) =>
        parts.find((p) => p.type === type)?.value || "";
      const mm = get("month");
      const dd = get("day");
      const hh = get("hour");
      const mi = get("minute");
      if (mm && dd && hh && mi) {
        kstLabel = `${mm}/${dd} ${hh}:${mi}`;
      }
    }
  } catch {
    kstLabel = "";
  }

  return kstLabel
    ? `빌드 #${info.shortSha} · ${kstLabel}`
    : `빌드 #${info.shortSha}`;
}

export function parseCompactDeviceLabel(ua?: string | null): string {
  const s = (ua || "").trim();
  if (!s) return "기타 기기";
  if (/KAKAOTALK/i.test(s)) return "카카오톡 인앱";
  if (/iPhone|iPad|iPod/i.test(s)) {
    return /CriOS/i.test(s) ? "iPhone Chrome" : "iPhone Safari";
  }
  if (/Android/i.test(s)) {
    return /SamsungBrowser/i.test(s) ? "Android 삼성인터넷" : "Android Chrome";
  }
  if (/Windows NT/i.test(s)) {
    if (/Edg\//i.test(s)) return "Windows Edge";
    if (/Chrome\//i.test(s)) return "Windows Chrome";
    return "Windows";
  }
  if (/Macintosh|Mac OS X/i.test(s)) {
    if (/Chrome\//i.test(s)) return "Mac Chrome";
    if (/Safari\//i.test(s)) return "Mac Safari";
    return "Mac";
  }
  if (/Playwright/i.test(s)) return "Playwright E2E";
  return "기타 기기";
}
