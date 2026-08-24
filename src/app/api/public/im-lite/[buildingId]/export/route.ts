/**
 * GET /api/public/im-lite/[buildingId]/export?format=html&doc_id=...
 * Exports Mobile IM as printable HTML / PDF.
 * PDF generation is done client-side via window.print().
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

function escapeHtml(s: string): string {
  if (!s) return '';
  return s
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
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const rows = tableLines.filter((l) => !l.match(/^\|[\s-|]+\|$/));
    if (rows.length === 0) { inTable = false; tableLines = []; return; }
    const [header, ...body] = rows;
    const parseRow = (r: string) => r.split('|').slice(1, -1).map((c) => c.trim());
    const headers = parseRow(header);
    out.push('<div class="table-container"><table>');
    out.push('<thead><tr>' + headers.map((h) => `<th>${inlineMarkdown(h)}</th>`).join('') + '</tr></thead>');
    out.push('<tbody>');
    body.forEach((row) => {
      out.push('<tr>' + parseRow(row).map((c) => `<td>${inlineMarkdown(c)}</td>`).join('') + '</tr>');
    });
    out.push('</tbody></table></div>');
    inTable = false;
    tableLines = [];
  };

  const flushList = () => {
    if (inList && listType) {
      out.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  };

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('|')) {
      flushList();
      inTable = true;
      tableLines.push(line);
      continue;
    }
    if (inTable) flushTable();

    if (line.startsWith('### ')) {
      flushList();
      out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      flushList();
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      flushList();
      out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('> ')) {
      flushList();
      out.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList || listType !== 'ul') {
        flushList();
        out.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      out.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (!inList || listType !== 'ol') {
        flushList();
        out.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      const itemText = line.replace(/^\d+\.\s+/, '');
      out.push(`<li>${inlineMarkdown(itemText)}</li>`);
    } else if (line === '') {
      flushList();
    } else {
      flushList();
      const cleaned = line.replace(/\s*###\s*/g, ' ').replace(/\s*##\s*/g, ' ');
      out.push(`<p>${inlineMarkdown(cleaned)}</p>`);
    }
  }
  if (inTable) flushTable();
  flushList();
  return out.join('\n');
}

interface BrokerInfo {
  displayName: string;
  company: string;
  phone: string;
  licenseNumber: string;
  specialty: string;
}

