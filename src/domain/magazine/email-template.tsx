/**
 * src/domain/magazine/email-template.tsx — 주간 매거진 이메일/알림톡 렌더러 (G-05 재작성)
 *
 * 결함 대응: M2-10(이스케이프·세무 계약·(광고)·프리헤더/해지/텍스트·Outlook·NaN억·엔티티), S2-09(구독자 이름 피싱),
 *           S2-22(전 보간 이스케이프), M2-26(발신자명 폴백 금지), U2-21(프리헤더·링크 목적 분리·전화 CTA·거래일·대비),
 *           T2-03(해지 링크), M2-02(공개 지번 마스킹).
 *
 * 설계
 *  - 테이블 레이아웃 + 인라인 스타일, **단색 배경**(그라디언트·rgba·CSS 변수 금지), Outlook 조건부 주석, 프리헤더, 이미지 없음(차단 대비).
 *  - 라이트 단일 테마, 모든 텍스트/배경 조합 WCAG 4.5:1 이상(COLORS 주석 참조).
 *  - 모든 보간은 escapeHtml(decodeEntities(...)) 또는 safeTemplateVar/safePersonName을 거친다.
 *  - 링크는 https 절대 URL만(localhost·undefined 포함 시 throw), 목적별로 분리: 매거진 보기 / 전화 상담(tel:) / 수신거부.
 *  - 전송자 명칭이 없으면 throw(MISSING_SENDER) → 호출측(sendGate)이 발송을 차단한다.
 */
import { MARKET_TEMP_CONFIG, type MarketTemperature } from './types';
import { decodeEntities, escapeHtml, safePersonName, safeTemplateVar, stripTags } from '@/lib/magazine/escape';
import { maskAddress } from '@/lib/magazine/pii';
import { clip, formatDateDots, formatDateKo, formatKrwAmount } from './templates/format';
import { renderMagazineKakaoText } from './templates/kakao-text';
import {
  MagazineRenderError,
  type MagazineDealInput,
  type MagazineEmailInput,
  type MagazineEmailRendered,
  type MagazineKakaoRendered,
  type MagazineTaxClinicInput,
} from './templates/types';
import { assertAbsoluteHttpsUrl, toTelHref } from './templates/url-guard';

export { renderMagazineKakaoText, MagazineRenderError };
export type { MagazineEmailInput, MagazineEmailRendered, MagazineKakaoRendered };

/**
 * 색 토큰(모두 지정 배경 대비 4.5:1 이상)
 *  본문 #0f172a/#ffffff 17.9 · 보조 #475569/#ffffff 7.6 · 링크/CTA #1d4ed8 on #fff 6.7, #ffffff on #1d4ed8 6.7
 *  프리헤더·푸터 #475569 on #f1f5f9 6.9 · 배지 텍스트는 아래 TEMP_COLOR (모두 #ffffff 배경 4.5 이상)
 */
const COLORS = {
  pageBg: '#f1f5f9',
  cardBg: '#ffffff',
  panelBg: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#475569',
  link: '#1d4ed8',
  ctaBg: '#1d4ed8',
  ctaText: '#ffffff',
} as const;

const TEMP_COLOR: Record<MarketTemperature, string> = {
  '적극 매수': '#b91c1c',
  '선별 매수': '#b45309',
  '관망': '#475569',
  '조정 대기': '#1d4ed8',
  '위기 경계': '#991b1b',
};

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif";

/** 줄바꿈을 보존하는 본문 정제: 엔티티 디코드 → 태그 제거 → 제어문자 제거(개행 제외) → 공백 정리 → 길이 제한 (이스케이프는 출력 시점) */
function body(s: unknown, max: number): string {
  const raw = typeof s === 'string' ? s : '';
  const cleaned = stripTags(decodeEntities(raw))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return clip(cleaned, max);
}

/** 정제된 문단 → HTML (이스케이프 + 줄바꿈 <br>) */
function hp(cleaned: string): string {
  return escapeHtml(cleaned).replace(/\n/g, '<br>');
}

/** 플레인 텍스트(제목·텍스트 대체본)용 정제: 엔티티 디코드, 태그/제어문자 제거 */
function pt(s: unknown, max: number): string {
  return clip(safeTemplateVar(stripTags(decodeEntities(typeof s === 'string' ? s : '')), { max: max * 2 }), max);
}

