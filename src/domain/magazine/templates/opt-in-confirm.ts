/**
 * src/domain/magazine/templates/opt-in-confirm.ts — 구독 확인(더블 옵트인) 메일 (G-01, DC-6a)
 *
 * 거래성(확인) 메시지이므로 `(광고)` 표기는 붙이지 않는다(광고성 정보 미포함 — 매거진 본문·매물 홍보 없음).
 * 본인이 요청하지 않았다면 무시하도록 안내하고, 확인 링크는 일정 기간 후 만료된다.
 */
import { escapeHtml, safePersonName, safeTemplateVar } from '@/lib/magazine/escape';
import { assertAbsoluteHttpsUrl } from './url-guard';

export interface OptInConfirmInput {
  /** 중개사 표시명(profiles.display_name). 없으면 이름 없이 "매거진 구독 확인"으로 안내한다(임의 폴백 문구 금지). */
  brokerName?: string | null;
  brokerContact?: string | null;
  subscriberName?: string | null;
  confirmUrl: string;
  ttlDays: number;
}

export interface OptInConfirmRendered {
  subject: string;
  html: string;
  text: string;
}

export function renderOptInConfirmEmail(input: OptInConfirmInput): OptInConfirmRendered {
  const url = assertAbsoluteHttpsUrl(input.confirmUrl, 'confirmUrl');
  const broker = safeTemplateVar(input.brokerName, { max: 40 });
  const contact = safeTemplateVar(input.brokerContact, { max: 60 });
  const who = safePersonName(input.subscriberName);
  const ttl = Number.isFinite(input.ttlDays) && input.ttlDays > 0 ? Math.floor(input.ttlDays) : 7;

  const subject = broker ? `[구독 확인] ${broker} 매거진 구독을 확인해 주세요` : '[구독 확인] 매거진 구독을 확인해 주세요';
  const greeting = who ? `${who}님, 안녕하세요.` : '안녕하세요.';
  const lead = broker
    ? `${broker}의 부동산 매거진 구독 신청이 접수되었습니다.`
    : '부동산 매거진 구독 신청이 접수되었습니다.';

  const text = [
    greeting,
    lead,
    '아래 링크를 열고, 열린 페이지의 "구독 확인하기" 버튼을 눌러 구독을 확인해 주세요. 확인하시면 수신이 시작됩니다.',
    url,
    `링크는 ${ttl}일 동안 유효합니다.`,
    '본인이 신청하지 않으셨다면 이 메일을 무시해 주세요. 확인하지 않으면 매거진은 발송되지 않습니다.',
    contact ? `문의: ${contact}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;">
<tr><td style="padding:28px 28px 8px;font-size:18px;font-weight:bold;line-height:1.5;color:#0f172a;">${escapeHtml(greeting)}</td></tr>
<tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(lead)}<br>아래 버튼을 눌러 열린 페이지에서 "구독 확인하기"를 한 번 더 눌러 주세요. 확인하시면 수신이 시작됩니다.</td></tr>
<tr><td align="center" style="padding:20px 28px;">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;background-color:#1d4ed8;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">구독 확인하기</a>
</td></tr>
<tr><td style="padding:0 28px 8px;font-size:13px;line-height:1.7;color:#475569;">버튼이 열리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.<br><span style="word-break:break-all;">${escapeHtml(url)}</span></td></tr>
<tr><td style="padding:12px 28px 24px;font-size:13px;line-height:1.7;color:#475569;">링크는 ${ttl}일 동안 유효합니다. 본인이 신청하지 않으셨다면 이 메일을 무시해 주세요. 확인하지 않으면 매거진은 발송되지 않습니다.${contact ? `<br>문의: ${escapeHtml(contact)}` : ''}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
