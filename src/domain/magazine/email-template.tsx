import { MARKET_TEMP_CONFIG, type MarketTemperature } from "./types";

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
  // Extended sections (Quick Win #3)
  fieldNote?: { question?: string; comment?: string } | null;
  featuredDeals?: { address?: string; assetType?: string; price?: number | string }[];
  topNews?: { title?: string; sentiment?: string; source?: string }[];
  recentTransactions?: { address?: string; transaction_price?: number | string; transaction_date?: string }[];
  // Extended sections (HI #4, #5)
  poll?: { question?: string; choices?: string[] } | null;
  taxClinic?: { question?: string; answer?: string; source?: string } | null;
}

export function buildMagazineHtml(p: MagazineEmailPayload): string {
  const tempKey = (p.marketTemp || "관망") as MarketTemperature;
  const tempConfig = MARKET_TEMP_CONFIG[tempKey] || MARKET_TEMP_CONFIG["관망"];

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${p.magazineTitle}</title>
</head>
<body style="margin:0; padding:0; background-color:#0b0d14; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f1f5f9;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#0b0d14; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#131722; border:1px solid rgba(255,255,255,0.08); border-radius:20px; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px; border-bottom:1px solid rgba(255,255,255,0.06); text-align:center;">
              <div style="font-size:12px; font-weight:800; color:#818cf8; letter-spacing:3px; margin-bottom:8px;">CRE WEEKLY INTELLIGENCE</div>
              <h1 style="font-size:24px; font-weight:900; color:#ffffff; margin:0 0 16px; line-height:1.35;">${p.magazineTitle}</h1>
              
              <!-- Market Temperature Badge -->
              <div style="display:inline-block; padding:6px 16px; border-radius:30px; font-size:13px; font-weight:800; color:${tempConfig.color}; background-color:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);">
                ${tempConfig.emoji} 시장 상태: ${tempKey}
              </div>
            </td>
          </tr>

          <!-- Custom Personalized Insert (If available) -->
          ${p.customInsert ? `
          <tr>
            <td style="padding:20px 32px 0;">
              <div style="background-color:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.25); border-radius:14px; padding:16px 20px;">
                <div style="font-size:13px; font-weight:800; color:#a5b4fc; margin-bottom:6px;">✨ ${p.subscriberName}님을 위한 맞춤 인사이트</div>
                <div style="font-size:14px; line-height:1.6; color:#e2e8f0;">${p.customInsert}</div>
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- Briefing Body -->
          <tr>
            <td style="padding:28px 32px; font-size:15px; line-height:1.75; color:#cbd5e1;">
              <div style="font-size:16px; font-weight:800; color:#ffffff; margin-bottom:12px;">📊 금주의 핵심 마켓 브리핑</div>
              <p style="margin:0 0 20px; white-space:pre-line;">${p.headline}</p>

              <!-- CTA Button -->
              <div style="text-align:center; padding:16px 0;">
                <a href="${p.magazineUrl}" style="display:inline-block; padding:14px 36px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#ffffff; text-decoration:none; border-radius:12px; font-size:15px; font-weight:800; box-shadow:0 4px 16px rgba(99,102,241,0.4);">
                  전체 분석 리포트 읽기 &rarr;
                </a>
              </div>
            </td>
          </tr>

          ${p.fieldNote?.comment ? `
          <!-- Field Note Summary -->
          <tr>
            <td style="padding:0 32px 20px;">
              <div style="background-color:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); border-radius:14px; padding:16px 20px;">
                <div style="font-size:13px; font-weight:800; color:#fbbf24; margin-bottom:8px;">🏗️ 현장 노트</div>
                ${p.fieldNote.question ? `<div style="font-size:13px; color:#e2e8f0; margin-bottom:6px; font-style:italic;">Q. ${p.fieldNote.question}</div>` : ''}
                <div style="font-size:14px; line-height:1.6; color:#cbd5e1;">${p.fieldNote.comment}</div>
              </div>
            </td>
          </tr>
          ` : ""}

          ${p.featuredDeals && p.featuredDeals.length > 0 ? `
          <!-- Featured Deals -->
          <tr>
            <td style="padding:0 32px 20px;">
              <div style="font-size:14px; font-weight:800; color:#ffffff; margin-bottom:10px;">🏢 주목 매물</div>
              ${p.featuredDeals.slice(0, 3).map(d => `
              <div style="background-color:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px 16px; margin-bottom:8px;">
                <div style="font-size:13px; font-weight:700; color:#f1f5f9;">${d.address || '매물 정보'}</div>
                <div style="font-size:12px; color:#94a3b8; margin-top:4px;">${d.assetType || ''} · ${typeof d.price === 'number' ? (d.price >= 100000000 ? `${(d.price / 100000000).toFixed(1)}억` : `${(d.price / 10000).toFixed(0)}만`) : (d.price || '')}</div>
              </div>
              `).join('')}
            </td>
          </tr>
          ` : ""}

          ${p.topNews && p.topNews.length > 0 ? `
          <!-- Top News -->
          <tr>
            <td style="padding:0 32px 20px;">
              <div style="font-size:14px; font-weight:800; color:#ffffff; margin-bottom:10px;">📰 주요 뉴스</div>
              ${p.topNews.slice(0, 3).map(n => `
              <div style="padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="font-size:12px; color:${n.sentiment === 'bullish' ? '#34d399' : n.sentiment === 'bearish' ? '#f87171' : '#94a3b8'};">●</span>
                <span style="font-size:13px; color:#e2e8f0; margin-left:6px;">${n.title || ''}</span>
                ${n.source ? `<span style="font-size:11px; color:#64748b; margin-left:6px;">${n.source}</span>` : ''}
              </div>
              `).join('')}
            </td>
          </tr>
          ` : ""}

          ${p.recentTransactions && p.recentTransactions.length > 0 ? `
          <!-- Recent Transactions -->
          <tr>
            <td style="padding:0 32px 20px;">
              <div style="font-size:14px; font-weight:800; color:#ffffff; margin-bottom:10px;">📊 최근 실거래</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;">
                ${p.recentTransactions.slice(0, 3).map(tx => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:6px 0; color:#cbd5e1;">${tx.address || ''}</td>
                  <td style="padding:6px 8px; color:#6ee7b7; text-align:right; font-weight:700; white-space:nowrap;">${typeof tx.transaction_price === 'number' ? (tx.transaction_price >= 100000000 ? `${(tx.transaction_price / 100000000).toFixed(1)}억` : `${(tx.transaction_price / 10000).toFixed(0)}만`) : (tx.transaction_price || '')}</td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- Poll Teaser -->
          ${p.poll?.question ? `
          <tr>
            <td style="padding:0 32px 24px;">
              <div style="background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.15); border-radius:14px; padding:20px;">
                <div style="font-size:13px; font-weight:800; color:#a78bfa; margin-bottom:8px;">📊 이번 주 투표</div>
                <div style="font-size:14px; font-weight:700; color:#ffffff; margin-bottom:12px;">${p.poll.question}</div>
                <a href="${p.magazineUrl}" target="_blank" style="display:inline-block; background:#7c3aed; color:#ffffff; padding:10px 20px; border-radius:8px; text-decoration:none; font-size:12px; font-weight:700;">지금 투표하기 →</a>
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- Tax Clinic -->
          ${p.taxClinic?.question ? `
          <tr>
            <td style="padding:0 32px 24px;">
              <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.12); border-radius:14px; padding:20px;">
                <div style="font-size:13px; font-weight:800; color:#f59e0b; margin-bottom:8px;">💰 세무·법률 클리닉</div>
                <div style="font-size:13px; font-weight:700; color:#fbbf24; margin-bottom:8px;">Q. ${p.taxClinic.question}</div>
                <div style="font-size:12px; color:#94a3b8; line-height:1.7;">${(p.taxClinic.answer || '').slice(0, 200)}${(p.taxClinic.answer || '').length > 200 ? '...' : ''}</div>
                ${p.taxClinic.source ? `<div style="font-size:10px; color:#64748b; margin-top:8px;">📎 ${p.taxClinic.source}</div>` : ''}
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- One-Page Image Preview -->
          ${p.imageUrl ? `
          <tr>
            <td style="padding:0 32px 32px; text-align:center;">
              <div style="border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); margin-bottom:12px;">
                <a href="${p.magazineUrl}" target="_blank">
                  <img src="${p.imageUrl}" alt="매거진 요약 카드" style="width:100%; height:auto; display:block;" />
                </a>
              </div>
              <div style="font-size:12px; color:#64748b;">이미지를 클릭하시면 전체 매거진 웹 뷰어로 이동합니다.</div>
            </td>
          </tr>
          ` : ""}

          <!-- Footer -->
          <tr>
            <td style="padding:28px 32px; background-color:#0d1017; border-top:1px solid rgba(255,255,255,0.06); text-align:center;">
              <div style="font-size:14px; font-weight:800; color:#ffffff; margin-bottom:4px;">${p.brokerName}</div>
              <div style="font-size:12px; color:#64748b; margin-bottom:16px;">CRE DealCard 전문 상업용 부동산 인텔리전스</div>
              <div style="font-size:11px; color:#475569;">
                본 메일은 수신 동의를 하신 고객님께 발송되었습니다.<br>
                더 이상 수신을 원치 않으시면 담당 중개사에게 문의해 주세요.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