function wrapUrl(url: unknown, label: string): string {
  try {
    return assertAbsoluteHttpsUrl(url, label);
  } catch (e) {
    throw new MagazineRenderError('INVALID_URL', e instanceof Error ? e.message : `${label} invalid`);
  }
}

function isSupportedTemp(v: string): v is MarketTemperature {
  return Object.prototype.hasOwnProperty.call(MARKET_TEMP_CONFIG, v);
}

// ───────────────────────── 섹션 빌더 ─────────────────────────

function sectionTitle(label: string): string {
  return `<tr><td style="padding:20px 28px 8px;font-family:${FONT};font-size:16px;font-weight:bold;line-height:1.5;color:${COLORS.text};">${escapeHtml(label)}</td></tr>`;
}

function dealsHtml(deals: MagazineDealInput[] | undefined): { html: string; lines: string[] } {
  const rows: string[] = [];
  const lines: string[] = [];
  for (const d of (deals ?? []).slice(0, 3)) {
    const title = pt(d.title, 60);
    if (!title) continue;
    // 공개 지번은 동 단위까지만(maskAddress) — 정확 지번 노출 금지
    const addr = d.address ? pt(maskAddress(d.address), 60) : '';
    const price = formatKrwAmount(d.price);
    const date = formatDateDots(d.date);
    const meta = [addr, price, date ? `거래일 ${date}` : ''].filter(Boolean);
    rows.push(
      `<tr><td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};font-family:${FONT};">` +
        `<div style="font-size:14px;font-weight:bold;line-height:1.5;color:${COLORS.text};">${escapeHtml(title)}</div>` +
        (meta.length
          ? `<div style="font-size:13px;line-height:1.6;color:${COLORS.muted};">${meta.map((m) => escapeHtml(m)).join(' · ')}</div>`
          : '') +
        `</td></tr>`,
    );
    lines.push(`- ${title}${meta.length ? ` (${meta.join(' · ')})` : ''}`);
  }
  if (!rows.length) return { html: '', lines: [] };
  const html =
    sectionTitle('주목 매물') +
    `<tr><td style="padding:0 28px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.panelBg}" style="background-color:${COLORS.panelBg};border:1px solid ${COLORS.border};">${rows.join('')}</table></td></tr>`;
  return { html, lines };
}

function taxClinicHtml(t: MagazineTaxClinicInput | null | undefined): { html: string; lines: string[] } {
  if (!t) return { html: '', lines: [] };
  const title = pt(t.title, 80);
  const scenario = pt(t.scenario, 220);
  const conclusion = pt(t.conclusion, 220);
  const optA = pt(t.comparison?.optionA?.name, 50);
  const optB = pt(t.comparison?.optionB?.name, 50);
  if (!title && !scenario && !conclusion) return { html: '', lines: [] };

  const parts: string[] = [];
  const lines: string[] = ['[세무 클리닉]'];
  if (title) {
    parts.push(`<div style="font-size:14px;font-weight:bold;line-height:1.5;color:${COLORS.text};padding-bottom:4px;">${escapeHtml(title)}</div>`);
    lines.push(title);
  }
  if (scenario) {
    parts.push(`<div style="font-size:14px;line-height:1.7;color:${COLORS.text};padding-bottom:4px;">${escapeHtml(scenario)}</div>`);
    lines.push(scenario);
  }
  if (optA || optB) {
    const opts = [optA, optB].filter(Boolean).join(' / ');
    parts.push(`<div style="font-size:13px;line-height:1.7;color:${COLORS.muted};padding-bottom:4px;">비교 대안: ${escapeHtml(opts)}</div>`);
    lines.push(`비교 대안: ${opts}`);
  }
  if (conclusion) {
    parts.push(`<div style="font-size:14px;line-height:1.7;color:${COLORS.text};padding-bottom:4px;">${escapeHtml(conclusion)}</div>`);
    lines.push(conclusion);
  }
  // 면책(12px 이상·4.5:1 이상). '감수/제휴 세무법인' 등 사칭 문구는 렌더하지 않는다(DC-13)
  const disclaimer = '일반 정보이며 세무 자문이 아닙니다. 구체적인 사항은 세무 전문가와 상담해 주세요.';
  parts.push(`<div style="font-size:12px;line-height:1.6;color:${COLORS.muted};">${escapeHtml(disclaimer)}</div>`);
  lines.push(disclaimer);

  const html =
    sectionTitle('세무·법률 클리닉') +
    `<tr><td style="padding:0 28px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.panelBg}" style="background-color:${COLORS.panelBg};border:1px solid ${COLORS.border};"><tr><td style="padding:12px 14px;font-family:${FONT};">${parts.join('')}</td></tr></table></td></tr>`;
  return { html, lines };
}

