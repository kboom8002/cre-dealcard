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

    // D06: Markdown residue check
    const mdResidueRegex = /(\*\*|##|>\s|raw\s•)/g;
    const mdMatch = allXmlContent.match(mdResidueRegex);
    const mdPass = !mdMatch;
    results.push({
      criterion: 'D06',
      label: '마크다운 잔재 확인',
      pass: mdPass,
      detail: mdPass ? '마크다운 잔재 없음' : `마크다운 잔재 발견: ${mdMatch?.slice(0,3).join(', ')}`
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

    // D08: Emoji check
    // Matches most emoji ranges but excludes ★ (U+2605)
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{2604}\u{2606}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{303D}\u{00A9}\u{00AE}\u{2122}\u{23F3}\u{24C2}\u{23E9}-\u{23EF}\u{25B6}\u{23F8}-\u{23FA}]/gu;
    const emojiMatches = allXmlContent.match(emojiRegex);
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

    // POSTURE-SLIDE: Verify slide count matches expected for posture
    const postureExpected: Record<string, number> = {
      'income': 10,
      'development': 9,
      'operating': 10,
      'owner_occupied': 9,
      'trading': 9
    };
    const expectedSlides = postureExpected[params.posture];
    let slidePass = false;
    let slideDetail = `알 수 없는 포스처 (${params.posture})`;
    if (expectedSlides !== undefined) {
      slidePass = params.slideCount === expectedSlides;
      slideDetail = slidePass ? `정상 (${params.slideCount}장)` : `예상 ${expectedSlides}장, 실제 ${params.slideCount}장`;
    }
    results.push({
      criterion: 'POSTURE-SLIDE',
      label: '포스처별 슬라이드 수 확인',
      pass: slidePass,
      detail: slideDetail
    });
    console.log(`[AI-Inspector] POSTURE-SLIDE 슬라이드 수 체크: ${slidePass ? 'PASS' : 'FAIL'}`);

    // PII-CHECK: Scan for known PII patterns
    const piiRegex = /(\b010-\d{4}-\d{4}\b)|(\b[\w.-]+@[\w.-]+\.\w+\b)|([김이박최정강조윤장임한오서신권황안송전홍유고문양손배조백허유남심노정하곽성차주우구신임나전민유진지엄채원천방공강현함변염양변여추노도소신석선설마길주연방위표명기반왕금옥육인맹제모장남탁국여진어은편구용유승동감개강견경공과관교구국군궁권기김내단대도돈동두라류리마망매맹명모목묘묵문미민박반방배백번범변보복봉부비빈빙사산상서석선설섭성소손송수순승시신심십아안애야어엄여연염엽영예오옥온옹왕요용우원위유육윤은음이인임자장전정제조종좌주지진차창채천초최추탁태판팽편평포표풍피하학한함해허현형호홍화환황보단독우제주갈감개갱거건견결겸경공곽교구국군굴궁권궐근금기길나남내노뇌누다단담당대도독돈동두마막만망매맹명모목묘묵문미민박반방배백번벌범변보복봉부비빈빙사산상서석선설섭성소손송수순승시신심십아안애야어엄여연염엽영예오옥온옹왕요용우원위유육윤은음이인임자장전정제조종좌주지진차창채천초최추탁태판팽편평포표풍피하학한함해허현형호홍화환황]?[가-힣]{2}\b)/g;
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
