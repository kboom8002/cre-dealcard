/**
 * 구독 확인(더블 옵트인) — 확인 메일/알림의 링크가 여는 엔드포인트 (G-01, DC-6a)
 *
 * GET  /api/public/magazine/confirm?t={token}&b={brokerSlug}
 *   → "구독 확인" 버튼이 있는 HTML만 렌더한다. **DB 조회·상태 변경 없음**
 *     (메일 보안 스캐너/링크 미리보기가 GET을 prefetch해 토큰을 소비하는 문제 방지).
 * POST /api/public/magazine/confirm  (application/x-www-form-urlencoded: t, b)
 *   → 여기서만 confirmOptIn을 호출한다. 토큰 해시 비교(timingSafeEqual), 7일 만료,
 *     같은 토큰 재요청은 멱등(alreadyConfirmed)이며 해지 후 오래된 링크로는 재활성화되지 않는다.
 *
 * - 해지 이력이 있던 구독자는 이 확인(POST) 이후에만 재활성화된다(canResubscribe).
 * - 응답은 간단한 한국어 HTML. 모든 동적 값은 escape. 토큰은 확인 버튼의 hidden input에만 존재한다.
 * - 토큰이 URL에 있으므로 no-store + no-referrer + noindex.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { confirmOptIn, type ConfirmOptInResult } from '@/domain/magazine/consent-service';
import { withPublicGuard } from '@/lib/magazine/public-guard';
import { escapeHtml } from '@/lib/magazine/escape';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

/** consent-service.confirmOptIn의 토큰 형식과 동일(base64url 32~128자) */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;
const BROKER_SHAPE = /^[A-Za-z0-9_.-]{1,80}$/;