function button(href: string, label: string, bg: string, fg: string, border?: string): string {
  // 불릿프루프: td bgcolor + a 인라인 블록 (Outlook은 td 배경 사용, 그라디언트 없음)
  const tdStyle = `background-color:${bg};${border ? `border:2px solid ${border};` : ''}`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 4px 8px;"><tr>` +
    `<td align="center" bgcolor="${bg}" style="${tdStyle}">` +
    `<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:bold;line-height:1.2;color:${fg};text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

// ───────────────────────── 메인 렌더 ─────────────────────────

export function renderMagazineEmail(input: MagazineEmailInput): MagazineEmailRendered {
  if (input.isAd !== true) throw new MagazineRenderError('MISSING_AD_FLAG', '광고성 메일은 isAd=true 가 필요합니다');
  const broker = safeTemplateVar(input.brokerName, { max: 40 });
  if (!broker) throw new MagazineRenderError('MISSING_SENDER', '전송자 명칭(중개사 표시명)이 없어 렌더할 수 없습니다');

  const viewUrl = wrapUrl(input.edition.url, 'edition.url');
  const unsubUrl = wrapUrl(input.unsubscribeUrl, 'unsubscribeUrl');

  const who = safePersonName(input.subscriberName);
  const contact = safeTemplateVar(input.brokerContact, { max: 40 });
  const telHref = contact ? toTelHref(contact) : null;
  const address = pt(input.senderAddress, 80);
  const consentDateKo = formatDateKo(input.consentDate);

  const title = pt(input.edition.title, 80);
  const headlineText = body(input.edition.headline, 600);
  const dateKo = formatDateKo(input.edition.date);
  const temp = typeof input.edition.marketTemp === 'string' ? input.edition.marketTemp.trim() : '';
  const tempKey: MarketTemperature | null = isSupportedTemp(temp) ? temp : null; // 미지원 라벨은 숨김

  // 제목: (광고) 접두 + [전송자] + 제목. 광고 표기는 반드시 맨 앞.
  const subject = `(광고) [${broker}] ${title || '이번 주 부동산 매거진'}`;
  const preheaderRaw = pt(headlineText || title, 90);
  const preheader = `(광고) ${preheaderRaw}`.trim();

  const deals = dealsHtml(input.edition.deals);
  const tax = taxClinicHtml(input.edition.taxClinic);

  const fieldComment = pt(input.edition.fieldNote?.comment, 300);
  const fieldQ = pt(input.edition.fieldNote?.question, 120);
  const news = (input.edition.topNews ?? [])
    .slice(0, 3)
    .map((n) => ({ title: pt(n?.title, 100), source: pt(n?.source, 30) }))
    .filter((n) => n.title);

  // ── 본문 HTML 조립 ──
  const blocks: string[] = [];

  // 헤더
  blocks.push(
    `<tr><td style="padding:24px 28px 8px;font-family:${FONT};">` +
      `<div style="font-size:12px;font-weight:bold;line-height:1.4;color:${COLORS.muted};letter-spacing:1px;">(광고) ${escapeHtml(broker)} 주간 부동산 매거진</div>` +
      `<h1 style="margin:8px 0 6px;font-size:22px;line-height:1.4;color:${COLORS.text};font-weight:bold;">${escapeHtml(title || '이번 주 부동산 매거진')}</h1>` +
      (dateKo ? `<div style="font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(dateKo)} 발행</div>` : '') +
      (tempKey
        ? `<div style="padding-top:10px;"><span style="display:inline-block;padding:4px 12px;border:1px solid ${TEMP_COLOR[tempKey]};font-size:13px;font-weight:bold;line-height:1.4;color:${TEMP_COLOR[tempKey]};background-color:${COLORS.cardBg};">시장 상태: ${escapeHtml(tempKey)}</span></div>`
        : '') +
      `</td></tr>`,
  );

  // 인사 + 브리핑
  blocks.push(
    `<tr><td style="padding:12px 28px 4px;font-family:${FONT};font-size:15px;line-height:1.8;color:${COLORS.text};">` +
      (who ? `<div style="padding-bottom:6px;">${escapeHtml(who)}님, 안녕하세요.</div>` : '') +
      (headlineText ? `<div>${hp(headlineText)}</div>` : '') +
      `</td></tr>`,
  );

  // CTA: 매거진 보기 / 전화 상담 (링크 목적 분리)
  blocks.push(
    `<tr><td align="center" style="padding:16px 28px 8px;">` +
      button(viewUrl, '매거진 전체 보기', COLORS.ctaBg, COLORS.ctaText) +
      (telHref ? button(telHref, `전화 상담 ${contact}`, COLORS.cardBg, COLORS.link, COLORS.link) : '') +
      `</td></tr>`,
  );

  if (fieldComment) {
    blocks.push(
      sectionTitle('현장 노트') +
        `<tr><td style="padding:0 28px 8px;font-family:${FONT};font-size:14px;line-height:1.7;color:${COLORS.text};">` +
        (fieldQ ? `<div style="color:${COLORS.muted};padding-bottom:4px;">Q. ${escapeHtml(fieldQ)}</div>` : '') +
        `<div>${escapeHtml(fieldComment)}</div></td></tr>`,
    );
  }

  if (deals.html) blocks.push(deals.html);

  if (news.length) {
    blocks.push(
      sectionTitle('주요 뉴스') +
        `<tr><td style="padding:0 28px 8px;font-family:${FONT};font-size:14px;line-height:1.7;color:${COLORS.text};">` +
        news
          .map((n) => `<div style="padding:4px 0;">• ${escapeHtml(n.title)}${n.source ? ` <span style="font-size:12px;color:${COLORS.muted};">(${escapeHtml(n.source)})</span>` : ''}</div>`)
          .join('') +
        `</td></tr>`,
    );
  }

  if (tax.html) blocks.push(tax.html);

  // 푸터: 전송자 명칭·연락처·주소, 수신동의 안내, 수신거부 링크
  const footerLines: string[] = [];
  footerLines.push(`전송자: ${escapeHtml(broker)}${contact ? ` · 연락처 ${escapeHtml(contact)}` : ''}${address ? ` · ${escapeHtml(address)}` : ''}`);
  footerLines.push(
    consentDateKo
      ? `이 메일은 ${escapeHtml(consentDateKo)} 광고성 정보 수신에 동의하신 분께 발송되었습니다.`
      : '이 메일은 광고성 정보 수신에 동의하신 분께 발송되었습니다.',
  );
  footerLines.push(
    `더 이상 받고 싶지 않으시면 <a href="${escapeHtml(unsubUrl)}" target="_blank" style="color:${COLORS.link};text-decoration:underline;">수신거부</a>를 눌러 주세요. 즉시 처리됩니다.`,
  );
  blocks.push(
    `<tr><td style="padding:20px 28px 24px;border-top:1px solid ${COLORS.border};font-family:${FONT};font-size:12px;line-height:1.8;color:${COLORS.muted};">${footerLines.join('<br>')}</td></tr>`,
  );

  const html = `<!DOCTYPE html>
<html lang="ko" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style type="text/css">table, td, div, h1, p, a { font-family: 'Malgun Gothic', Arial, sans-serif !important; }</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLORS.pageBg};color:${COLORS.text};-webkit-text-size-adjust:100%;" bgcolor="${COLORS.pageBg}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${COLORS.pageBg};">${escapeHtml(preheader)}${'&#8204;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.pageBg}" style="background-color:${COLORS.pageBg};">
<tr><td align="center" style="padding:20px 10px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.cardBg}" style="width:100%;max-width:600px;background-color:${COLORS.cardBg};border:1px solid ${COLORS.border};">
${blocks.join('\n')}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  // ── 텍스트 대체본 ──
  const textParts: string[] = [];
  textParts.push(`(광고) ${broker} 주간 부동산 매거진`);
  textParts.push(title || '이번 주 부동산 매거진');
  if (dateKo) textParts.push(`${dateKo} 발행`);
  if (tempKey) textParts.push(`시장 상태: ${tempKey}`);
  textParts.push('');
  if (who) textParts.push(`${who}님, 안녕하세요.`);
  if (headlineText) textParts.push(headlineText);
  textParts.push('', `▶ 매거진 전체 보기: ${viewUrl}`);
  if (telHref && contact) textParts.push(`▶ 전화 상담: ${contact}`);
  if (fieldComment) textParts.push('', '[현장 노트]', ...(fieldQ ? [`Q. ${fieldQ}`] : []), fieldComment);
  if (deals.lines.length) textParts.push('', '[주목 매물]', ...deals.lines);
  if (news.length) textParts.push('', '[주요 뉴스]', ...news.map((n) => `- ${n.title}${n.source ? ` (${n.source})` : ''}`));
  if (tax.lines.length) textParts.push('', ...tax.lines);
  textParts.push(
    '',
    '----',
    `전송자: ${broker}${contact ? ` · 연락처 ${contact}` : ''}${address ? ` · ${address}` : ''}`,
    consentDateKo ? `이 메일은 ${consentDateKo} 광고성 정보 수신에 동의하신 분께 발송되었습니다.` : '이 메일은 광고성 정보 수신에 동의하신 분께 발송되었습니다.',
    `수신거부: ${unsubUrl}`,
  );
  const text = textParts.join('\n');

  return {
    subject,
    html,
    text,
    hasUnsubscribeLink: html.includes(escapeHtml(unsubUrl)) && text.includes(unsubUrl),
    hasAdLabel: subject.startsWith('(광고)') && html.includes('(광고)') && text.startsWith('(광고)'),
    hasSenderContact: !!contact && html.includes(escapeHtml(contact)),
  };
}

// ───────────────────────── 레거시 호환(B1 교체 전까지) ─────────────────────────

/**
 * @deprecated 구 시그니처. B1(distribute-*)이 renderMagazineEmail로 교체하면 삭제된다.
 * 해지 링크(unsubscribeUrl)·전송자 연락처 없이는 렌더하지 않는다(fail-closed): 누락 시 throw.
 */
export interface MagazineEmailPayload {
  to: string;
  brokerName: string;
  subscriberName: string;
  magazineTitle: string;
  headline: string;
  magazineUrl: string;
  imageUrl: string;
  marketTemp?: MarketTemperature | string;
  customInsert?: string;
  fieldNote?: { question?: string; comment?: string } | null;
  featuredDeals?: { address?: string; assetType?: string; price?: number | string }[];
  topNews?: { title?: string; sentiment?: string; source?: string }[];
  recentTransactions?: { address?: string; transaction_price?: number | string; transaction_date?: string }[];
  poll?: { question?: string; choices?: string[] } | null;
  taxClinic?: MagazineTaxClinicInput | { question?: string; answer?: string; source?: string } | null;
  // ── 신규 필수(레거시 호출처는 아직 미제공 → throw) ──
  unsubscribeUrl?: string;
  brokerContact?: string;
  senderAddress?: string;
  editionDate?: string;
}

/** @deprecated renderMagazineEmail 사용 */
export function buildMagazineHtml(p: MagazineEmailPayload): string {
  if (!p.unsubscribeUrl) throw new MagazineRenderError('MISSING_UNSUB_LINK', '수신거부 링크 없이는 매거진 이메일을 렌더할 수 없습니다');
  const tax = p.taxClinic && ('scenario' in p.taxClinic || 'conclusion' in p.taxClinic || 'comparison' in p.taxClinic)
    ? (p.taxClinic as MagazineTaxClinicInput)
    : null;
  return renderMagazineEmail({
    brokerName: p.brokerName,
    brokerContact: p.brokerContact,
    subscriberName: p.subscriberName,
    edition: {
      title: p.magazineTitle,
      headline: p.headline,
      marketTemp: String(p.marketTemp ?? ''),
      date: p.editionDate ?? '',
      url: p.magazineUrl,
      deals: (p.featuredDeals ?? []).map((d) => ({ title: d.assetType || '매물', address: d.address, price: d.price })),
      fieldNote: p.fieldNote,
      topNews: p.topNews,
      taxClinic: tax,
    },
    unsubscribeUrl: p.unsubscribeUrl,
    senderAddress: p.senderAddress,
    isAd: true,
  }).html;
}
