import type { DealcardPackage } from './banding-engine';

export interface RenderedDealcardHtml {
  html: string;
  title: string;
  packageHash: string;
}

export function renderDealcardHtml(pkg: DealcardPackage): RenderedDealcardHtml {
  const rentRollHtml = pkg.rentRollSummary
    ? `
    <div class="rent-roll-box" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:14px; margin:16px 0;">
      <div style="font-weight:700; color:#334155; font-size:13px; margin-bottom:4px;">임대차 현황 요약</div>
      <div style="font-size:14px; font-weight:600; color:#0f172a;">${pkg.rentRollSummary.bandedUnitCount} · ${pkg.rentRollSummary.occupancyStatus}</div>
      ${pkg.rentRollSummary.physicalVacancyBand ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">${pkg.rentRollSummary.physicalVacancyBand}</div>` : ''}
      ${pkg.rentRollSummary.tenantIndustryMix && pkg.rentRollSummary.tenantIndustryMix.length > 0 ? `
      <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
        ${pkg.rentRollSummary.tenantIndustryMix.map((t) => `<span style="background:#e2e8f0; color:#334155; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:500;">${t}</span>`).join('')}
      </div>` : ''}
    </div>`
    : '';

  const proFormaHtml = pkg.proFormaVacancy?.hasUpside
    ? `
    <div class="pro-forma-box" style="background:#fef3c7; border:1px solid #f59e0b; border-radius:12px; padding:16px; margin:16px 0;">
      <div style="font-weight:700; color:#b45309; font-size:13px;">⚡ 만실 정상화(Pro-forma) 업사이드 기회</div>
      <div style="font-size:15px; font-weight:800; color:#92400e; margin-top:4px;">
        현재 ${pkg.proFormaVacancy.currentCapRateBand} ➔ 정상화 시 ${pkg.proFormaVacancy.stabilizedCapRateBand} (${pkg.proFormaVacancy.upsideCapRateBand})
      </div>
      <div style="font-size:12px; color:#78350f; margin-top:4px;">${pkg.proFormaVacancy.vacantSpaceSummary}</div>
    </div>`
    : '';

  const valueAddHtml = pkg.valueAddSummary?.strategies && pkg.valueAddSummary.strategies.length > 0
    ? `
    <div class="value-add-box" style="background:#f0fdf4; border:1px solid #86efac; border-radius:12px; padding:16px; margin:16px 0;">
      <div style="font-weight:700; color:#166534; font-size:13px;">⭐ 밸류애드 핵심 포인트</div>
      <ul style="margin:8px 0 0 0; padding-left:18px; font-size:13px; color:#15803d;">
        ${pkg.valueAddSummary.strategies.map((s) => `<li>${s}</li>`).join('\n        ')}
      </ul>
    </div>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>[티저] ${pkg.bandedLocation} 상업용 부동산</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
    .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
    .title { font-size: 22px; font-weight: 700; margin: 0 0 12px 0; }
    .price { font-size: 26px; font-weight: 800; color: #1e3a8a; margin: 16px 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; background: #f1f5f9; padding: 16px; border-radius: 12px; }
    .grid-item { font-size: 14px; }
    .grid-label { color: #64748b; margin-bottom: 4px; }
    .grid-val { font-weight: 600; }
    .highlights { margin: 20px 0; padding-left: 20px; }
    .highlights li { font-size: 14px; margin-bottom: 8px; color: #334155; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">블라인드 티저</div>
    <h1 class="title">${pkg.bandedLocation}</h1>
    <div class="price">${pkg.bandedPrice}</div>
    <div class="grid">
      <div class="grid-item">
        <div class="grid-label">토지 규모</div>
        <div class="grid-val">${pkg.bandedLandArea}</div>
      </div>
      <div class="grid-item">
        <div class="grid-label">수익성</div>
        <div class="grid-val">${pkg.bandedYield ?? '유선 문의'}</div>
      </div>
    </div>${rentRollHtml}${proFormaHtml}${valueAddHtml}
    <ul class="highlights">
      ${pkg.highlights.map((h) => `<li>${h}</li>`).join('\n      ')}
    </ul>
    <div class="footer">
      <div>식별 해시: ${pkg.packageHash.slice(0, 16)}...</div>
      <div>본 정보는 소유자 및 중개인의 사전 동의 하에 블라인드 처리된 티저입니다.</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return {
    html,
    title: `[티저] ${pkg.bandedLocation}`,
    packageHash: pkg.packageHash,
  };
}

