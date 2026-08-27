export interface SanitizationMap {
  tokens: Map<string, string>;   // "[TENANT_A]" -> "삼성SDS"
  sanitizedText: string;
  injectionDetected: boolean;
}

const INJECTION_PATTERNS = [
  /(ignore|disregard|forget)\s*(all\s*)?(previous|prior|above)\s*(instructions|prompts)/i,
  /you\s+are\s+now/i,
  /\b(system|assistant|user)\s*:/i,
  /\[(SYSTEM|INST)\]/i,
  /<\|?(system|im_start|im_end)\|?>/i,
  /forget\s+everything/i,
  /do\s+not\s+follow/i,
  /pretend\s+(you|to\s+be)/i,
  /system prompt/i,
  /새로운 지침/i,
  /이전 프롬프트 무시/i,
];

/** 웹 보안 패턴: XSS/SQL 인젝션 방어 */
const WEB_SECURITY_PATTERNS: RegExp[] = [
  // XSS
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on(?:error|load|click|mouseover)\s*=/i,
  /<iframe[\s>]/i,
  /<img[^>]*onerror/i,
  /&#(?:x[0-9a-f]+|\d+);/i,
  // SQL Injection
  /UNION\s+(?:ALL\s+)?SELECT/i,
  /DROP\s+TABLE/i,
  /;\s*DELETE\s+FROM/i,
  /OR\s+1\s*=\s*1/i,
  /--\s*$/m,
  // 한국어 인젝션 변형
  /기존\s*규칙\s*무시/i,
  /관리자\s*모드/i,
  /탈옥/i,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

export function sanitizeMemo(memo: string): SanitizationMap {
  const MAX_MEMO_LENGTH = 5000;
  const safeMemo = memo.length > MAX_MEMO_LENGTH ? memo.slice(0, MAX_MEMO_LENGTH) : memo;

  if (detectPromptInjection(safeMemo)) {
    return { tokens: new Map(), sanitizedText: '', injectionDetected: true };
  }

  const tokens = new Map<string, string>();
  let sanitizedText = safeMemo;

  // WEB_SECURITY_PATTERNS 매칭 시 해당 패턴 제거
  for (const pattern of WEB_SECURITY_PATTERNS) {
    sanitizedText = sanitizedText.replace(pattern, '[BLOCKED]');
  }

  const counters: Record<string, number> = { PHONE: 0, EMAIL: 0, RRN: 0, ADDR_DETAIL: 0, BLDG_NAME: 0, TENANT: 0, OWNER: 0 };

  // 1. 주민등록번호 (RRN) 마스킹 (민감도가 가장 높으므로 최우선 적용)
  sanitizedText = sanitizedText.replace(/\b\d{6}-?[1-4]\d{6}\b/g, (match) => {
    counters.RRN++;
    const token = `[RRN_${String.fromCharCode(64 + counters.RRN)}]`;
    tokens.set(token, match);
    return token;
  });

  // 2. Email 마스킹
  sanitizedText = sanitizedText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
    counters.EMAIL++;
    const token = `[EMAIL_${String.fromCharCode(64 + counters.EMAIL)}]`;
    tokens.set(token, match);
    return token;
  });

  // 3. Phone 마스킹 (모바일 + 유선전화 + 인터넷전화 + 전국대표번호)
  sanitizedText = sanitizedText.replace(/(?:01[0-9]|02|0[3-6][1-9]|070|15\d{2}|16\d{2}|18\d{2})-?\d{3,4}-?\d{4}/g, (match) => {
    counters.PHONE++;
    const token = `[PHONE_${String.fromCharCode(64 + counters.PHONE)}]`;
    tokens.set(token, match);
    return token;
  });

  // 하이픈 없는 휴대전화번호
  sanitizedText = sanitizedText.replace(/01[016789]\d{7,8}/g, (match) => {
    counters.PHONE++;
    const token = `[PHONE_${String.fromCharCode(64 + counters.PHONE)}]`;
    tokens.set(token, match);
    return token;
  });

  // 2. 번지수 (Exact Address) 마스킹
  // ADDR_DETAIL을 먼저 해줌으로써 건물명 마스킹시 번지수가 얽히는 것을 방지
  sanitizedText = sanitizedText.replace(
    /(?:\b\d{1,4}-\d{1,4}\b|산?\d{1,4}번지|\b[가-힣]{1,10}[로길]\s?\d{1,4}(?:-\d{1,4})?)/g,
    (match) => {
      counters.ADDR_DETAIL++;
      const token = `[ADDR_DETAIL_${String.fromCharCode(64 + counters.ADDR_DETAIL)}]`;
      tokens.set(token, match);
      return token;
    }
  );

  // 3. Owner 명시 패턴 마스킹 (조사 은/는/이/가 대응)
  // 이름은 일반적으로 2~4글자 한글 단어로 엄격하게 매칭하여 문장을 삼키지 않도록 함
  sanitizedText = sanitizedText.replace(/(?:소유주|건물주|매도인|소유자)(?:은|는|이|가)?[:\s]+([가-힣]{2,4})/g, (match, p1) => {
    if (!p1 || p1.trim() === '' || (p1.startsWith('[') && p1.endsWith(']'))) return match;
    counters.OWNER++;
    const token = `[OWNER_${String.fromCharCode(64 + counters.OWNER)}]`;
    tokens.set(token, p1.trim());
    return match.replace(p1, token);
  });

  // 4. Tenant 명시 패턴 마스킹 (조사 은/는/이/가 대응)
  // 회사명은 공백이 없는 단일 단어로 안전하게 끊어서 문장 소실을 완벽 방어함
  sanitizedText = sanitizedText.replace(/(?:임차인|세입자|입주사)(?:은|는|이|가)?[:\s]+([가-힣A-Za-z0-9]+)/g, (match, p1) => {
    if (!p1 || p1.trim() === '' || (p1.startsWith('[') && p1.endsWith(']'))) return match;
    counters.TENANT++;
    const token = `[TENANT_${String.fromCharCode(64 + counters.TENANT)}]`;
    tokens.set(token, p1.trim());
    return match.replace(p1, token);
  });

  // 5. Building Name 마스킹
  // 빌딩 이름이 '및', '소재' 등을 삼키지 않도록 공백 포함 단어 개수를 최대 2개 단어로 제한
  // 자산 범주용 용어(오피스빌딩, 꼬마빌딩 등)는 치환 대상에서 제외
  sanitizedText = sanitizedText.replace(/([가-힣A-Za-z0-9]+(?:\s[가-힣A-Za-z0-9]+)?(?:타워|빌딩|센터|플라자|스퀘어|파크|시그니처))/g, (match) => {
    if (match.startsWith('[') && match.endsWith(']')) return match;
    if (match.includes('[PHONE_') || match.includes('[TENANT_') || match.includes('[OWNER_') || match.includes('[ADDR_DETAIL_')) return match;
    
    // CRE 자산 분류용 키워드는 건물 고유 명칭이 아니므로 비식별화 스킵
    const categoryKeywords = ["오피스빌딩", "꼬마빌딩", "수익형빌딩", "메디컬빌딩", "근생빌딩", "상가빌딩", "집합빌딩", "집합건물"];
    if (categoryKeywords.some(keyword => match.includes(keyword))) {
      return match;
    }
    
    counters.BLDG_NAME++;
    const token = `[BLDG_NAME_${String.fromCharCode(64 + counters.BLDG_NAME)}]`;
    tokens.set(token, match);
    return token;
  });

  return { tokens, sanitizedText, injectionDetected: false };
}

export function desanitizeOutput(output: string, map: SanitizationMap): string {
  let result = output;
  for (const [token, original] of map.tokens) {
    result = result.replaceAll(token, original);
  }
  return result;
}
