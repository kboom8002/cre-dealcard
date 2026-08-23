export interface ViewerSection {
  title: string;
  section_type: string;
  markdown: string;
}

export interface ViewerParams {
  buildingTitle: string;
  sections: ViewerSection[];
  heroCard: any;
  posture: string;
}

const deficiencyKeywords = ['확인 필요', '확인필요', '미확정', '미제출', '미첨부', '오기', '정정', '불일치', '추정', '가정'];

function markdownToHtml(md: string): string {
  // 간단한 마크다운 파서 (실제 환경에서는 marked 등의 라이브러리 권장)
  let html = md;
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Lists
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/<\/li>\n<li>/g, '</li><li>');
  html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
  return html;
}

function getHeroMetricsHtml(posture: string): string {
  // Posture별 메트릭 정의
  let metrics = '';
  switch (posture) {
    case 'income':
      metrics = `
        <div class="metric"><span class="label">매매가</span><span class="value">-</span></div>
        <div class="metric"><span class="label">연 순수익률 (Cap Rate)</span><span class="value">-</span></div>
        <div class="metric"><span class="label">실투자금</span><span class="value">-</span></div>
        <div class="metric"><span class="label">정상화 수익률</span><span class="value">-</span></div>`;
      break;
    case 'development':
      metrics = `
        <div class="metric"><span class="label">매매가</span><span class="value">-</span></div>
        <div class="metric"><span class="label">총사업비</span><span class="value">-</span></div>
        <div class="metric"><span class="label">용도지역</span><span class="value">-</span></div>
        <div class="metric"><span class="label">용적률</span><span class="value">-</span></div>`;
      break;
    case 'operating':
      metrics = `
        <div class="metric"><span class="label">매매가</span><span class="value">-</span></div>
        <div class="metric"><span class="label">실질 영업이익 (GOP) Cap Rate</span><span class="value">-</span></div>
        <div class="metric"><span class="label">ADR/OCC</span><span class="value">-</span></div>
        <div class="metric"><span class="label">RevPAR</span><span class="value">-</span></div>`;
      break;
    case 'owner_occupied':
      metrics = `
        <div class="metric"><span class="label">매매가</span><span class="value">-</span></div>
        <div class="metric"><span class="label">전용률</span><span class="value">-</span></div>
        <div class="metric"><span class="label">주차</span><span class="value">-</span></div>
        <div class="metric"><span class="label">점유비용</span><span class="value">-</span></div>`;
      break;
    case 'trading':
      metrics = `
        <div class="metric"><span class="label">매매가</span><span class="value">-</span></div>
        <div class="metric"><span class="label">목표 매각가</span><span class="value">-</span></div>
        <div class="metric"><span class="label">예상 수익률</span><span class="value">-</span></div>`;
      break;
    default:
      metrics = `<div class="metric"><span class="label">매매가</span><span class="value">-</span></div>`;
  }
  return metrics;
}

function checkDeficiency(markdown: string): boolean {
  return deficiencyKeywords.some(keyword => markdown.includes(keyword));
}

export function generateMobileImViewerHtml(params: ViewerParams): string {
  const { buildingTitle, sections, posture } = params;

  let sectionsHtml = '';
  sections.forEach((sec, index) => {
    const hasDeficiency = checkDeficiency(sec.markdown);
    const badgeHtml = hasDeficiency
      ? `<span class="badge warning">&#x26a0; 확인 필요</span>`
      : `<span class="badge success">&#x2713; 자료 확보</span>`;

    sectionsHtml += `
      <div class="section-accordion">
        <div class="section-header">
          <div class="section-title-wrapper">
            <span class="section-marker">${index + 1}</span>
            <span class="section-title">${sec.title}</span>
          </div>
          ${badgeHtml}
        </div>
        <div class="section-content">
          ${markdownToHtml(sec.markdown)}
        </div>
      </div>
    `;
  });

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\${buildingTitle} - 모바일 IM</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
    body {
      font-family: 'Pretendard', sans-serif;
      background-color: #0a0a0a; /* bg-neutral-950 */
      color: #f5f5f5;
    }
    .hero-card {
      background: #171717;
      border-radius: 12px;
      padding: 20px;
      margin: 16px;
      border: 1px solid #262626;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 16px;
    }
    .metric {
      display: flex;
      flex-direction: column;
    }
    .metric .label {
      font-size: 12px;
      color: #a3a3a3;
    }
    .metric .value {
      font-size: 16px;
      font-weight: bold;
      color: #ffffff;
    }
    .section-accordion {
      background: #171717;
      margin: 12px 16px;
      border-radius: 8px;
      border: 1px solid #262626;
      overflow: hidden;
    }
    .section-header {
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #262626;
    }
    .section-title-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-marker {
      background: #404040;
      color: #fff;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }
    .section-title {
      font-weight: 600;
    }
    .badge {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
    }
    .badge.success { background: #064e3b; color: #34d399; }
    .badge.warning { background: #451a03; color: #fbbf24; }
    .section-content {
      padding: 16px;
      font-size: 14px;
      line-height: 1.6;
      color: #d4d4d4;
    }
    .section-content ul {
      padding-left: 20px;
      list-style-type: disc;
    }
    .section-content strong {
      color: #ffffff;
    }
    .section-content blockquote {
      border-left: 3px solid #525252;
      padding-left: 10px;
      color: #a3a3a3;
      margin: 10px 0;
    }
    .broker-card {
      background: #171717;
      padding: 20px;
      margin: 24px 16px;
      border-radius: 12px;
      text-align: center;
      border: 1px solid #262626;
    }
    .cta-button {
      display: block;
      background: #3b82f6;
      color: white;
      text-align: center;
      padding: 14px;
      border-radius: 8px;
      font-weight: bold;
      text-decoration: none;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="max-w-md mx-auto min-h-screen relative pb-6">
    <div class="p-4 text-center border-b border-neutral-800">
      <h1 class="text-xl font-bold">\${buildingTitle}</h1>
    </div>

    <div class="hero-card">
      <h2 class="text-lg font-bold mb-2">핵심 투자 조건</h2>
      <div class="metrics-grid">
        \${getHeroMetricsHtml(posture)}
      </div>
    </div>

    <div class="sections-container mt-6">
      \${sectionsHtml}
    </div>

    <div class="broker-card">
      <h3 class="text-base font-bold mb-1">담당 브로커</h3>
      <p class="text-sm text-neutral-400 mb-4">자세한 사항은 담당자에게 문의바랍니다.</p>
      <a href="tel:010-0000-0000" class="cta-button">전화로 문의하기</a>
    </div>
  </div>
</body>
</html>`;

  return html;
}