function shell(title: string, bodyHtml: string, status: number, extraHeaders?: HeadersInit): Response {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f1f5f9;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;color:#0f172a;word-break:keep-all;">
<main style="max-width:480px;margin:48px auto;padding:28px 24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.4;color:#0f172a;">${escapeHtml(title)}</h1>
${bodyHtml}
</main>
</body>
</html>`;
  return new Response(html, { status, headers: { ...HEADERS, ...(extraHeaders as Record<string, string> | undefined) } });
}

function subscribeLinkHtml(brokerSlug?: string | null, label = '구독 신청 페이지로 이동하기'): string {
  if (!brokerSlug || !BROKER_SHAPE.test(brokerSlug)) return '';
  const href = `/magazine/${encodeURIComponent(brokerSlug)}/subscribe`;
  return `<div style="margin-top:20px;"><a href="${escapeHtml(href)}" style="display:block;width:100%;min-height:52px;padding:14px 16px;text-align:center;font-size:17px;font-weight:700;line-height:1.4;color:#ffffff;background:#1d4ed8;border-radius:8px;text-decoration:none;box-sizing:border-box;">${escapeHtml(label)}</a></div>`;
}

function page(
  title: string,
  message: string,
  status: number,
  extraHeaders?: HeadersInit,
  actionHtml = '',
): Response {
  return shell(
    title,
    `<p style="margin:0;font-size:17px;line-height:1.75;color:#1e293b;">${escapeHtml(message)}</p>${actionHtml}`,
    status,
    extraHeaders,
  );
}

/** GET: 확인 버튼만. 토큰/브로커는 형식만 검사하고 DB는 조회하지 않는다. */
function confirmFormPage(token: string, broker: string): Response {
  const body = `<p style="margin:0 0 22px;font-size:17px;line-height:1.75;color:#1e293b;">아래 버튼을 누르면 매거진 구독 신청이 완료됩니다. 신청하신 채널(카카오톡·이메일)로 주간 매거진을 보내드립니다. 본인이 신청하지 않았다면 이 페이지를 닫아 주세요.</p>
<form method="post" action="/api/public/magazine/confirm" style="margin:0;">
<input type="hidden" name="t" value="${escapeHtml(token)}">
<input type="hidden" name="b" value="${escapeHtml(broker)}">
<button type="submit" style="display:block;width:100%;min-height:52px;padding:15px 18px;font-size:17px;font-weight:700;color:#ffffff;background:#1d4ed8;border:0;border-radius:8px;cursor:pointer;">구독 확인하기</button>
</form>`;
  return shell('구독 확인', body, 200);
}

function render(r: ConfirmOptInResult, brokerSlug?: string | null): Response {
  if (r.ok) {
    const viewHref = brokerSlug && BROKER_SHAPE.test(brokerSlug) ? `/magazine/${encodeURIComponent(brokerSlug)}` : '';
    const viewBtn = viewHref
      ? `<div style="margin-top:20px;"><a href="${escapeHtml(viewHref)}" style="display:block;width:100%;min-height:52px;padding:14px 16px;text-align:center;font-size:17px;font-weight:700;line-height:1.4;color:#ffffff;background:#1d4ed8;border-radius:8px;text-decoration:none;box-sizing:border-box;">매거진 보러 가기</a></div>`
      : '';
    return page(
      '구독이 확인되었습니다',
      '확인해 주셔서 감사합니다. 앞으로 신청하신 채널(카카오톡·이메일)로 매거진을 보내드립니다. 수신을 원치 않으시면 매거진 하단의 수신거부 링크를 이용해 주세요.',
      200,
      undefined,
      viewBtn,
    );
  }
  const retryBtn = subscribeLinkHtml(brokerSlug, '다시 구독 신청하기');
  switch (r.reason) {
    case 'EXPIRED':
      return page(
        '확인 링크가 만료되었습니다',
        '확인 링크의 유효 기간(7일)이 지났습니다. 아래 버튼을 눌러 구독 페이지에서 다시 신청해 주세요.',
        410,
        undefined,
        retryBtn,
      );
    case 'UNAVAILABLE':
    case 'ERROR':
      return page(
        '잠시 후 다시 시도해 주세요',
        '일시적인 문제로 확인을 처리하지 못했습니다. 잠시 후 같은 링크를 다시 열어 주세요.',
        503,
      );
    default:
      return page(
        '유효하지 않은 링크입니다',
        '올바르지 않거나 더 이상 사용할 수 없는 링크입니다. 아래 버튼을 눌러 구독 페이지에서 다시 신청해 주세요.',
        400,
        undefined,
        retryBtn,
      );
  }
}

const GUARD_IP = { max: 30, windowSec: 3600 };

/** 가드 단계 오류(429/413/400/500)도 JSON이 아닌 사람용 HTML로 */
function renderGuardError(e: { status: number; code: string; message: string; headers?: HeadersInit }): Response {
  const title = e.status === 429 ? '요청이 너무 많습니다' : '요청을 처리하지 못했습니다';
  return page(title, e.message, e.status, e.headers);
}

export const GET = withPublicGuard({
  name: 'magazine-confirm-page',
  rateLimit: { ip: GUARD_IP },
  renderError: renderGuardError,
})(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const t = sp.get('t') ?? '';
  const b = sp.get('b') ?? '';
  const safeBroker = BROKER_SHAPE.test(b) ? b : null;
  if (!TOKEN_SHAPE.test(t) || !safeBroker) {
    return page(
      '유효하지 않은 링크입니다',
      '올바르지 않은 링크입니다. 구독 페이지에서 다시 신청해 주세요.',
      400,
      undefined,
      subscribeLinkHtml(safeBroker, '다시 구독 신청하기'),
    );
  }
  return confirmFormPage(t, safeBroker);
});

const confirmBodySchema = z.object({
  t: z.string().regex(TOKEN_SHAPE, '올바르지 않은 확인 링크입니다.'),
  b: z.string().regex(BROKER_SHAPE, '올바르지 않은 확인 링크입니다.'),
});

export const POST = withPublicGuard<z.infer<typeof confirmBodySchema>>({
  name: 'magazine-confirm',
  schema: confirmBodySchema,
  rateLimit: { ip: GUARD_IP },
  bodyFormat: 'form',
  maxBodyBytes: 2 * 1024,
  renderError: renderGuardError,
})(async (_req, { body }) => {
  const result = await confirmOptIn(createServiceClient(), { token: body.t, brokerSlug: body.b });
  return render(result, body.b);
});
