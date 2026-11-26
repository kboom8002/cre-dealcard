import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limiter';
import { resolvePublishedImProDocument } from '@/app/api/public/im-pro/_lib/im-pro-doc-guard';
import {
  consumeProGrantDownload,
  resolveProGrantByAnyId,
  verifyProGrantViewerAccess,
} from '@/domain/gate/im-pro-grant-service';

interface ProExportBrokerInfo {
  displayName: string;
  representativeName: string;
  company: string;
  phone: string;
  registrationNo: string;
  officeAddress: string;
}

const STRUCTURED_LABELS_KO: Record<string, string> = {
  scenario: '시나리오',
  name: '시나리오명',
  label: '항목',
  title: '구분',
  entityType: '취득 주체',
  entity_type: '취득 주체',
  buyerType: '매수 주체',
  buyer_type: '매수 주체',
  acquisitionTaxRate: '취득세율',
  acquisition_tax_rate: '취득세율',
  acquisitionTax: '취득세',
  acquisitionTaxManwon: '취득세 (만원)',
  acquisition_tax_manwon: '취득세 (만원)',
  propertyTax: '보유세/재산세',
  property_tax_manwon: '보유세/재산세 (만원)',
  capitalGainsTax: '양도소득세',
  capital_gains_tax_manwon: '양도소득세 (만원)',
  estimatedTax: '예상 세액',
  effectiveTaxRate: '실효세율 (%)',
  netYieldAfterTax: '세후 수익률 (%)',
  annualAfterTaxCashFlow: '연 세후 현금흐름',
  ltv: 'LTV (%)',
  ltvPct: 'LTV (%)',
  ltv_pct: 'LTV (%)',
  loanAmount: '대출금액',
  loanAmountManwon: '대출금액 (만원)',
  loan_amount_manwon: '대출금액 (만원)',
  equityAmount: '자기자본',
  equityManwon: '실투자금 (만원)',
  equity_manwon: '실투자금 (만원)',
  interestRate: '대출 금리 (%)',
  interestRatePct: '대출 금리 (%)',
  interest_rate_pct: '대출 금리 (%)',
  annualInterest: '연 이자비용',
  annualInterestManwon: '연 이자비용 (만원)',
  annual_interest_manwon: '연 이자비용 (만원)',
  annualNoiManwon: '연 NOI (만원)',
  annual_noi_manwon: '연 NOI (만원)',
  leveredCashFlowManwon: '세전 현금흐름 (만원)',
  levered_cash_flow_manwon: '세전 현금흐름 (만원)',
  cashOnCashPct: 'Cash-on-Cash (%)',
  cash_on_cash_pct: 'Cash-on-Cash (%)',
  dscr: 'DSCR (배)',
  note: '비고',
  summary: '요약',
};

function formatStructuredKey(key: string): string {
  return STRUCTURED_LABELS_KO[key] || key;
}

function formatStructuredVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '-';
  if (typeof val === 'number') return Number.isFinite(val) ? val.toLocaleString() : '-';
  if (typeof val === 'boolean') return val ? '예' : '아니오';
  if (Array.isArray(val)) return val.map((v) => formatStructuredVal(v)).join(', ');
  if (typeof val === 'object') {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${formatStructuredKey(k)}: ${formatStructuredVal(v)}`)
      .join(' · ');
  }
  return String(val);
}

function renderStructuredSectionHtml(title: string, data: unknown): string {
  if (!data) return '';
  if (Array.isArray(data)) {
    if (data.length === 0) return '';
    const firstObj = data.find((r) => r && typeof r === 'object' && !Array.isArray(r)) as
      | Record<string, unknown>
      | undefined;
    if (firstObj) {
      const cols = Object.keys(firstObj);
      return `
      <section class="im-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="section-content">
          <table>
            <thead>
              <tr>
                ${cols.map((c) => `<th>${escapeHtml(formatStructuredKey(c))}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data
                .map((row) => {
                  const rec = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
                  return `<tr>${cols
                    .map((c) => `<td>${escapeHtml(formatStructuredVal(rec[c]))}</td>`)
                    .join('')}</tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </section>`;
    }
    return `
      <section class="im-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="section-content">
          <ul>
            ${data.map((item) => `<li>${escapeHtml(formatStructuredVal(item))}</li>`).join('')}
          </ul>
        </div>
      </section>`;
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return '';
    return `
      <section class="im-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="section-content">
          <table>
            <thead>
              <tr>
                <th>항목</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              ${entries
                .map(
                  ([key, value]) => `
                <tr>
                  <td>${escapeHtml(formatStructuredKey(key))}</td>
                  <td>${escapeHtml(formatStructuredVal(value))}</td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }
  return `
    <section class="im-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="section-content"><p>${escapeHtml(String(data))}</p></div>
    </section>`;
}

function buildProHtmlExport(
  doc: any,
  grant: any,
  options: { watermarkText: string; broker: ProExportBrokerInfo }
): string {
  const hiddenSectionSet = new Set<string>(
    [
      ...(Array.isArray(doc?.hidden_sections) ? doc.hidden_sections : []),
      ...(Array.isArray(doc?.hiddenSections) ? doc.hiddenSections : []),
    ]
      .filter((k: unknown) => k !== null && k !== undefined && String(k).trim() !== '')
      .map((k: unknown) => String(k).trim()),
  );
  const sectionsHtml = (doc?.sections || [])
    .filter((s: any) => {
      if (!s || s.hidden === true || s.is_hidden === true) return false;
      const candidateKeys = [s.id, s.section_id, s.sectionId, s.section_type, s.key]
        .filter((k: unknown) => k !== null && k !== undefined && String(k).trim() !== '')
        .map((k: unknown) => String(k).trim());
      return !candidateKeys.some((k) => hiddenSectionSet.has(k));
    })
    .map((s: any) => `<section class="im-section">
  <h2>${escapeHtml(s.title)}</h2>
  <div class="section-content">${markdownToHtml(s.markdown || s.content || '')}</div>
</section>`)
    .join('\n');

  const rawLeases: any[] =
    (Array.isArray(doc?.floorLeases) && doc.floorLeases.length > 0 && doc.floorLeases) ||
    (Array.isArray(doc?.floor_leases) && doc.floor_leases.length > 0 && doc.floor_leases) ||
    (Array.isArray(doc?.rentRoll) && doc.rentRoll.length > 0 && doc.rentRoll) ||
    (Array.isArray(doc?.rent_roll) && doc.rent_roll.length > 0 && doc.rent_roll) ||
    [];

  let rentRollHtml = '';
  if (rawLeases.length > 0) {
    const classifyOccupancy = (t: any): { isVacant: boolean; isOwnerUse: boolean; label: '공실' | '자가사용' | '임대중' } => {
      const isVacant = Boolean(
        t?.is_vacant ||
          t?.isVacant ||
          t?.status === 'vacant' ||
          t?.status === '공실' ||
          t?.lease_state === '공실' ||
          t?.occupancy_status === '공실' ||
          t?.use === '공실',
      );
      const isOwnerUse =
        !isVacant &&
        Boolean(
          t?.is_owner_use ||
            t?.isOwnerUse ||
            t?.status === 'owner' ||
            t?.status === 'owner_use' ||
            t?.status === '자가사용' ||
            t?.lease_state === '자가사용' ||
            t?.lease_state === 'owner_use' ||
            t?.occupancy_status === '자가사용' ||
            t?.occupancy_status === 'owner_use' ||
            t?.use === '자가사용' ||
            t?.use === '자가' ||
            t?.tenant_type === '자가사용' ||
            t?.tenantType === '자가사용',
        );
      return {
        isVacant,
        isOwnerUse,
        label: isVacant ? '공실' : isOwnerUse ? '자가사용' : '임대중',
      };
    };

    let totalDepositManwon = 0;
    let totalMonthlyRentManwon = 0;
    let vacantCount = 0;
    for (const t of rawLeases) {
      const occ = classifyOccupancy(t);
      if (occ.isVacant) {
        vacantCount += 1;
        continue;
      }
      if (occ.isOwnerUse) {
        continue;
      }
      const dep = Number(t?.deposit_manwon ?? t?.depositManwon ?? t?.deposit ?? 0);
      const rent = Number(
        t?.monthly_rent_manwon ??
          t?.monthlyRentManwon ??
          t?.rent_manwon ??
          t?.rentManwon ??
          t?.monthlyRent ??
          0,
      );
      if (Number.isFinite(dep)) totalDepositManwon += dep;
      if (Number.isFinite(rent)) totalMonthlyRentManwon += rent;
    }

    rentRollHtml = `
      <section class="im-section">
        <h2>📋 호실별 렌트롤 (상세)</h2>
        <div class="section-content">
          <table>
            <thead>
              <tr>
                <th>층</th>
                <th>업종분류</th>
                <th>전용면적(㎡)</th>
                <th>보증금(만원)</th>
                <th>월세(만원)</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              ${rawLeases
                .map((t: any) => {
                  const floor = t.floor ?? t.floorLabel ?? '-';
                  const bizType =
                    t.tenant_type ?? t.tenantType ?? t.industry ?? t.use ?? t.tenant_name ?? t.tenantName ?? '-';
                  const areaVal = t.area_sqm ?? t.areaSqm ?? t.exclusiveAreaSqm ?? t.area;
                  const depositVal = t.deposit_manwon ?? t.depositManwon ?? t.deposit;
                  const rentVal =
                    t.monthly_rent_manwon ??
                    t.monthlyRentManwon ??
                    t.rent_manwon ??
                    t.rentManwon ??
                    t.monthlyRent;
                  const occ = classifyOccupancy(t);
                  const fmtNum = (n: unknown) =>
                    n !== null && n !== undefined && Number.isFinite(Number(n))
                      ? Number(n).toLocaleString()
                      : '-';
                  return `
                <tr>
                  <td>${escapeHtml(String(floor))}</td>
                  <td>${escapeHtml(String(bizType))}</td>
                  <td>${escapeHtml(fmtNum(areaVal))}</td>
                  <td>${escapeHtml(fmtNum(depositVal))}</td>
                  <td>${escapeHtml(fmtNum(rentVal))}</td>
                  <td>${escapeHtml(occ.label)}</td>
                </tr>`;
                })
                .join('')}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>합계</strong></td>
                <td>${rawLeases.length}건</td>
                <td>-</td>
                <td><strong>${totalDepositManwon.toLocaleString()}</strong></td>
                <td><strong>${totalMonthlyRentManwon.toLocaleString()}</strong></td>
                <td>${vacantCount}실 공실</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    `;
  }

  const loanData =
    doc?.loanSimulation ?? doc?.loan_scenario ?? doc?.loanScenario ?? doc?.loan_simulation ?? null;
  const loanSimulationHtml = renderStructuredSectionHtml('금융 시뮬레이션', loanData);

  const taxData =
    doc?.taxScenarios ?? doc?.tax_scenarios ?? doc?.taxSimulation ?? doc?.tax_simulation ?? null;
  const taxScenariosHtml = renderStructuredSectionHtml('세금 시나리오', taxData);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.title || 'Pro IM')} — CONFIDENTIAL</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Noto Sans KR', sans-serif;
      background: #fff;
      color: #1a1a1a;
      font-size: 11pt;
      line-height: 1.6;
    }
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm 15mm; position: relative; }
    .header { border-bottom: 3px solid #8b5cf6; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 22pt; font-weight: 900; color: #1a1a1a; margin-bottom: 4px; }
    .header .meta { color: #666; font-size: 9pt; }
    .header .badge { background: #8b5cf6; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 9pt; vertical-align: middle; margin-left: 8px; }
    .confidential-bar { background: #1e1b4b; color: #fbbf24; text-align: center; padding: 8px; font-weight: bold; font-size: 10pt; margin-bottom: 20px; letter-spacing: 2px; }
    .im-section { margin-bottom: 24px; page-break-inside: avoid; }
    .im-section h2 { font-size: 13pt; font-weight: 700; color: #1a1a1a; border-left: 4px solid #8b5cf6; padding-left: 10px; margin-bottom: 12px; }
    .section-content { font-size: 10pt; z-index: 10; position: relative; }
    .section-content p { margin-bottom: 8px; }
    .section-content h3 { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin: 12px 0 6px; }
    .section-content table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9pt; background: rgba(255,255,255,0.9); }
    .section-content th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #1a1a1a; font-weight: 700; }
    .section-content td { padding: 5px 8px; border-bottom: 1px solid #e5e5e5; }
    .section-content strong { font-weight: 700; }
    .section-content blockquote { border-left: 3px solid #8b5cf6; padding: 6px 10px; background: #fafafa; margin: 8px 0; font-size: 9pt; color: #555; }
    .section-content ul { padding-left: 16px; margin: 6px 0; }
    .section-content li { margin-bottom: 3px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 8pt; color: #888; position: relative; z-index: 10; }
    .broker-card { background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #fbbf24; }
    .broker-card strong { display: block; font-size: 11pt; font-weight: 700; }
    .no-print { display: block; background: #8b5cf6; color: #fff; font-weight: 700; padding: 12px 24px; text-align: center; cursor: pointer; border: none; font-size: 12pt; width: 100%; margin-bottom: 20px; border-radius: 8px; }
    
    .watermark {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 1000;
      pointer-events: none;
      background: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 200px,
        rgba(0,0,0,0.03) 200px,
        rgba(0,0,0,0.03) 201px
      );
      overflow: hidden;
    }
    
    .watermark-grid {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      flex-wrap: wrap;
      overflow: hidden;
    }
    .watermark-cell {
      width: 250px;
      height: 150px;
      position: relative;
    }
    
    .watermark-text {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 11pt;
      color: rgba(0,0,0,0.06);
      white-space: nowrap;
      font-family: 'Noto Sans KR', sans-serif;
      pointer-events: none;
    }

    @media print {
      @page { size: A4; margin: 15mm 10mm; }
      .no-print { display: none !important; }
      body { font-size: 10pt; margin: 0; padding: 0; }
      .page { padding: 0; max-width: none; }
      .im-section { page-break-inside: avoid; page-break-after: auto; }
      .section-content table { page-break-inside: avoid; }
      .footer { page-break-inside: avoid; }
      .watermark { position: fixed !important; display: block !important; }
      .watermark-text { color: rgba(0,0,0,0.05) !important; }
    }
  </style>
</head>
<body>
<div class="watermark">
  <div class="watermark-grid">
    ${Array(60).fill(`<div class="watermark-cell"><div class="watermark-text">${escapeHtml(options.watermarkText)}</div></div>`).join('')}
  </div>
</div>
<div class="page">
  <button class="no-print" onclick="window.print()">🖨️ PDF 다운로드 (워터마크 포함)</button>
  <div class="confidential-bar">STRICTLY CONFIDENTIAL</div>
  <div class="header">
    <h1>${escapeHtml(doc.title || 'Pro IM Document')} <span class="badge">PRO</span></h1>
    <div class="meta">크리딜 Mobile IM Pro &nbsp;|&nbsp; NDA 체결 완료 &nbsp;|&nbsp; 수신: ${escapeHtml(grant.requester_name)}</div>
  </div>
  
  ${rentRollHtml}
  ${loanSimulationHtml}
  ${taxScenariosHtml}
  ${sectionsHtml}
  
  <div class="footer">
    <div class="broker-card">
      <strong>${escapeHtml(options.broker.displayName)}</strong>
      ${[
        options.broker.company ? `상호: ${escapeHtml(options.broker.company)}` : '',
        options.broker.representativeName ? `대표자: ${escapeHtml(options.broker.representativeName)}` : '',
        options.broker.registrationNo ? `등록번호: ${escapeHtml(options.broker.registrationNo)}` : '',
        options.broker.officeAddress ? `소재지: ${escapeHtml(options.broker.officeAddress)}` : '',
        options.broker.phone ? `연락처: ${escapeHtml(options.broker.phone)}` : '',
      ]
        .filter(Boolean)
        .join(' &nbsp;·&nbsp; ')}
    </div>
    <p>본 문서는 기밀유지협약(NDA)에 따라 보호되는 기밀 정보입니다. 무단 유출 시 법적 책임을 질 수 있습니다.</p>
    <p style="margin-top:8px;color:#bbb;">Generated by 크리딜 Mobile IM Pro · Confidential</p>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text: string): string {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function markdownToHtml(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const out: string[] = [];
  let inTable = false;
  let tableLines: string[] = [];

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const rows = tableLines.filter((l) => !l.match(/^\|[\s-|]+\|$/));
    if (rows.length === 0) { inTable = false; tableLines = []; return; }
    const [header, ...body] = rows;
    const parseRow = (r: string) => r.split('|').slice(1, -1).map((c) => c.trim());
    const headers = parseRow(header);
    out.push('<table>');
    out.push('<thead><tr>' + headers.map((h) => `<th>${inlineMarkdown(h)}</th>`).join('') + '</tr></thead>');
    out.push('<tbody>');
    body.forEach((row) => {
      out.push('<tr>' + parseRow(row).map((c) => `<td>${inlineMarkdown(c)}</td>`).join('') + '</tr>');
    });
    out.push('</tbody></table>');
    inTable = false; tableLines = [];
  };

  for (const line of lines) {
    if (line.startsWith('|')) { inTable = true; tableLines.push(line); continue; }
    if (inTable) flushTable();
    if (line.startsWith('### ')) { out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`); }
    else if (line.startsWith('## ')) { out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`); }
    else if (line.startsWith('> ')) { out.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); }
    else if (line.startsWith('- ') || line.startsWith('* ')) { out.push(`<li>${inlineMarkdown(line.slice(2))}</li>`); }
    else if (line.trim() === '') { out.push('<br>'); }
    else { out.push(`<p>${inlineMarkdown(line)}</p>`); }
  }
  if (inTable) flushTable();
  return out.join('\n');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ grantId: string }> }
) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown';
  const rateAllowed = await checkRateLimit(clientIp, 'im_pro_export', 30, 60_000);
  if (!rateAllowed) {
    return NextResponse.json(
      {
        ok: false,
        code: 'RATE_LIMITED',
        error: '요청이 일시적으로 많습니다. 잠시 후 다시 시도해 주세요.',
      },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const { grantId } = await params;
  const format = req.nextUrl.searchParams.get('format');
  if (format === 'pptx') {
    const pptxUrl = new URL(`/api/public/im-pro/${grantId}/pptx`, req.url);
    req.nextUrl.searchParams.forEach((value, key) => {
      if (key !== 'format') pptxUrl.searchParams.set(key, value);
    });
    return NextResponse.redirect(pptxUrl);
  }

  const supabase = createServiceClient();

  const resolved = await resolveProGrantByAnyId(supabase, grantId, {
    allowBuildingLookup: false,
  });
  const grant = resolved.grant && resolved.grant.status === 'active' ? resolved.grant : null;

  if (!grant) return NextResponse.json({ error: 'Grant not found or inactive' }, { status: 404 });
  if (grant.is_revoked === true) return NextResponse.json({ error: 'Grant revoked' }, { status: 403 });
  if (!grant.nda_signed_at) return NextResponse.json({ error: 'NDA signing required' }, { status: 403 });
  if (grant.pdf_export_allowed === false) return NextResponse.json({ error: 'PDF export not permitted for this grant' }, { status: 403 });
  if (grant.expires_at && new Date(grant.expires_at) < new Date()) return NextResponse.json({ error: 'Grant expired' }, { status: 410 });

  const access = await verifyProGrantViewerAccess(req, grant);
  if (!access.ok) {
    return NextResponse.json(
      {
        error: access.error || 'Grant token required',
        code: access.code || 'GRANT_TOKEN_REQUIRED',
      },
      { status: access.status || 403 },
    );
  }

  const effectiveGrantId = String(grant.id || grantId);
  const maxDownloads =
    typeof grant.max_downloads === 'number' && Number.isFinite(grant.max_downloads) && grant.max_downloads > 0
      ? grant.max_downloads
      : 5;
  const grantDownloadCount =
    typeof grant.download_count === 'number' && Number.isFinite(grant.download_count) && grant.download_count >= 0
      ? grant.download_count
      : 0;

  let eventCount = 0;
  try {
    const aeTable: any = supabase.from('activity_events');
    if (aeTable && typeof aeTable.select === 'function') {
      const { count } = await aeTable
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', effectiveGrantId)
        .in('event_type', ['im_pro_pptx_exported', 'im_pro_pdf_exported']);
      eventCount = count ?? 0;
    }
  } catch {
    eventCount = 0;
  }

  const effectiveUsed = Math.max(grantDownloadCount, eventCount);
  if (effectiveUsed >= maxDownloads) {
    return NextResponse.json(
      {
        error: '다운로드 횟수 초과',
        limit: maxDownloads,
        used: effectiveUsed,
      },
      { status: 429 },
    );
  }

  let buildingId: string | null = grant.building_id || resolved.buildingId || null;
  if (!buildingId && grant.deal_id) {
    try {
      const { data: deal } = await supabase
        .from('deals')
        .select('asset_id')
        .eq('id', grant.deal_id)
        .maybeSingle();
      buildingId = deal?.asset_id || null;
    } catch {
      buildingId = null;
    }
  }

  const targetBuildingId = buildingId || grant.building_id;
  const docGuard = await resolvePublishedImProDocument({
    supabase,
    buildingId: targetBuildingId || '',
    quickLookupId: grant.building_id || targetBuildingId,
  });
  if (!docGuard.ok) {
    return NextResponse.json({ error: docGuard.error }, { status: docGuard.status });
  }
  const doc = docGuard.doc;
  const bodyContent = doc?.body || {};

  // P-H2 & P0-4: 브로커 5대 법정 표시 정보 동적 조회 (profiles + broker_profiles + doc.body fallback)
  const docBroker = (bodyContent?.broker_contact || bodyContent?.basicImDocument?.facts?.brokerOffice || {}) as Record<string, any>;
  const ownerId = doc?.broker_id ?? doc?.owner_id;
  let brokerInfo: ProExportBrokerInfo = {
    displayName: String(docBroker.brokerName || docBroker.name || '').trim() || '담당 공인중개사',
    representativeName: String(docBroker.representativeName || docBroker.representative_name || docBroker.representative || '').trim(),
    company: String(docBroker.brokerageName || docBroker.company || '').trim(),
    phone: String(docBroker.brokerPhone || docBroker.phone || '').trim(),
    registrationNo: String(docBroker.registrationNo || docBroker.registration_no || docBroker.office_reg_number || '').trim(),
    officeAddress: String(docBroker.officeAddress || docBroker.office_address || docBroker.address || '').trim(),
  };
  if (ownerId) {
    const { data: bp } = await supabase
      .from('profiles')
      .select('display_name, company, phone')
      .eq('id', ownerId)
      .maybeSingle();
    let brokerMeta: any = null;
    try {
      const resMeta = await supabase
        .from('broker_profiles')
        .select('office_reg_number, license_number, office_address, representative_name')
        .eq('user_id', ownerId)
        .maybeSingle();
      if (!resMeta.error) {
        brokerMeta = resMeta.data;
      } else {
        const resFallback = await supabase
          .from('broker_profiles')
          .select('office_reg_number, license_number')
          .eq('user_id', ownerId)
          .maybeSingle();
        brokerMeta = resFallback.data;
      }
    } catch {
      brokerMeta = null;
    }

    if (bp || brokerMeta) {
      const repName = String(
        brokerMeta?.representative_name || brokerInfo.representativeName || ''
      ).trim();
      brokerInfo = {
        displayName: bp?.display_name || brokerInfo.displayName || '담당 공인중개사',
        representativeName: repName,
        company: bp?.company || brokerInfo.company,
        phone: bp?.phone || brokerInfo.phone,
        registrationNo:
          brokerMeta?.office_reg_number || brokerInfo.registrationNo,
        officeAddress: brokerMeta?.office_address || brokerInfo.officeAddress,
      };
    }
  }
  
  // Atomic download quota consumption BEFORE HTML rendering so 429 aborts early
  const quotaRes = await consumeProGrantDownload(
    supabase,
    effectiveGrantId,
    maxDownloads,
    effectiveUsed,
  );
  if (!quotaRes.ok) {
    return NextResponse.json(
      { error: quotaRes.error || '다운로드 횟수 초과', limit: quotaRes.limit, used: quotaRes.used },
      { status: 429 },
    );
  }

  const timestamp = new Date().toISOString().slice(0, 16);
  const phoneLast4 = (grant.requester_phone || '0000').slice(-4);
  const watermarkText = `${grant.requester_name} \u00b7 ${phoneLast4} \u00b7 ${timestamp}`;

  const html = buildProHtmlExport(bodyContent, grant, {
    watermarkText,
    broker: brokerInfo,
  });

  try {
    await supabase.from('activity_events').insert({
      event_type: 'im_pro_pdf_exported',
      entity_type: 'im_pro_grant',
      entity_id: effectiveGrantId,
      building_ssot_lite_id: grant.building_id || targetBuildingId || null,
      metadata: {
        grant_id: effectiveGrantId,
        actor_name: grant.requester_name || '',
        exportedAt: new Date().toISOString(),
        userAgent: req.headers.get('user-agent')
      },
      source_app: 'web'
    });
  } catch {
    // Non-blocking audit logging
  }

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
