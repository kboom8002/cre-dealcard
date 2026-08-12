/**
 * GET /api/public/im-lite/[buildingId]/export?format=html&doc_id=...
 * Exports Mobile IM as printable HTML.
 * PDF generation is done client-side via window.print().
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function markdownToHtml(md: string): string {
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

function buildHtmlExport({
  buildingId,
  title,
  content,
  building,
  brokerProfile,
  generatedAt,
  tier
}: {
  buildingId: string;
  title: string;
  content: any;
  building: any;
  brokerProfile: any;
  generatedAt: string;
  tier: 'basic' | 'pro';
}): string {
  const sections = (content?.sections ?? []) as Array<any>;
  const heroCard = content?.heroCard || {};
  const photoUrls = (content?.photoUrls || []).slice(0, 4);
  const ancillaryIncomes = content?.ancillaryIncomes;
  const incomeScenarios = content?.incomeScenarios;

  const getConfidenceBadge = (confidence?: string) => {
    if (confidence === 'confirmed') return '✅ 공부확인';
    if (confidence === 'inferred') return '⚙️ AI추정';
    if (confidence === 'needs_check') return '⚠️ 확인필요';
    return '';
  };

  const getGradeColor = (grade: string) => {
    if (grade.includes('A')) return '#2e7d32';
    if (grade.includes('B')) return '#1976d2';
    if (grade.includes('C')) return '#ed6c02';
    if (grade.includes('D')) return '#d32f2f';
    return '#1976d2';
  };

  const archetype = heroCard.assetType || building?.asset_type || '건물';
  const region = heroCard.areaSignal || building?.area_signal || '지역';
  const askingPrice = heroCard.askingPriceDisplay || building?.price_band || '별도문의';
  const capRate = heroCard.capRateBase ? `${heroCard.capRateBase}%` : '-';
  const area = heroCard.grossAreaPyeong ? `${heroCard.grossAreaPyeong}평` : (heroCard.areaPyeong ? `${heroCard.areaPyeong}평` : '-');
  const vacancy = heroCard.vacancy || '-';
  const grade = heroCard.grade || 'B등급';

  const sectionHtml = sections
    .map(
      (s) => {
        const confBadge = s.confidence ? `<span class="confidence-badge">${getConfidenceBadge(s.confidence)}</span>` : '';
        const boundaryNote = (s.boundary_note || s.confidence_note) ? `<div class="boundary-note">ℹ️ ${escapeHtml(s.boundary_note || s.confidence_note)}</div>` : '';
        return `<section class="im-section">
  <div class="section-header">
    <h2>${escapeHtml(s.title)} ${confBadge}</h2>
  </div>
  <div class="section-content">${markdownToHtml(s.markdown)}</div>
  ${boundaryNote}
</section>`;
      }
    )
    .join('\n');

  let photosHtml = '';
  if (photoUrls.length > 0) {
    photosHtml = `
      <div class="photo-gallery">
        ${photoUrls.map((url: string) => `<img src="${escapeHtml(url)}" style="max-width:100%; max-height:200px; object-fit:cover; border-radius:8px;" />`).join('\n        ')}
      </div>
    `;
  }

  let ancillaryHtml = '';
  if (ancillaryIncomes && Array.isArray(ancillaryIncomes) && ancillaryIncomes.length > 0) {
    ancillaryHtml = `
      <section class="im-section">
        <div class="section-header"><h2>부가 수익</h2></div>
        <div class="section-content">
          <table>
            <thead><tr><th>항목</th><th>금액</th><th>참고</th></tr></thead>
            <tbody>
              ${ancillaryIncomes.map(item => `
                <tr>
                  <td>${escapeHtml(item.label || item.type || '')}</td>
                  <td>${item.annualAmountKrw ? item.annualAmountKrw.toLocaleString() + '원' : '-'}</td>
                  <td>${escapeHtml(item.note || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  let scenariosHtml = '';
  if (incomeScenarios && Array.isArray(incomeScenarios) && incomeScenarios.length > 0) {
    scenariosHtml = `
      <section class="im-section">
        <div class="section-header"><h2>수익 시나리오</h2></div>
        <div class="section-content">
          <table>
            <thead><tr><th>시나리오</th><th>예상 수익률</th><th>설명</th></tr></thead>
            <tbody>
              ${incomeScenarios.map(sc => `
                <tr>
                  <td>${escapeHtml(sc.name || '')}</td>
                  <td>${sc.yieldPct ? sc.yieldPct + '%' : '-'}</td>
                  <td>${escapeHtml(sc.description || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  const brokerName = brokerProfile?.display_name || '담당 중개인';
  const brokerCompany = brokerProfile?.company_name || '';
  const brokerPhone = brokerProfile?.phone || '';
  const brokerSpecialty = brokerProfile?.specialty || '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Mobile IM Lite</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Noto Sans KR', sans-serif;
      background: #fdfdfd;
      color: #1a1a1a;
      font-size: 11pt;
      line-height: 1.6;
    }
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm 15mm; background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
    .brand-header { font-size: 14pt; font-weight: 900; color: #1a1a1a; margin-bottom: 12px; }
    .header { border-bottom: 3px solid #c8ff00; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 24pt; font-weight: 900; color: #1a1a1a; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .data-grade-badge, .archetype-badge { font-size: 11pt; padding: 4px 8px; border-radius: 6px; font-weight: 700; }
    .data-grade-badge { background: #f0f4f8; color: ${getGradeColor(grade)}; border: 1px solid currentColor; }
    .archetype-badge { background: #1a1a1a; color: #fff; }
    .header .meta { color: #666; font-size: 9pt; }
    
    .hero-card { background: #f8f9fa; border-left: 4px solid #c8ff00; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .hero-badge { font-size: 12pt; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .hero-badge .grade-badge { font-size: 10pt; color: ${getGradeColor(grade)}; background: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid currentColor; }
    .hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .hero-grid .metric { background: #fff; padding: 12px; border-radius: 6px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .hero-grid .metric .label { display: block; font-size: 9pt; color: #666; margin-bottom: 4px; }
    .hero-grid .metric .value { display: block; font-size: 14pt; font-weight: 700; color: #1a1a1a; }
    
    .photo-gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px; page-break-inside: avoid; }
    
    .im-section { margin-bottom: 32px; page-break-inside: avoid; }
    .im-section .section-header { margin-bottom: 12px; }
    .im-section h2 { font-size: 14pt; font-weight: 700; color: #1a1a1a; border-left: 4px solid #c8ff00; padding-left: 10px; display: flex; align-items: center; gap: 8px; }
    .confidence-badge { font-size: 10pt; font-weight: 500; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; border: 1px solid #ddd; }
    .boundary-note { font-size: 8pt; color: #999; font-style: italic; margin-top: 12px; }
    
    .section-content { font-size: 10.5pt; }
    .section-content p { margin-bottom: 10px; }
    .section-content h3 { font-size: 11pt; font-weight: 700; color: #333; margin: 16px 0 8px; }
    .section-content table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 9.5pt; }
    .section-content th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #1a1a1a; background: #f8f9fa; font-weight: 700; }
    .section-content td { padding: 8px 12px; border-bottom: 1px solid #e5e5e5; }
    .section-content tr:nth-child(even) td { background: #fafafa; }
    .section-content strong { font-weight: 700; color: #000; }
    .section-content blockquote { border-left: 4px solid #c8ff00; padding: 10px 14px; background: #fafafa; margin: 12px 0; font-size: 9.5pt; color: #555; }
    .section-content ul { padding-left: 20px; margin: 8px 0; }
    .section-content li { margin-bottom: 4px; }
    
    .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e5e5; font-size: 8.5pt; color: #777; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; }
    .broker-card { background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #1a1a1a; }
    .broker-card strong { display: block; font-size: 12pt; font-weight: 700; color: #000; margin-bottom: 4px; }
    
    .qr-section { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .qr-section img { width: 80px; height: 80px; border-radius: 8px; }
    .qr-section span { font-size: 8pt; font-weight: 700; color: #1a1a1a; }
    
    .no-print { display: block; background: #c8ff00; color: #000; font-weight: 700; padding: 14px 24px; text-align: center; cursor: pointer; border: none; font-size: 12pt; width: 100%; margin-bottom: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(200,255,0,0.3); transition: transform 0.1s; }
    .no-print:active { transform: translateY(2px); }
    
    @media print {
      @page { size: A4; margin: 15mm 10mm; }
      .no-print { display: none !important; }
      body { font-size: 10pt; margin: 0; padding: 0; background: #fff; }
      .page { padding: 0; max-width: none; box-shadow: none; }
      .im-section { page-break-inside: avoid; page-break-after: auto; }
      .section-content table { page-break-inside: avoid; }
      .footer { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
<div class="page">
  <button class="no-print" onclick="window.print()">🖨️ PDF로 저장 (인쇄)</button>
  <div class="header">
    <div class="brand-header">${tier === 'pro' ? '크리딜 Pro' : '크리딜 Basic'}</div>
    <h1>
      ${escapeHtml(title)}
      <span class="data-grade-badge">${escapeHtml(grade)}</span>
      <span class="archetype-badge">${escapeHtml(archetype)}</span>
    </h1>
    <div class="meta">크리딜 Mobile IM Lite &nbsp;|&nbsp; AI 생성: ${new Date(generatedAt).toLocaleDateString('ko-KR')} &nbsp;|&nbsp; ${tier === 'pro' ? '기밀 — 내부 열람용' : '기초 정보'}</div>
  </div>
  
  <div class="hero-card">
    <div class="hero-badge">${escapeHtml(archetype)} · ${escapeHtml(region)} <span class="grade-badge">[${escapeHtml(grade)}]</span></div>
    <div class="hero-grid">
      <div class="metric"><span class="label">매매가</span><span class="value">${escapeHtml(askingPrice)}</span></div>
      <div class="metric"><span class="label">Cap Rate</span><span class="value">${escapeHtml(capRate)}</span></div>
      <div class="metric"><span class="label">연면적</span><span class="value">${escapeHtml(area)}</span></div>
      <div class="metric"><span class="label">공실</span><span class="value">${escapeHtml(vacancy)}</span></div>
    </div>
  </div>

  ${photosHtml}

  ${sectionHtml}
  
  ${ancillaryHtml}
  
  ${scenariosHtml}

  <div class="footer">
    <div style="flex: 1; padding-right: 20px;">
      <div class="broker-card">
        <strong>${escapeHtml(brokerName)}</strong>
        ${escapeHtml(brokerCompany)} &nbsp;·&nbsp; ${escapeHtml(brokerPhone)} ${brokerSpecialty ? `&nbsp;·&nbsp; ${escapeHtml(brokerSpecialty)}` : ''}
      </div>
      <p>이 문서는 AI가 생성한 참고용 자료입니다. 실제 투자 결정 전 전문가 자문을 받으시기 바랍니다.</p>
      ${tier === 'basic' ? '<p style="margin-top:8px; font-weight: bold; color: #d32f2f;">본 문서는 Basic 버전으로 일부 상세 데이터(수익 분석, DCF 등)가 생략되어 있습니다.</p>' : ''}
      <p style="margin-top:8px;color:#bbb;">Generated by 크리딜 Mobile IM Lite · Confidential</p>
    </div>
    <div class="qr-section">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://cre-dealcard.vercel.app/im-lite/${buildingId}" />
      <span>모바일에서 보기</span>
    </div>
  </div>
</div>
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get('doc_id');

  if (!docId) {
    return NextResponse.json({ error: 'doc_id is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const tier = (searchParams.get('tier') || 'basic') as 'basic' | 'pro';
  const grantId = searchParams.get('grant_id');

  // Pro tier 보호
  if (tier === 'pro') {
    if (!grantId) return NextResponse.json({ error: 'grant_id required for pro export' }, { status: 400 });
    const { data: grant } = await supabase
      .from('im_pro_grants')
      .select('status, expires_at')
      .eq('id', grantId)
      .eq('building_id', buildingId)
      .maybeSingle();
    if (!grant || grant.status !== 'active' || (grant.expires_at && new Date(grant.expires_at) < new Date())) {
      return NextResponse.json({ error: 'Invalid or expired grant' }, { status: 403 });
    }
  }

  const { data: doc, error } = await supabase
    .from('document_objects')
    .select('id, title, body, created_at')
    .eq('id', docId)
    .eq('building_id', buildingId)
    .maybeSingle();

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('owner_id, area_signal, asset_type, price_band')
    .eq('id', buildingId)
    .maybeSingle();

  let brokerProfile = null;
  if (building?.owner_id) {
    const { data: profile } = await supabase
      .from('broker_profiles')
      .select('display_name, company_name, phone, specialty, slug')
      .eq('user_id', building.owner_id)
      .maybeSingle();
    brokerProfile = profile;
  }

  const content = doc.body as any;


  const html = buildHtmlExport({
    buildingId,
    title: doc.title ?? 'Mobile IM Lite',
    content,
    building,
    brokerProfile,
    generatedAt: (content?.generated_at as string) ?? doc.created_at,
    tier,
  });

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

