export interface SanitizationMap {
  tokens: Map<string, string>;   // "[TENANT_A]" -> "삼성SDS"
  sanitizedText: string;
}

export function sanitizeMemo(memo: string): SanitizationMap {
  const tokens = new Map<string, string>();
  let sanitizedText = memo;
  const counters: Record<string, number> = { PHONE: 0, ADDR_DETAIL: 0, BLDG_NAME: 0, TENANT: 0, OWNER: 0 };

  // 1. Phone 마스킹 (가장 명확하므로 최우선 적용)
  sanitizedText = sanitizedText.replace(/01[0-9]-?\d{3,4}-?\d{4}/g, (match) => {
    counters.PHONE++;
    const token = `[PHONE_${String.fromCharCode(64 + counters.PHONE)}]`;
    tokens.set(token, match);
    return token;
  });

  // 2. 번지수 (Exact Address) 마스킹
  // ADDR_DETAIL을 먼저 해줌으로써 건물명 마스킹시 번지수가 얽히는 것을 방지
  sanitizedText = sanitizedText.replace(/\b\d{1,4}-\d{1,4}\b/g, (match) => {
    counters.ADDR_DETAIL++;
    const token = `[ADDR_DETAIL_${String.fromCharCode(64 + counters.ADDR_DETAIL)}]`;
    tokens.set(token, match);
    return token;
  });

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

  return { tokens, sanitizedText };
}

export function desanitizeOutput(output: string, map: SanitizationMap): string {
  let result = output;
  for (const [token, original] of map.tokens) {
    result = result.replaceAll(token, original);
  }
  return result;
}