function buildHtmlExport({
  buildingId,
  title,
  content,
  building,
  brokerInfo,
  generatedAt,
}: {
  buildingId: string;
  title: string;
  content: any;
  building: any;
  brokerInfo: BrokerInfo;
  generatedAt: string;
}): string {
  const sections = (content?.sections ?? []) as Array<any>;
  const heroCard = content?.heroCard || {};
  const photoUrls = (content?.photoUrls || []).slice(0, 4);
  const ancillaryIncomes = content?.ancillaryIncomes;
  const incomeScenarios = content?.incomeScenarios;

  const getConfidenceBadge = (confidence?: string, sectionType?: string) => {
    if (sectionType === 'next_steps' || sectionType === 'disclaimer') return '';
    if (confidence === 'confirmed') return '✅ 공부확인';
    if (confidence === 'inferred') return '⚙️ AI추정';
    if (confidence === 'needs_check') return '⚠️ 확인필요';
    return '';
  };

  const getGradeColor = (grade: string) => {
    if (grade.includes('A')) return '#059669';
    if (grade.includes('B')) return '#2563eb';
    if (grade.includes('C')) return '#d97706';
    if (grade.includes('D')) return '#dc2626';
    return '#2563eb';
  };

  const archetype = heroCard.assetType || building?.asset_type || '상업용 빌딩';
  const region = heroCard.areaSignal || building?.area_signal || '핵심 권역';
  const askingPrice = heroCard.askingPriceDisplay || building?.price_band || '별도문의';
  const capRate = heroCard.capRateBase ? `${heroCard.capRateBase}%` : (content?.financials?.capRate ? `${content.financials.capRate}%` : '-');
  const area = heroCard.grossAreaPyeong ? `${heroCard.grossAreaPyeong}평` : (heroCard.areaPyeong ? `${heroCard.areaPyeong}평` : '-');
  const vacancy = heroCard.vacancy || (content?.financials?.vacancyPct != null ? `${content.financials.vacancyPct}%` : '-');
  const grade = heroCard.grade || content?.readiness_grade || 'A등급';

  const sectionHtml = sections
    .filter((s) => !(content?.hiddenSections || []).includes(s.section_type || s.sectionId))
    .map(
      (s) => {
        const confBadge = s.confidence ? `<span class="confidence-badge">${getConfidenceBadge(s.confidence, s.section_type)}</span>` : '';
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
        ${photoUrls.map((url: string) => `<img src="${escapeHtml(url)}" alt="현장 사진" />`).join('\n        ')}
      </div>
    `;
  }

  let ancillaryHtml = '';
  if (ancillaryIncomes && Array.isArray(ancillaryIncomes) && ancillaryIncomes.length > 0) {
    ancillaryHtml = `
      <section class="im-section">
        <div class="section-header"><h2>부가 수익 구조</h2></div>
        <div class="section-content">
          <div class="table-container">
            <table>
              <thead><tr><th>항목</th><th>연간 금액</th><th>비고</th></tr></thead>
              <tbody>
                ${ancillaryIncomes.map((item: any) => `
                  <tr>
                    <td>${escapeHtml(item.label || item.type || '')}</td>
                    <td>${item.annualAmountKrw ? item.annualAmountKrw.toLocaleString() + '원' : '-'}</td>
                    <td>${escapeHtml(item.note || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  let scenariosHtml = '';
  if (incomeScenarios && Array.isArray(incomeScenarios) && incomeScenarios.length > 0) {
    scenariosHtml = `
      <section class="im-section">
        <div class="section-header"><h2>수익 시나리오 분석</h2></div>
        <div class="section-content">
          <div class="table-container">
            <table>
              <thead><tr><th>시나리오</th><th>예상 수익률</th><th>설명</th></tr></thead>
              <tbody>
                ${incomeScenarios.map((sc: any) => `
                  <tr>
                    <td>${escapeHtml(sc.name || '')}</td>
                    <td>${sc.yieldPct ? sc.yieldPct + '%' : '-'}</td>
                    <td>${escapeHtml(sc.description || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  const brokerMetaParts = [
    brokerInfo.company,
    brokerInfo.phone,
    brokerInfo.licenseNumber,
    brokerInfo.specialty
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — CREDEAL 투자설명서</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;600;700;800;900&family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Pretendard', 'Noto Sans KR', -apple-system, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      font-size: 10pt;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      max-width: 210mm;
      margin: 0 auto;
      padding: 16mm 14mm;
      background: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    }
    .brand-header {
      font-size: 11pt;
      font-weight: 800;
      color: #059669;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    .header {
      border-bottom: 2px solid #059669;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 20pt;
      font-weight: 900;
      color: #0f172a;
      line-height: 1.3;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .data-grade-badge, .archetype-badge {
      font-size: 9.5pt;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 700;
    }
    .data-grade-badge {
      background: #ecfdf5;
      color: ${getGradeColor(grade)};
      border: 1px solid currentColor;
    }
    .archetype-badge {
      background: #0f172a;
      color: #fff;
    }
    .header .meta {
      color: #64748b;
      font-size: 8.5pt;
      display: flex;
      gap: 12px;
    }
    
    .hero-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #059669;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 24px;
    }
    .hero-badge {
      font-size: 11pt;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .hero-grid .metric {
      background: #fff;
      border: 1px solid #e2e8f0;
      padding: 10px 8px;
      border-radius: 8px;
      text-align: center;
    }
    .hero-grid .metric .label {
      display: block;
      font-size: 8pt;
      color: #64748b;
      margin-bottom: 2px;
    }
    .hero-grid .metric .value {
      display: block;
      font-size: 12pt;
      font-weight: 800;
      color: #0f172a;
    }
    
    .photo-gallery {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .photo-gallery img {
      width: 100%;
      height: 160px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    
    .im-section {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .im-section .section-header {
      margin-bottom: 10px;
      page-break-after: avoid;
    }
    .im-section h2 {
      font-size: 13pt;
      font-weight: 800;
      color: #0f172a;
      border-left: 3px solid #059669;
      padding-left: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .confidence-badge {
      font-size: 8.5pt;
      font-weight: 600;
      background: #f1f5f9;
      color: #475569;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
    }
    .boundary-note {
      font-size: 8pt;
      color: #94a3b8;
      font-style: italic;
      margin-top: 8px;
    }
    
    .section-content {
      font-size: 9.5pt;
      color: #334155;
    }
    .section-content p {
      margin-bottom: 8px;
      line-height: 1.6;
    }
    .section-content h3 {
      font-size: 10.5pt;
      font-weight: 700;
      color: #0f172a;
      margin: 12px 0 6px;
      page-break-after: avoid;
    }
    .table-container {
      margin: 12px 0;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .section-content table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    .section-content th {
      text-align: left;
      padding: 8px 10px;
      background: #f8fafc;
      border-bottom: 1px solid #cbd5e1;
      font-weight: 700;
      color: #334155;
    }
    .section-content td {
      padding: 7px 10px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }
    .section-content tr:last-child td {
      border-bottom: none;
    }
    .section-content tr:nth-child(even) td {
      background: #fafafa;
    }
    .section-content strong {
      font-weight: 700;
      color: #0f172a;
    }
    .section-content blockquote {
      border-left: 3px solid #059669;
      padding: 8px 12px;
      background: #f0fdf4;
      margin: 10px 0;
      font-size: 8.5pt;
      color: #166534;
      border-radius: 0 6px 6px 0;
    }
    .section-content ul, .section-content ol {
      padding-left: 18px;
      margin: 8px 0;
    }
    .section-content li {
      margin-bottom: 4px;
      line-height: 1.5;
    }
    
    .footer {
      margin-top: 32px;
      padding-top: 18px;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      page-break-inside: avoid;
    }
    .broker-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #059669;
      padding: 12px 14px;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .broker-card .broker-title {
      font-size: 7.5pt;
      font-weight: 700;
      color: #059669;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .broker-card strong {
      display: block;
      font-size: 11pt;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .broker-card .broker-meta {
      font-size: 8.5pt;
      color: #475569;
    }
    
    .qr-section {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-left: 16px;
    }
    .qr-section img {
      width: 72px;
      height: 72px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .qr-section span {
      font-size: 7.5pt;
      font-weight: 700;
      color: #0f172a;
    }
    
    .no-print {
      display: block;
      background: #059669;
      color: #fff;
      font-weight: 800;
      padding: 12px 20px;
      text-align: center;
      cursor: pointer;
      border: none;
      font-size: 11pt;
      width: 100%;
      margin-bottom: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(5,150,105,0.25);
      transition: all 0.15s ease;
    }
    .no-print:hover {
      background: #047857;
    }
    
    @media print {
      @page {
        size: A4 portrait;
        margin: 12mm 10mm;
      }
      .no-print { display: none !important; }
      body {
        font-size: 9.5pt;
        background: #fff;
      }
      .page {
        padding: 0;
        max-width: none;
        box-shadow: none;
      }
      .im-section {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .table-container {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .footer {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
<div class="page">
  <button class="no-print" onclick="window.print()">🖨️ PDF 다운로드 / 인쇄하기</button>
  <div class="header">
    <div class="brand-header">CREDEAL Mobile IM</div>
    <h1>
      ${escapeHtml(title)}
      <span class="data-grade-badge">${escapeHtml(grade)}</span>
      <span class="archetype-badge">${escapeHtml(archetype)}</span>
    </h1>
    <div class="meta">
      <span>CREDEAL 모바일 투자설명서</span>
      <span>작성일: ${new Date(generatedAt).toLocaleDateString('ko-KR')}</span>
      <span>대외비 (Confidential)</span>
    </div>
  </div>
  
  <div class="hero-card">
    <div class="hero-badge">${escapeHtml(archetype)} · ${escapeHtml(region)}</div>
    <div class="hero-grid">
      <div class="metric"><span class="label">매매 희망가</span><span class="value">${escapeHtml(askingPrice)}</span></div>
      <div class="metric"><span class="label">Cap Rate</span><span class="value">${escapeHtml(capRate)}</span></div>
      <div class="metric"><span class="label">연면적</span><span class="value">${escapeHtml(area)}</span></div>
      <div class="metric"><span class="label">공실률</span><span class="value">${escapeHtml(vacancy)}</span></div>
    </div>
  </div>

  ${photosHtml}

  ${sectionHtml}
  
  ${ancillaryHtml}
  
  ${scenariosHtml}

  <div class="footer">
    <div style="flex: 1;">
      <div class="broker-card">
        <div class="broker-title">담당 공인중개사</div>
        <strong>${escapeHtml(brokerInfo.displayName)}</strong>
        <div class="broker-meta">
          ${brokerMetaParts.length > 0 ? brokerMetaParts.map(escapeHtml).join(' &nbsp;·&nbsp; ') : '크리딜 공인중개사 네트워크'}
        </div>
      </div>
      <p>본 문서는 공공데이터 및 입력 정보를 바탕으로 생성된 투자설명서입니다. 실제 거래 전 독립적인 법률·세무·기술 실사를 권장합니다.</p>
      <p style="margin-top:6px; color:#94a3b8;">Generated by CREDEAL Mobile IM · All rights reserved.</p>
    </div>
    <div class="qr-section">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://credeal.net/im-lite/${buildingId}" alt="QR Code" />
      <span>모바일 뷰어 열기</span>
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

  const { data: doc, error } = await supabase
    .from('document_objects')
    .select('id, title, body, created_at, owner_id')
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

  const ownerId = building?.owner_id || doc.owner_id;

  const brokerInfo: BrokerInfo = {
    displayName: '담당 공인중개사',
    company: '',
    phone: '',
    licenseNumber: '',
    specialty: '',
  };

  if (ownerId) {
    const [profRes, brokerProfRes] = await Promise.all([
      supabase.from('profiles').select('display_name, company, phone').eq('id', ownerId).maybeSingle(),
      supabase.from('broker_profiles').select('license_number, specialty_assets, specialty_regions').eq('user_id', ownerId).maybeSingle(),
    ]);

    if (profRes.data?.display_name && profRes.data.display_name !== '.') {
      brokerInfo.displayName = profRes.data.display_name;
    }
    if (profRes.data?.company) brokerInfo.company = profRes.data.company;
    if (profRes.data?.phone) brokerInfo.phone = profRes.data.phone;
    if (brokerProfRes.data?.license_number) {
      brokerInfo.licenseNumber = `등록번호: ${brokerProfRes.data.license_number}`;
    }
    if (brokerProfRes.data?.specialty_assets && Array.isArray(brokerProfRes.data.specialty_assets) && brokerProfRes.data.specialty_assets.length > 0) {
      brokerInfo.specialty = `전문: ${brokerProfRes.data.specialty_assets.join(', ')}`;
    }
  }

  const content = doc.body as any;

  const html = buildHtmlExport({
    buildingId,
    title: doc.title ?? 'CREDEAL 모바일 투자설명서',
    content,
    building,
    brokerInfo,
    generatedAt: (content?.generated_at as string) ?? doc.created_at,
  });

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
