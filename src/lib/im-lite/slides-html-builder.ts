function escapeHtml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSlidesHtmlExport(params: {
  buildingId: string;
  title: string;
  content: any;
  building: any;
  brokerInfo: {
    displayName: string;
    company?: string;
    phone?: string;
    officeAddress?: string;
    licenseNumber?: string;
  };
  generatedAt?: string;
  qrDataUri?: string;
}): string {
  const { title, content, building, brokerInfo, generatedAt, qrDataUri } = params;
  const ssot = content?.ssot_summary ?? {};
  const hero = content?.heroCard ?? {};
  const addr = ssot.address || content?.resolved_address || building?.address || '-';
  const askPrice = hero.askingPriceDisplay || ssot.price_band || '가격 협의';
  const grossYield = hero.grossYieldPct != null ? `${Number(hero.grossYieldPct).toFixed(2)}%` : '-';
  const gfaSqm = Number(ssot.total_gross_area_sqm ?? building?.total_area_sqm ?? 0);
  const landSqm = Number(ssot.land_area_sqm ?? building?.land_area_sqm ?? 0);
  const zoning = ssot.zoning || building?.zoning || '-';
  const leases = Array.isArray(content?.floor_leases) ? content.floor_leases : [];
  const expectedLeases = Array.isArray(content?.expected_rent_roll) ? content.expected_rent_roll : [];
  const points: any[] = Array.isArray(content?.axios_highlights) && content.axios_highlights.length > 0
    ? content.axios_highlights
    : (Array.isArray(hero?.keyPoints) ? hero.keyPoints.map((kp: any) => ({ headline: String(kp), brief: '' })) : []);
  const photos: any[] = Array.isArray(content?.photos_v2) && content.photos_v2.length > 0
    ? content.photos_v2
    : (Array.isArray(content?.photos) ? content.photos : []);

  const parseFloorRank = (rawFloor: unknown): number => {
    const s = String(rawFloor ?? '').trim().toUpperCase();
    if (!s || /합계|총계|소계/.test(s)) return -9999;
    const baseMatch = s.match(/^(?:B|지하\s*)(\d+)/);
    if (baseMatch) return -Number(baseMatch[1]);
    const negMatch = s.match(/^-(\d+)$/);
    if (negMatch) return -Number(negMatch[1]);
    const roofMatch = s.match(/^(?:RF|옥상|루프탑)/);
    if (roofMatch) return 900;
    const aboveMatch = s.match(/^(\d+)\s*(?:F|층)?$/);
    if (aboveMatch) return Number(aboveMatch[1]);
    return -500;
  };

  const renderLeaseTable = (rows: any[], heading: string, note: string) => {
    const sorted = [...rows].sort((a, b) => parseFloorRank(b?.floor) - parseFloorRank(a?.floor));
    const pageSize = 12;
    const chunks: any[][] = [];
    if (sorted.length === 0) {
      chunks.push([]);
    } else {
      for (let i = 0; i < sorted.length; i += pageSize) {
        chunks.push(sorted.slice(i, i + pageSize));
      }
    }

    return chunks
      .map((chunk, pageIdx) => {
        const pageSuffix = chunks.length > 1 ? ` (${pageIdx + 1}/${chunks.length})` : '';
        const bodyRows = chunk
          .map((r: any) => {
            const floor = escapeHtml(String(r.floor ?? '-'));
            const tenant = escapeHtml(String(r.tenant_name ?? r.tenantName ?? r.tenant ?? '-'));
            const dep = Number(r.deposit_manwon ?? r.depositManwon ?? 0);
            const rent = Number(r.rent_manwon ?? r.monthlyRentManwon ?? 0);
            const mgmt = Number(r.mgmt_fee_manwon ?? r.managementFeeManwon ?? 0);
            const area = Number(r.leasable_area_sqm ?? r.area_sqm ?? r.leasableAreaSqm ?? 0);
            return `<tr>
        <td>${floor}</td>
        <td style="text-align:left;font-weight:700;">${tenant}</td>
        <td>${area > 0 ? `${area.toFixed(1)}㎡` : '-'}</td>
        <td>${dep > 0 ? `${dep.toLocaleString()}만` : '-'}</td>
        <td>${rent > 0 ? `${rent.toLocaleString()}만` : '-'}</td>
        <td>${mgmt > 0 ? `${mgmt.toLocaleString()}만` : '-'}</td>
      </tr>`;
          })
          .join('');
        return `
      <section class="im-slide-page">
        <div class="slide-head"><span class="kicker">RENT ROLL</span><h2>${escapeHtml(heading + pageSuffix)}</h2></div>
        <div class="slide-body">
          <p class="sub-note">${escapeHtml(note)}</p>
          <table class="slide-table">
            <thead><tr><th>층</th><th>임차인</th><th>임대면적</th><th>보증금</th><th>월임대료</th><th>관리비</th></tr></thead>
            <tbody>${bodyRows || '<tr><td colspan="6">임대차 세부 내역은 실사 단계에서 확인됩니다.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="slide-foot"><span>${escapeHtml(brokerInfo.company || 'CREDEAL')}</span><span>${escapeHtml(addr)}</span></div>
      </section>
    `;
      })
      .join('');
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)} - 16:9 PDF Slides</title>
<style>
  @page { size: 13.333in 7.5in landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #E2E8F0; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #0F172A; }
  .im-slide-page {
    width: 1280px;
    height: 720px;
    background: #FAF9F5;
    margin: 16px auto;
    padding: 44px 56px 36px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    border: 1px solid #CBD5E1;
  }
  .im-slide-page.cover {
    background: #0F172A;
    color: #FFFFFF;
    border: none;
  }
  .slide-head { border-bottom: 2px solid #D97706; padding-bottom: 12px; margin-bottom: 18px; }
  .slide-head .kicker { display: block; font-size: 13px; font-weight: 800; letter-spacing: 0.12em; color: #B45309; margin-bottom: 4px; }
  .slide-head h2 { font-size: 28px; font-weight: 900; color: #0F172A; }
  .slide-body { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 16px; }
  .slide-foot { border-top: 1px solid #CBD5E1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 13px; color: #475569; font-weight: 600; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .kpi-box { background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 20px; }
  .kpi-box .lbl { font-size: 13px; font-weight: 700; color: #64748B; margin-bottom: 8px; }
  .kpi-box .val { font-size: 24px; font-weight: 900; color: #0F172A; }
  .point-card { background: #FFFFFF; border-left: 5px solid #1D4ED8; border-radius: 10px; padding: 14px 18px; border-top: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0; }
  .point-card h3 { font-size: 17px; font-weight: 800; color: #0F172A; margin-bottom: 4px; }
  .point-card p { font-size: 14px; color: #334155; line-height: 1.5; }
  .slide-table { width: 100%; border-collapse: collapse; background: #FFFFFF; font-size: 14px; }
  .slide-table th { background: #0F172A; color: #FFFFFF; padding: 10px 12px; font-weight: 800; border: 1px solid #CBD5E1; }
  .slide-table td { padding: 9px 12px; border: 1px solid #CBD5E1; text-align: center; color: #1E293B; }
  .sub-note { font-size: 13px; color: #475569; font-weight: 600; }
  .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .photo-grid img { width: 100%; height: 220px; object-fit: cover; border-radius: 10px; border: 1px solid #CBD5E1; }
  @media print { body { background: #FAF9F5; } .im-slide-page { margin: 0; border: none; } }
</style>
</head>
<body>
  <section class="im-slide-page cover">
    <div style="font-size:15px;font-weight:800;letter-spacing:0.16em;color:#F59E0B;">INVESTMENT MEMORANDUM</div>
    <div>
      <h1 style="font-size:44px;font-weight:900;line-height:1.25;margin-bottom:16px;">${escapeHtml(title)}</h1>
      <p style="font-size:20px;color:#CBD5E1;">${escapeHtml(addr)}</p>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #334155;padding-top:18px;font-size:15px;color:#E2E8F0;">
      <span>${escapeHtml([brokerInfo.company, brokerInfo.displayName, brokerInfo.phone].filter(Boolean).join(' · ') || 'CREDEAL')}</span>
      <span>${escapeHtml((generatedAt || new Date().toISOString()).slice(0, 10).replace(/-/g, '.'))}</span>
    </div>
  </section>

  <section class="im-slide-page">
    <div class="slide-head"><span class="kicker">EXECUTIVE SUMMARY</span><h2>핵심 투자 요약</h2></div>
    <div class="slide-body">
      <div class="kpi-grid">
        <div class="kpi-box"><div class="lbl">매각 희망가</div><div class="val">${escapeHtml(String(askPrice))}</div></div>
        <div class="kpi-box"><div class="lbl">현행 임대수익률</div><div class="val">${escapeHtml(grossYield)}</div></div>
        <div class="kpi-box"><div class="lbl">대지면적</div><div class="val">${landSqm > 0 ? `${landSqm.toLocaleString()}㎡` : '-'}</div></div>
        <div class="kpi-box"><div class="lbl">연면적</div><div class="val">${gfaSqm > 0 ? `${gfaSqm.toLocaleString()}㎡` : '-'}</div></div>
      </div>
      <div style="display:grid;gap:12px;">
        ${points.slice(0, 3).map((pt: any) => `
          <div class="point-card">
            <h3>${escapeHtml(String(pt.headline || ''))}</h3>
            ${pt.brief ? `<p>${escapeHtml(String(pt.brief))}</p>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
    <div class="slide-foot"><span>용도지역: ${escapeHtml(String(zoning))}</span><span>${escapeHtml(addr)}</span></div>
  </section>

  ${renderLeaseTable(leases, '층별 임대차 현황 (렌트롤)', '※ 현행 임대차 계약 현황 기준')}
  ${expectedLeases.length > 0 ? renderLeaseTable(expectedLeases, '기대수익률(추정수익률) 렌트롤', '※ 공실 해소·리모델링 완료 후 임대 전환 가정 기준') : ''}

  ${photos.length > 0 ? `
  <section class="im-slide-page">
    <div class="slide-head"><span class="kicker">GALLERY</span><h2>현장 사진</h2></div>
    <div class="slide-body">
      <div class="photo-grid">
        ${photos.slice(0, 6).map((p: any, idx: number) => `
          <div>
            <img src="${escapeHtml(String(p.url || ''))}" alt="${escapeHtml(String(p.caption || `현장 사진 ${idx + 1}`))}" />
            <p class="sub-note" style="margin-top:6px;">${escapeHtml(String(p.caption || `현장 사진 ${idx + 1}`))}</p>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="slide-foot"><span>${escapeHtml(brokerInfo.company || 'CREDEAL')}</span><span>${photos.length}컷 첨부</span></div>
  </section>` : ''}

  <section class="im-slide-page">
    <div class="slide-head"><span class="kicker">CONTACT &amp; DISCLAIMER</span><h2>문의 및 유의사항</h2></div>
    <div class="slide-body" style="justify-content:center;gap:24px;">
      <div class="kpi-box" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="lbl">담당 공인중개사</div>
          <div class="val" style="font-size:26px;margin-bottom:8px;">${escapeHtml(brokerInfo.displayName)}</div>
          <p class="sub-note">${escapeHtml([brokerInfo.company, brokerInfo.phone, brokerInfo.licenseNumber].filter(Boolean).join(' · '))}</p>
          ${brokerInfo.officeAddress ? `<p class="sub-note" style="margin-top:4px;">${escapeHtml(brokerInfo.officeAddress)}</p>` : ''}
        </div>
        ${qrDataUri ? `<img src="${qrDataUri}" alt="모바일 IM QR" style="width:110px;height:110px;border-radius:8px;" />` : ''}
      </div>
      <p class="sub-note">본 자료는 공공데이터 및 중개인 입력 정보를 바탕으로 작성되었으며, 최종 계약 전 공적장부 및 실사 자료를 확인하시기 바랍니다.</p>
    </div>
    <div class="slide-foot"><span>CREDEAL Mobile IM</span><span>${escapeHtml(addr)}</span></div>
  </section>
</body>
</html>`;
}
