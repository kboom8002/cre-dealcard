import AdmZip from 'adm-zip';

export interface InspectionResult {
  criterion: string;
  label: string;
  pass: boolean;
  detail: string;
}

export async function inspectOutputs(params: {
  pptxPath: string;
  pptxBuffer: Buffer;
  viewerHtmlPath: string;
  captureDir: string;
  posture: string;
  slideCount: number;
}): Promise<InspectionResult[]> {
  console.log(`[AI-Inspector] 검사 시작: ${params.pptxPath}`);
  const results: InspectionResult[] = [];
  
  try {
    const zip = new AdmZip(params.pptxBuffer);
    const zipEntries = zip.getEntries();
    
    let allXmlContent = '';
    for (const entry of zipEntries) {
      if (entry.entryName.endsWith('.xml') || entry.entryName.endsWith('.rels')) {
        allXmlContent += zip.readAsText(entry) + ' ';
      }
    }

    // D06: Markdown residue check — text node 내부만 검사
    // XML 태그 내부의 > 는 정상이므로 <a:t> 태그 내 텍스트만 추출
    const textNodeRegex = /<a:t>([^<]*)<\/a:t>/g;
    let textContent = '';
    let tm: RegExpExecArray | null;
    while ((tm = textNodeRegex.exec(allXmlContent)) !== null) {
      textContent += tm[1] + '\n';
    }
    const mdResiduePatterns = [
      { pattern: /\*\*[^*]+\*\*/g, label: '**bold**' },
      { pattern: /^#{1,3}\s/gm, label: '## heading' },
      { pattern: /^>\s/gm, label: '> blockquote' },
      { pattern: /^\s*[-*]\s/gm, label: '- list marker' },
    ];
    const mdFindings: string[] = [];
    for (const { pattern, label } of mdResiduePatterns) {
      if (pattern.test(textContent)) mdFindings.push(label);
    }
    const mdPass = mdFindings.length === 0;
    results.push({
      criterion: 'D06',
      label: '마크다운 잔재 확인',
      pass: mdPass,
      detail: mdPass ? '마크다운 잔재 없음' : `마크다운 잔재 발견: ${mdFindings.join(', ')}`
    });
    console.log(`[AI-Inspector] D06 마크다운 체크: ${mdPass ? 'PASS' : 'FAIL'}`);

    // D07 (P0): NaN/undefined/null/Infinity check
    const invalidDataRegex = />(NaN|undefined|null|Infinity)</g;
    const invalidMatch = allXmlContent.match(invalidDataRegex);
    const invalidPass = !invalidMatch;
    results.push({
      criterion: 'D07',
      label: '비정상 데이터 (NaN 등) 확인',
      pass: invalidPass,
      detail: invalidPass ? '비정상 데이터 없음' : `비정상 데이터 발견: ${invalidMatch?.slice(0,3).join(', ')}`
    });
    console.log(`[AI-Inspector] D07 비정상 데이터 체크: ${invalidPass ? 'PASS' : 'FAIL'}`);

    // D08: Emoji check — text node 내용만 검사
    // ★ (U+2605), ✓ (U+2713), ✗ (U+2717) 은 허용 (체크마크, 별)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{2604}\u{2606}-\u{26FF}\u{2700}-\u{2712}\u{2714}-\u{2716}\u{2718}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B50}\u{2B55}\u{00A9}\u{00AE}\u{2122}]/gu;
    const emojiMatches = textContent.match(emojiRegex);
    const emojiPass = !emojiMatches;
    results.push({
      criterion: 'D08',
      label: '이모지 사용 확인',
      pass: emojiPass,
      detail: emojiPass ? '이모지 없음' : `이모지 발견: ${emojiMatches?.slice(0,3).join(', ')}`
    });
    console.log(`[AI-Inspector] D08 이모지 체크: ${emojiPass ? 'PASS' : 'FAIL'}`);

    // RG-TRUNC-01: Bracket balance
    const openBrackets = (allXmlContent.match(/\(/g) || []).length;
    const closeBrackets = (allXmlContent.match(/\)/g) || []).length;
    const bracketPass = openBrackets === closeBrackets;
    results.push({
      criterion: 'RG-TRUNC-01',
      label: '괄호 밸런스 확인',
      pass: bracketPass,
      detail: bracketPass ? '괄호 매칭 정상' : `불일치: 열림(${openBrackets}), 닫힘(${closeBrackets})`
    });
    console.log(`[AI-Inspector] RG-TRUNC-01 괄호 밸런스 체크: ${bracketPass ? 'PASS' : 'FAIL'}`);

    // POSTURE-SLIDE: Verify slide count is reasonable for posture
    // 품질 게이트가 섹션을 차단하면 슬라이드 수가 줄어들 수 있으므로, 최소 기준 사용
    const postureMin: Record<string, number> = {
      'income': 3,
      'development': 3,
      'operating': 3,
      'owner_occupied': 3,
      'trading': 3
    };
    const postureMax: Record<string, number> = {
      'income': 10,
      'development': 9,
      'operating': 10,
      'owner_occupied': 9,
      'trading': 9
    };
    const minSlides = postureMin[params.posture] ?? 3;
    const maxSlides = postureMax[params.posture] ?? 10;
    let slidePass = params.slideCount >= minSlides;
    let slideDetail = '';
    if (slidePass && params.slideCount <= maxSlides) {
      slideDetail = `정상 (${params.slideCount}장, 범위: ${minSlides}~${maxSlides})`;
    } else if (slidePass) {
      slideDetail = `${params.slideCount}장 (최대 ${maxSlides}장 초과, WARN)`;
    } else {
      slideDetail = `${params.slideCount}장 (최소 ${minSlides}장 미달)`;
    }
    results.push({
      criterion: 'POSTURE-SLIDE',
      label: '포스처별 슬라이드 수 확인',
      pass: slidePass,
      detail: slideDetail
    });
    console.log(`[AI-Inspector] POSTURE-SLIDE 슬라이드 수 체크: ${slidePass ? 'PASS' : 'FAIL'}`);

    // PLACEHOLDER-CHECK: 미치환 플레이스홀더 토큰 감지
    const placeholderPatterns = [
      /\[임차인 업종 정보로 대체됨\]/g,
      /\[지역 신호로 대체됨\]/g,
      /\[인명 비공개\]/g,
      /\[연락처 비공개\]/g,
      /\[이메일 비공개\]/g,
      /\[매도자 사정 비공개\]/g,
      /\[내부 협상 메모 비공개\]/g,
      /\[임대수익 존재, 상세 내용 비공개\]/g,
    ];
    const placeholderFindings: string[] = [];
    for (const pat of placeholderPatterns) {
      const matches = textContent.match(pat);
      if (matches) placeholderFindings.push(`${pat.source} x${matches.length}`);
    }
    const placeholderPass = placeholderFindings.length === 0;
    results.push({
      criterion: 'PLACEHOLDER-CHECK',
      label: '플레이스홀더 미치환 확인',
      pass: placeholderPass,
      detail: placeholderPass ? '미치환 플레이스홀더 없음' : `미치환 발견: ${placeholderFindings.join(', ')}`
    });
    console.log(`[AI-Inspector] PLACEHOLDER-CHECK 플레이스홀더 체크: ${placeholderPass ? 'PASS' : 'FAIL'}`);

    // TEMPLATE-FABRICATION: 허위 하드코딩 데이터 감지
    const fabricationPatterns = [
      { pattern: /WALE\s*\d+(\.\d+)?\s*년\s*확보/g, label: 'WALE 확보 (근거 없음)' },
      { pattern: /담보대출\s*\d+억/g, label: '대출 금액 창작' },
      { pattern: /승계\s*적격\s*판정/g, label: '승계 적격 판정 창작' },
      { pattern: /⭐/g, label: '⭐ 별점 기호' },
    ];
    const fabricationFindings: string[] = [];
    for (const { pattern, label } of fabricationPatterns) {
      if (pattern.test(textContent)) fabricationFindings.push(label);
    }
    const fabricationPass = fabricationFindings.length === 0;
    results.push({
      criterion: 'TEMPLATE-FABRICATION',
      label: '템플릿 허위 데이터 확인',
      pass: fabricationPass,
      detail: fabricationPass ? '허위 하드코딩 데이터 없음' : `발견: ${fabricationFindings.join(', ')}`
    });
    console.log(`[AI-Inspector] TEMPLATE-FABRICATION 허위 데이터 체크: ${fabricationPass ? 'PASS' : 'FAIL'}`);

    // PII-CHECK: Scan for known PII patterns
    const phoneEmailRegex = /(\b010-\d{4}-\d{4}\b)|(\b[\w.-]+@[\w.-]+\.\w+\b)/g;
    const piiMatch = allXmlContent.match(phoneEmailRegex);
    const piiPass = !piiMatch;
    results.push({
      criterion: 'PII-CHECK',
      label: '개인정보(PII) 유출 확인',
      pass: piiPass,
      detail: piiPass ? '개인정보 패턴 없음' : `개인정보 추정 데이터 발견: ${piiMatch?.slice(0,3).join(', ')}`
    });
    console.log(`[AI-Inspector] PII-CHECK 개인정보 체크: ${piiPass ? 'PASS' : 'FAIL'}`);

  } catch (error) {
    console.error('[AI-Inspector] 검사 중 에러 발생:', error);
    results.push({
      criterion: 'SYS-ERR',
      label: '검사 시스템 에러',
      pass: false,
      detail: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  console.log('[AI-Inspector] 검사 종료');
  return results;
}
