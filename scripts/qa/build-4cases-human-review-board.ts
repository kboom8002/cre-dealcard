/**
 * @file scripts/qa/build-4cases-human-review-board.ts
 * @description Phase 4: Builds the self-contained Human 2nd 20-Minute Review Package:
 *  - docs/finaltest/GOLDEN_4CASES_HUMAN_REVIEW_BOARD.html (visual inspection board with lightbox)
 *  - docs/finaltest/GOLDEN_4CASES_HUMAN_REVIEW_REPORT.md (10-min visual + 10-min 2-case spot checklist)
 *
 * Usage: npx tsx scripts/qa/build-4cases-human-review-board.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_ROOT = path.join(ROOT, 'e2e', 'golden-snapshots', 'out', 'golden-4cases-ppgt');
const DOCS_OUT = path.join(ROOT, 'docs', 'finaltest');
const MANIFEST_PATH = path.join(OUT_ROOT, 'fullfunnel-manifest.json');
const R3_AUDIT_PATH = path.join(OUT_ROOT, 'r3-layer-d-audit.json');
const R2_REPORT_PATH = path.join(OUT_ROOT, 'r2-unified-scorecard.json');

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDataUri(filePath: string | undefined): string {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const buf = fs.readFileSync(filePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest: ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const r2Report = fs.existsSync(R2_REPORT_PATH)
    ? JSON.parse(fs.readFileSync(R2_REPORT_PATH, 'utf-8'))
    : null;
  const r3Audit = fs.existsSync(R3_AUDIT_PATH)
    ? JSON.parse(fs.readFileSync(R3_AUDIT_PATH, 'utf-8'))
    : null;

  const finalReport = r3Audit?.blendedReport ?? r2Report;
  const subOrder = ['dealcard', 'im', 'newsletter', 'inbox'] as const;
  const subNames: Record<string, string> = {
    dealcard: '딜카드 (DealCard)',
    im: '투자설명서 (IM)',
    newsletter: '부동산뉴스 (Newsletter)',
    inbox: '고객 소통함 (Inbox)',
  };

  const caseMeta: Record<string, { title: string; subtitle: string; keySlides: Array<[number, string]> }> = {
    'CASE-02': {
      title: 'CASE-02 · 서초구 서초동 1364-28 (법인사옥형 · TSV)',
      subtitle: '230억 · 자가사용 2개층 + 공실 1개층(20.0%) · 현황 1.70% → 안정화 3.52% · 원단위 자동보정',
      keySlides: [
        [1, '01 요약'],
        [2, '02 물건 개요'],
        [5, '05 층별 임대차 현황'],
        [7, '07 수익률'],
      ],
    },
    'CASE-03': {
      title: 'CASE-03 · 서초구 잠원동 26-14 외 1 (신축·개발형 · 다필지 TSV)',
      subtitle: '242억 2,680만 원 · 2필지 · 대지↔연면적 스왑 복구 · 현황 1.37% → 안정화 4.14%',
      keySlides: [
        [1, '01 요약'],
        [4, '04 다필지 토지 정보'],
        [5, '05 층별 임대차 현황'],
        [7, '07 수익률'],
      ],
    },
    'CASE-04': {
      title: 'CASE-04 · 영등포구 당산동5가 11-47 (수익형 · XLSX v1.5 ㎡ · 15호실)',
      subtitle: '115억 · 15호실 2장 분할 · 통합계약/전세/렌트프리/비임대 · 현황 2.75% → 안정화 3.83%',
      keySlides: [
        [1, '01 요약'],
        [5, '05 임대차 현황 (1/2)'],
        [6, '06 임대차 현황 (2/2)'],
        [8, '08 수익률'],
      ],
    },
    'CASE-05': {
      title: 'CASE-05 · 영등포구 양평동4가 117 외 2 (수익형 · XLSX v1.5 평 · 10F 세로외관)',
      subtitle: '250억 · 3필지 · G9=평 자동환산 + V12 차단게이트 · 현황 2.54% → 안정화 3.38%',
      keySlides: [
        [0, '표지 (1줄 정리)'],
        [2, '02 물건 개요 (세로 외관)'],
        [5, '05 층별 임대차 현황'],
        [7, '07 수익률'],
        [9, '09 내부 사진 (캡션 정합)'],
      ],
    },
  };

  // Build HTML cards
  const scoreCardsHtml = subOrder
    .map((id) => {
      const r2 = finalReport?.subsystems?.[id];
      const r3 = finalReport?.r3Audit?.subsystems?.[id];
      const score = r3 ? r3.blendedEffective100 : r2?.effectiveScore100 ?? 0;
      const r2Score = r2?.effectiveScore100 ?? 0;
      const floor = r3 ? r3.effectiveFloorRisk : (r2?.floorRiskCount ?? 0) > 0;
      const pass = score >= 90 && !floor;
      return `
        <div class="card score-card ${pass ? 'pass' : 'fail'}">
          <div class="sub-label">${esc(subNames[id])}</div>
          <div class="big-score">${score.toFixed(1)}<span>/100</span></div>
          <div class="meta-line">R2 결정론 ${r2Score.toFixed(1)} ${r3 ? `· R3 ${r3.r3Linear100.toFixed(1)}` : ''} · 과락 ${floor ? 'YES' : '0건'}</div>
          <div class="badge ${pass ? 'badge-pass' : 'badge-fail'}">${pass ? 'PASS (90+)' : 'REMEDIATE'}</div>
        </div>
      `;
    })
    .join('\n');

  const casesHtml = (['CASE-02', 'CASE-03', 'CASE-04', 'CASE-05'] as const)
    .map((cid) => {
      const rec = manifest.caseRecords[cid];
      const meta = caseMeta[cid];
      if (!rec) return '';
      const slideImgs: string[] = rec.pptxSlideImages ?? [];
      const slideCards = meta.keySlides
        .map(([idx, label]) => {
          const uri = toDataUri(slideImgs[idx]);
          if (!uri) return '';
          return `
            <figure class="thumb-card" onclick="openLightbox('${uri}', '${esc(cid + ' - ' + label)}')">
              <img src="${uri}" alt="${esc(label)}" loading="lazy" />
              <figcaption>${esc(label)}</figcaption>
            </figure>
          `;
        })
        .join('\n');

      const imLiteLabel =
        cid === 'CASE-02' || cid === 'CASE-04'
          ? '비공개 IM 전용 링크 보호 게이트 (390 xlarge)'
          : '모바일 /im-lite (390 xlarge)';
      const mobileCards = [
        ['모바일 /dc (390 xlarge)', rec.screenshots?.dcMobile],
        ['카카오 2×2 OG', rec.screenshots?.dcKakaoOg],
        [imLiteLabel, rec.screenshots?.imLiteMobile],
      ]
        .map(([label, fp]) => {
          const uri = toDataUri(fp as string | undefined);
          if (!uri) return '';
          return `
            <figure class="thumb-card mobile-thumb" onclick="openLightbox('${uri}', '${esc(cid + ' - ' + label)}')">
              <img src="${uri}" alt="${esc(label)}" loading="lazy" />
              <figcaption>${esc(label)}</figcaption>
            </figure>
          `;
        })
        .join('\n');

      const oracleBadges = (rec.oracleChecks?.details ?? [])
        .map((d: string) => {
          const ok = d.endsWith('=true');
          return `<span class="pill ${ok ? 'pill-ok' : 'pill-err'}">${ok ? '✓' : '✕'} ${esc(d)}</span>`;
        })
        .join(' ');

      const pokaBadges = Object.entries(rec.pokaYokeChecks ?? {})
        .map(([k, v]) => `<span class="pill ${v ? 'pill-ok' : 'pill-err'}">${v ? '✓' : '✕'} ${esc(k)}</span>`)
        .join(' ');

      return `
        <section class="case-section">
          <div class="case-header">
            <div>
              <h2>${esc(meta.title)}</h2>
              <p class="subtitle">${esc(meta.subtitle)}</p>
            </div>
            <div class="case-stats">
              <span class="pill pill-info">PPTX ${rec.pptxSlideCount}면 · 미디어 ${rec.pptxMediaCount}개</span>
              <span class="pill ${rec.blindLeaksOnDc?.length === 0 ? 'pill-ok' : 'pill-err'}">블라인드 유출 ${rec.blindLeaksOnDc?.length ?? 0}건</span>
              <span class="pill ${rec.defects?.length === 0 ? 'pill-ok' : 'pill-err'}">잔여 결함 ${rec.defects?.length ?? 0}건</span>
            </div>
          </div>
          <div class="pill-row">${oracleBadges} ${pokaBadges}</div>
          <h3>PPTX 핵심 슬라이드 (150 DPI — 클릭 시 확대)</h3>
          <div class="slide-grid">${slideCards}</div>
          <h3>딜카드 · OG · 모바일 IM 뷰어 (390px xlarge)</h3>
          <div class="mobile-grid">${mobileCards}</div>
        </section>
      `;
    })
    .join('\n');

  const crossWorkspaceShots = [
    ['부동산뉴스 작업실 (xlarge)', manifest.newsletter?.screenshots?.workspace],
    ['부동산뉴스 구독자 모바일 (390 xlarge)', manifest.newsletter?.screenshots?.readerMobile],
    ['소통함 데스크톱 (xlarge)', manifest.inbox?.screenshots?.desktop],
    ['소통함 모바일 (390 xlarge)', manifest.inbox?.screenshots?.mobile],
  ]
    .map(([label, fp]) => {
      const uri = toDataUri(fp as string | undefined);
      if (!uri) return '';
      return `
        <figure class="thumb-card" onclick="openLightbox('${uri}', '${esc(label)}')">
          <img src="${uri}" alt="${esc(label)}" loading="lazy" />
          <figcaption>${esc(label)}</figcaption>
        </figure>
      `;
    })
    .join('\n');

  const personaRowsHtml = (r3Audit?.personas ?? [])
    .map(
      (p: any) => `
      <tr>
        <td><strong>${esc(p.personaId)}</strong></td>
        <td>${esc(String(p.subsystem || '').toUpperCase())}</td>
        <td><strong>${Number(p.overallScore ?? 0).toFixed(2)} / 5.0</strong></td>
        <td>${p.grounded ? '<span class="pill pill-ok">✓ 접지</span>' : '<span class="pill pill-err">✕ 미접지</span>'}</td>
        <td>${esc(p.reaction)}<br/><small class="muted">근거 스팬: "${esc(p.evidenceSpan)}"</small></td>
        <td><small>${esc(p.topPreferenceNote || '-')}</small></td>
      </tr>
    `,
    )
    .join('\n');

  const overallScore = finalReport?.r3Audit?.overallBlendedEffective100 ?? finalReport?.overallEffectiveMean100 ?? 0;
  const ready = Boolean(finalReport?.readyForHuman2nd);

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CRE DealCard 4종 실매물 골든테스트 인간 2차 검수 보드</title>
<style>
  :root { --bg: #f8fafc; --card: #ffffff; --ink: #0f172a; --muted: #475569; --line: #e2e8f0; --blue: #1d4ed8; --green: #15803d; --red: #b91c1c; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Pretendard", "Malgun Gothic", -apple-system, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.5; }
  .wrap { max-width: 1360px; margin: 0 auto; padding: 28px 20px 80px; }
  header { background: #0f172a; color: #fff; padding: 28px 32px; border-radius: 18px; margin-bottom: 24px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; align-items: center; }
  header h1 { margin: 0 0 6px; font-size: 24px; }
  header p { margin: 0; color: #cbd5e1; font-size: 14px; }
  .hero-badge { text-align: right; }
  .hero-score { font-size: 36px; font-weight: 800; color: #fbbf24; }
  .score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: 0 1px 3px rgba(15,23,42,.05); }
  .score-card.pass { border-top: 4px solid var(--green); }
  .score-card.fail { border-top: 4px solid var(--red); }
  .sub-label { font-size: 14px; font-weight: 700; color: var(--muted); }
  .big-score { font-size: 30px; font-weight: 800; margin: 6px 0; }
  .big-score span { font-size: 14px; color: var(--muted); font-weight: 600; margin-left: 3px; }
  .meta-line { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .badge-pass { background: #dcfce7; color: #166534; }
  .badge-fail { background: #fee2e2; color: #991b1b; }
  .case-section { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 22px; margin-bottom: 22px; }
  .case-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-start; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 14px; }
  .case-header h2 { margin: 0 0 4px; font-size: 19px; }
  .subtitle { margin: 0; font-size: 13px; color: var(--muted); }
  h3 { font-size: 14px; color: #334155; margin: 16px 0 10px; }
  .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .pill { display: inline-block; padding: 3px 9px; border-radius: 8px; font-size: 12px; font-weight: 600; }
  .pill-ok { background: #dcfce7; color: #166534; }
  .pill-err { background: #fee2e2; color: #991b1b; }
  .pill-info { background: #e0e7ff; color: #3730a3; }
  .slide-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
  .mobile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
  .thumb-card { margin: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; cursor: zoom-in; background: #f1f5f9; transition: transform .15s; }
  .thumb-card:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(15,23,42,.1); }
  .thumb-card img { width: 100%; display: block; object-fit: contain; background: #fff; max-height: 240px; }
  .mobile-thumb img { max-height: 300px; object-fit: cover; object-position: top; }
  .thumb-card figcaption { padding: 8px 10px; font-size: 12px; font-weight: 700; background: #fff; border-top: 1px solid var(--line); color: #1e293b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid var(--line); padding: 10px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; }
  .muted { color: var(--muted); }
  .checklist { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
  .checklist ul { margin: 8px 0 0; padding-left: 18px; font-size: 13px; }
  .checklist li { margin-bottom: 6px; }
  #lightbox { display: none; position: fixed; inset: 0; background: rgba(15,23,42,.88); z-index: 9999; align-items: center; justify-content: center; flex-direction: column; padding: 24px; }
  #lightbox.open { display: flex; }
  #lightbox img { max-width: 94vw; max-height: 84vh; border-radius: 8px; background: #fff; }
  #lightbox .cap { color: #fff; margin-top: 10px; font-size: 14px; font-weight: 700; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>CRE DealCard 4종 실매물 골든테스트 · 인간 2차 검수 보드</h1>
      <p>CASE-02(사옥형) · CASE-03(신축개발형) · CASE-04(XLSX 15호실 수익형) · CASE-05(XLSX 평단위 10층 프라임오피스) × 4대 워크스페이스</p>
      <p>생성 시각: ${esc(new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</p>
    </div>
    <div class="hero-badge">
      <div class="hero-score">${overallScore.toFixed(1)} / 100</div>
      <div class="badge ${ready ? 'badge-pass' : 'badge-fail'}">${ready ? 'READY FOR HUMAN 2ND REVIEW' : 'NEEDS ATTENTION'}</div>
    </div>
  </header>

  <div class="score-grid">${scoreCardsHtml}</div>

  <section class="case-section">
    <h2>인간 2차 20분 최종 검수 가이드 (최소 노력 · 최대 완성도)</h2>
    <div class="checklist">
      <div class="card">
        <strong>① 10분 시각 스캔 (이 보드 안에서 완료)</strong>
        <ul>
          <li>각 CASE 핵심 PPTX 슬라이드 클릭 확대 → 글자 잘림·겹침·오탈자·세로사진 구도 최종 육안 확인</li>
          <li>CASE-04/05 <code>05 층별 임대차 현황</code>에서 <strong>임차인(상호)</strong>과 <strong>용도(업종)</strong> 컬럼 정합 확인</li>
          <li>CASE-03 <code>01 요약</code> <strong>242억 2,680만 원</strong> · <code>07 수익률</code> <strong>1.37% → 4.14%</strong> 확인</li>
          <li>CASE-05 <code>표지</code> 1줄 정리 · <code>02 물건 개요</code> <strong>0%/0%·승용 0대 제거</strong> · <code>09 내부 사진</code> 캡션 확인</li>
        </ul>
      </div>
      <div class="card">
        <strong>② 10분 실기기 2케이스 스팟 체험 (사람만 느낄 수 있는 감각)</strong>
        <ul>
          <li><strong>PC 스팟 (CASE-05 양평동4가)</strong>: V12 차단 부록 XLSX 업로드 차단 체감 → 정상 평단위 XLSX 업로드 → PPTX 다운로드 후 PowerPoint에서 직접 슬라이드 쇼 재생</li>
          <li><strong>모바일 스팟 (CASE-03 잠원동)</strong>: 본인 스마트폰 카카오톡으로 <code>/dc</code> 링크 전송 → 실제 카톡 2×2 썸네일 말풍선·<code>/dc</code>·<code>/im-lite</code>·<code>/magazine</code> 스크롤 감각 및 전화/IM 요청 버튼 터치감 확인</li>
        </ul>
      </div>
    </div>
  </section>

  ${casesHtml}

  <section class="case-section">
    <h2>부동산뉴스 · 고객 소통함 크로스-워크스페이스 실측 캡처</h2>
    <div class="pill-row">
      <span class="pill ${manifest.newsletter?.liveNewsRefreshed ? 'pill-ok' : 'pill-err'}">실시간 뉴스 새로고침: ${manifest.newsletter?.liveNewsRefreshed ? 'PASS' : 'FAIL'}</span>
      <span class="pill pill-info">신선도 배지: ${esc(manifest.newsletter?.freshnessBadgeText || '-')}</span>
      <span class="pill ${manifest.inbox?.api409ImNotGeneratedVerified ? 'pill-ok' : 'pill-err'}">409 IM_NOT_GENERATED 가드: ${manifest.inbox?.api409ImNotGeneratedVerified ? 'PASS' : 'FAIL'}</span>
      <span class="pill ${manifest.inbox?.duplicateWarningShown ? 'pill-ok' : 'pill-err'}">중복 연락처 경고: ${manifest.inbox?.duplicateWarningShown ? 'PASS' : 'FAIL'}</span>
      <span class="pill ${manifest.inbox?.aiReplyVariantNonRepeating ? 'pill-ok' : 'pill-err'}">AI 답장 2회 비중복: ${manifest.inbox?.aiReplyVariantNonRepeating ? 'PASS' : 'FAIL'}</span>
      <span class="pill ${manifest.inbox?.vipDeleteStrongWarningShown ? 'pill-ok' : 'pill-err'}">VIP 삭제 강화 경고: ${manifest.inbox?.vipDeleteStrongWarningShown ? 'PASS' : 'FAIL'}</span>
    </div>
    <div class="slide-grid">${crossWorkspaceShots}</div>
  </section>

  ${
    personaRowsHtml
      ? `<section class="case-section">
    <h2>대한민국 중개인(4) · 매수자(4) 파라메트릭 페르소나 R3 멀티모달 평가 (<code>[SIMULATED]</code>)</h2>
    <p class="subtitle">음성 대조군 NC-01-R3 통과: <strong>${r3Audit?.negativeControl?.passed ? 'PASS' : 'FAIL'}</strong> (${r3Audit?.negativeControl?.overallScore ?? '-'}점, floorRisk=${r3Audit?.negativeControl?.floorRisk}) · 원문 스팬 접지율: <strong>${((r3Audit?.groundedRatio ?? 0) * 100).toFixed(1)}%</strong> · API 비용: <strong>\$${Number(r3Audit?.estimatedCostUsd ?? 0).toFixed(4)}</strong></p>
    <table>
      <thead>
        <tr><th>페르소나</th><th>워크스페이스</th><th>R3 점수</th><th>스팬 접지</th><th>합성 평가 ([SIMULATED])</th><th>취향/선택적 다듬기 참고</th></tr>
      </thead>
      <tbody>${personaRowsHtml}</tbody>
    </table>
  </section>`
      : ''
  }
</div>

<div id="lightbox" onclick="this.classList.remove('open')">
  <img id="lb-img" src="" alt="" />
  <div class="cap" id="lb-cap"></div>
</div>
<script>
function openLightbox(src, cap) {
  document.getElementById('lb-img').src = src;
  document.getElementById('lb-cap').textContent = cap + ' (화면 클릭 시 닫힘)';
  document.getElementById('lightbox').classList.add('open');
}
</script>
</body>
</html>`;

  fs.mkdirSync(DOCS_OUT, { recursive: true });
  const boardPath = path.join(DOCS_OUT, 'GOLDEN_4CASES_HUMAN_REVIEW_BOARD.html');
  fs.writeFileSync(boardPath, html, 'utf-8');

  // Build concise Markdown report
  const mdLines: string[] = [
    '# CRE DealCard 골든 실매물 4종(CASE-02~05) AI 1차 전수검증 및 인간 2차 20분 검수 리포트',
    '',
    `- 생성 시각: ${new Date().toISOString()}`,
    `- 시각 검수 보드(HTML): \`docs/finaltest/GOLDEN_4CASES_HUMAN_REVIEW_BOARD.html\``,
    `- 최종 4대 워크스페이스 Blended 유효 평균: **${overallScore.toFixed(2)} / 100점** (과락: **${finalReport?.totalFloorRiskCount ?? 0}건** · 인간 2차 검수 진입: **${ready ? 'READY' : 'BLOCKED'}**)`,
    ...(r3Audit
      ? [
          `- Layer D(R3) 실측: \`${r3Audit.usage.calls}\` calls · \`${r3Audit.usage.promptTokens.toLocaleString()}\` / \`${r3Audit.usage.completionTokens.toLocaleString()}\` tokens · **\`$${Number(r3Audit.estimatedCostUsd).toFixed(4)}\`** · 음성대조군 NC-01-R3 **${r3Audit.negativeControl.passed ? 'PASS' : 'FAIL'}** (${r3Audit.negativeControl.overallScore}점, floorRisk=${r3Audit.negativeControl.floorRisk}) · 원문 스팬 접지율 **${(r3Audit.groundedRatio * 100).toFixed(1)}%**`,
        ]
      : []),
    '',
    '## 1. 4대 워크스페이스 통합 스코어카드 (`0.70 * R2 + 0.30 * R3`)',
    '| 워크스페이스 | R2 결정론(100) | R3 환산(100) | **Blended 최종(100)** | 과락 | 판정 |',
    '|:--|--:|--:|--:|--:|:--:|',
    ...subOrder.map((id) => {
      const r2 = finalReport?.subsystems?.[id];
      const r3 = finalReport?.r3Audit?.subsystems?.[id];
      const s = r3 ? r3.blendedEffective100 : r2?.effectiveScore100 ?? 0;
      const fl = r3 ? (r3.effectiveFloorRisk ? '1+' : '0') : String(r2?.floorRiskCount ?? 0);
      return `| **${subNames[id]}** | ${(r2?.effectiveScore100 ?? 0).toFixed(2)} | ${r3 ? r3.r3Linear100.toFixed(2) : '-'} | **${s.toFixed(2)} / 100** | ${fl}건 | ${s >= 90 && fl === '0' ? 'PASS' : 'REMEDIATE'} |`;
    }),
    '',
    '## 2. AI 1차 루프에서 실제 발굴·선제 해결한 상용 결함 (10건)',
    '1. **[P0] XLSX v1.5 `임차인` ↔ `용도` 컬럼 뒤바뀜 수정** (`im/page.tsx`): 표준양식 E열 `업종/상호 (원문)`이 `tenant_type`·`tenant_name` 양쪽에 동일 문자열로 들어와 `05 층별 임대차 현황`에서 상호와 업종이 뒤바뀌던 치명적 결함 해결 (`CASE-04`, `CASE-05`).',
    '2. **[P0] PPTX `02 물건 개요` 가짜 `0% / 0%` 및 `승용 0대` / `23대 /` 꼬리 슬래시 제거** (`quick-generate/route.ts`, `pptx-renderer.ts`): 건폐율·용적률 미입력 시 `0% / 0%` 행 생략, 승강기 미입력 시 `주차 | 총 23대`로 정갈하게 표시.',
    '3. **[P0] 비정수 억 매매가 `242.268억 원` → `242억 2,680만 원` 정규화** (`archetype-builders.ts`, `pptx-renderer.ts`, `quick-generate/route.ts` — `CASE-03`).',
    '4. **[P0] 비수익형(사옥형·개발형) 기대수익률 렌트롤 입력 시 `05 임대차` + `06 기대수익률` + `07 수익률` 완전 연동** (`deck-sequencer.ts` — `CASE-02` 1.70%→3.52%, `CASE-03` 1.37%→4.14%).',
    '5. **[P0] `01 요약` 투자 포인트 빈 제목(`01 기대수익률`) 차단 + 3건 보장 + 한국형 보증금 차감 현행 임대수익률 통일** (`a02-stat-grid.ts` — `CASE-02`, `CASE-03`).',
    '6. **[P1] `05 층별 임대차 현황` 임대가능 호실 대비 공실률 요약 표기 추가** (`a24-rentroll-stacking.ts` — `CASE-02` 20.0%, `CASE-03` 16.7%).',
    '7. **[P1] 표지 긴 한글 제목 고아음절(`더레드빌\n딩)`) 방지 + 의미 있는 사진 파일명 캡션 보존** (`a01-cover.ts`, `im-workspace-types.ts` — `CASE-05` `승강기홀`/`기준층오피스`).',
    '8. **[P1] 소통함 `아주 크게(21px)` 좌상단 `지금 할 일` 카드 버튼 겹침 해소** (`InboxListColumn.tsx`: 2단 세로 배치로 겹침 `0px` 달성).',
    '9. **[P0] 소통함 뉴스레터 익명 열람객 원본 에디션 UUID 노출 및 오연결(`딜카드/IM 편집`) 차단** (`inbox-query-events.ts`, `inbox-lead-threads.ts`, `InboxEditorColumn.tsx`: `열람 자료: 부동산뉴스` + `📰 뉴스레터 편집·보내기 →`로 정상화).',
    '10. **[P0] 모바일 `/im-lite` 뷰어 `0% / 0%`, `23대 / 0대` 및 `06 수지 분석` 수익률 불일치 해소** (`mobile-im-viewer.tsx`: 미입력 0값 행 숨김 + 보증금 차감 현행 임대수익률 통일 및 운영비 차감 Cap Rate 보조 병기).',
    '',
    '## 3. 실매물 4종 오라클·포카요케 전수 검증표',
    '| 케이스 | 포스처 | PPTX 면수 | 블라인드 유출 | 수치 오라클 & 포카요케 | 잔여 결함 |',
    '|:--|:--|--:|--:|:--|--:|',
    ...(['CASE-02', 'CASE-03', 'CASE-04', 'CASE-05'] as const).map((cid) => {
      const r = manifest.caseRecords[cid];
      const o = (r?.oracleChecks?.details ?? []).join(', ');
      const pk = Object.entries(r?.pokaYokeChecks ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return `| **${cid}** | ${r?.dealcardPostureDetected} (${r?.dealcardPostureMatch ? '일치' : '불일치'}) | ${r?.pptxSlideCount}면 | ${r?.blindLeaksOnDc?.length ?? 0}건 | ${o}${pk ? ` · ${pk}` : ''} | **${r?.defects?.length ?? 0}건** |`;
    }),
    '',
    '## 4. 인간 2차 최종 검수 (총 20분 권장 체크리스트)',
    '### Part A. 시각 스캔 (10분 — `GOLDEN_4CASES_HUMAN_REVIEW_BOARD.html` 열람)',
    '- [ ] `CASE-02~05` 핵심 PPTX 슬라이드 클릭 확대 → 표 정렬·숫자·세로사진 구도·캡션 확인',
    '- [ ] 모바일 390px 큰글씨(`/dc`, `/im-lite`, `/magazine`, `/broker/w/inbox`) 가독성·버튼 크기 확인',
    '',
    '### Part B. 실기기 2케이스 스팟 체험 (10분)',
    '- [ ] **PC 스팟 (`CASE-05` 양평동4가)**: `99_부록_V12_단위혼동_차단게이트_체험용.xlsx` 차단 확인 → `02_현황_렌트롤_v1.5_pyeong.xlsx` 업로드 → PPTX 다운로드 후 PowerPoint 직접 재생',
    '- [ ] **모바일 스팟 (`CASE-03` 잠원동)**: 실제 스마트폰 카카오톡으로 `/dc` 공유 → 2×2 썸네일 말풍선·`/dc`·`/im-lite`·전화/IM 요청 버튼 체감 확인',
    '',
  ];

  const reportPath = path.join(DOCS_OUT, 'GOLDEN_4CASES_HUMAN_REVIEW_REPORT.md');
  fs.writeFileSync(reportPath, mdLines.join('\n'), 'utf-8');
  console.log(`✅ Built Human Review Board: ${boardPath}`);
  console.log(`✅ Built Human Review Report: ${reportPath}`);
}

main();
