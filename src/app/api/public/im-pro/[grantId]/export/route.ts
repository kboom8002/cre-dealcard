import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

function buildProHtmlExport(doc: any, grant: any, options: { watermarkText: string, broker: any }): string {
  const sectionsHtml = (doc.sections || [])
    .map((s: any) => `<section class="im-section">
  <h2>${escapeHtml(s.title)}</h2>
  <div class="section-content">${markdownToHtml(s.markdown)}</div>
</section>`)
    .join('\n');

  let rentRollHtml = '';
  if (doc.floorLeases && doc.floorLeases.length > 0) {
    rentRollHtml = `
      <section class="im-section">
        <h2>📋 호실별 렌트롤 (상세)</h2>
        <div class="section-content">
          <table>
            <thead>
              <tr>
                <th>층</th>
                <th>업종분류</th>
                <th>보증금(만원)</th>
                <th>월세(만원)</th>
              </tr>
            </thead>
            <tbody>
              ${doc.floorLeases.map((t: any) => `
                <tr>
                  <td>${escapeHtml(t.floor || '-')}</td>
                  <td>${escapeHtml(t.tenant_type || t.industry || '-')}</td>
                  <td>${t.deposit_manwon?.toLocaleString() || '-'}</td>
                  <td>${t.rent_manwon?.toLocaleString() || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
  
  let loanSimulationHtml = '';
  if (doc.loanSimulation) {
    loanSimulationHtml = `
      <section class="im-section">
        <h2>금융 시뮬레이션</h2>
        <div class="section-content">
          <table>
            <thead>
              <tr>
                <th>항목</th>
                <th>금액/비율</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(doc.loanSimulation).map(([key, value]) => `
                <tr>
                  <td>${escapeHtml(key)}</td>
                  <td>${escapeHtml(String(value))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
  
  let taxScenariosHtml = '';
  if (doc.taxScenarios) {
    taxScenariosHtml = `
      <section class="im-section">
        <h2>세금 시나리오</h2>
        <div class="section-content">
          <table>
            <thead>
              <tr>
                <th>항목</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(doc.taxScenarios).map(([key, value]) => `
                <tr>
                  <td>${escapeHtml(key)}</td>
                  <td>${escapeHtml(String(value))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

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
      ${escapeHtml(options.broker.company)} &nbsp;·&nbsp; ${escapeHtml(options.broker.phone)}
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
  const { grantId } = await params;
  const format = req.nextUrl.searchParams.get('format');
  if (format === 'pptx') {
    return NextResponse.redirect(new URL(`/api/public/im-pro/${grantId}/pptx`, req.url));
  }

  const supabase = createServiceClient();

  const { data: grant } = await supabase
    .from('im_pro_grants')
    .select('*, building_id, requester_name, requester_phone, nda_signed_at, pdf_export_allowed, watermark_seed, expires_at')
    .eq('id', grantId)
    .eq('status', 'active')
    .maybeSingle();

  if (!grant) return NextResponse.json({ error: 'Grant not found or inactive' }, { status: 404 });
  if (!grant.nda_signed_at) return NextResponse.json({ error: 'NDA signing required' }, { status: 403 });
  if (grant.pdf_export_allowed === false) return NextResponse.json({ error: 'PDF export not permitted for this grant' }, { status: 403 });
  if (new Date(grant.expires_at) < new Date()) return NextResponse.json({ error: 'Grant expired' }, { status: 410 });

  let buildingId: string | null = grant.building_id || null;
  if (!buildingId && grant.deal_id) {
    const { data: deal } = await supabase
      .from('deals')
      .select('asset_id')
      .eq('id', grant.deal_id)
      .maybeSingle();
    buildingId = deal?.asset_id || null;
  }

  const { data: doc } = await supabase
    .from('document_objects')
    .select('*')
    .eq('building_id', buildingId || grant.building_id)
    .eq('document_type', 'mobile_im_lite')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const bodyContent = doc?.body || {};
  
  const timestamp = new Date().toISOString().slice(0, 16);
  const phoneLast4 = (grant.requester_phone || '0000').slice(-4);
  const watermarkText = `${grant.requester_name} \u00b7 ${phoneLast4} \u00b7 ${timestamp}`;

  const html = buildProHtmlExport(bodyContent, grant, {
    watermarkText,
    broker: { displayName: '담당 중개인', company: '크리딜 파트너스', phone: '010-0000-0000' } // Should dynamically load broker info in future
  });

  await supabase.from('activity_events').insert({
    event_type: 'im_pro_pdf_exported',
    grant_id: grantId,
    building_id: grant.building_id,
    actor_name: grant.requester_name,
    metadata: { exportedAt: new Date().toISOString(), userAgent: req.headers.get('user-agent') },
  });

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
