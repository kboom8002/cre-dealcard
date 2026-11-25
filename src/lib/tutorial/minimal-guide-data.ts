export interface MinimalSpaceGuide {
  id: "magazine" | "dealcards" | "im" | "inbox";
  anchorId: "module-07" | "module-02" | "module-04" | "module-08";
  order: string;
  name: string;
  roleTag: string;
  oneLiner: string;
  href: string;
  ctaLabel: string;
  accentHex: string;
  pillBg: string;
  pillText: string;
  steps: readonly [string, string, string];
  keyTip: string;
}

export const MINIMAL_SPACE_GUIDES: readonly MinimalSpaceGuide[] = [
  {
    id: "magazine",
    anchorId: "module-07",
    order: "01",
    name: "부동산뉴스",
    roleTag: "접점 유지",
    oneLiner:
      "매수자·건물주에게 일간·주간·월간 시장 브리핑과 핵심 이슈 5선을 보내 안부를 잇습니다.",
    href: "/broker/w/newsletter",
    ctaLabel: "부동산뉴스 열기",
    accentHex: "#059669",
    pillBg: "#ECFDF5",
    pillText: "#065F46",
    steps: [
      "왼쪽에서 발행 주기(일간·주간·월간)와 거래 온도(긍정·중립·보수)를 고릅니다.",
      "가운데에서 [AI 초안 쓰기]로 3줄 개조식 브리핑 · 출처가 붙은 핵심 이슈 5선 · 추천 매물을 확인합니다.",
      "오른쪽 미리보기를 확인하고 [구독자에게 보내기] 또는 노란색 [카톡으로 공유]를 누릅니다.",
    ],
    keyTip:
      "고객 성향에 맞춰 거래 온도를 바꾸면 같은 시장 데이터도 긍정·중립·보수 관점으로 자동 재구성됩니다.",
  },
  {
    id: "dealcards",
    anchorId: "module-02",
    order: "02",
    name: "딜카드",
    roleTag: "관심 유도",
    oneLiner:
      "정확한 지번을 가린 1장 블라인드 요약으로 중개권을 지키면서 매수 문의를 이끌어냅니다.",
    href: "/broker/w/dealcards",
    ctaLabel: "딜카드 열기",
    accentHex: "#B45309",
    pillBg: "#FFFBEB",
    pillText: "#92400E",
    steps: [
      "가운데 메모 칸에 거친 현장 메모를 붙여넣고 [메모로 딜카드 생성하기]를 누릅니다.",
      "블라인드 4항목(권역·용도·규모·가격대)과 핵심 장점 3가지를 확인하고 필요하면 한 줄만 다듬습니다.",
      "오른쪽 카톡 말풍선을 확인한 뒤 노란색 [카톡 문구·링크 복사]로 고객에게 바로 전달합니다.",
    ],
    keyTip:
      "딜카드에는 정확한 번지수와 건물명이 숨겨지므로 단체방이나 초기 문의 고객에게 안심하고 보낼 수 있습니다.",
  },
  {
    id: "im",
    anchorId: "module-04",
    order: "03",
    name: "IM",
    roleTag: "신뢰 설득",
    oneLiner:
      "관심을 보인 진성 매수자에게 공적장부·임대현황·수익 분석이 담긴 상세 제안서(웹·PPTX)를 전달합니다.",
    href: "/broker/w/im",
    ctaLabel: "IM 열기",
    accentHex: "#1D4ED8",
    pillBg: "#EFF6FF",
    pillText: "#1E40AF",
    steps: [
      "1단계(표지·기본정보)에서 지번·도로명 주소를 입력해 건축물대장·토지대장을 자동으로 불러오고 희망 매매가를 적습니다.",
      "2단계(층별 임대현황)에서 엑셀·직접 입력으로 렌트롤을 채우고, 3단계(장점 3가지)·4단계(사진·위치·만들기)에서 핵심 장점과 사진을 넣습니다.",
      "오른쪽 미리보기 아래에서 [IM 링크 복사]로 모바일 제안서를 공유하거나 [PPTX 받기]·[PDF 저장]을 누릅니다.",
    ],
    keyTip:
      "이미 발행한 IM의 금액이나 숫자를 고치면 오른쪽 상단에 주황색 [변경 내용 반영] 알림이 뜹니다. 한 번 누르면 고객 링크가 최신화됩니다.",
  },
  {
    id: "inbox",
    anchorId: "module-08",
    order: "04",
    name: "고객 소통",
    roleTag: "반응 회수",
    oneLiner:
      "내가 보낸 딜카드·IM·뉴스를 누가 몇 번 열어봤는지 확인하고 맞춤 후속 자료를 한 화면에서 보냅니다.",
    href: "/broker/w/inbox",
    ctaLabel: "고객 소통 열기",
    accentHex: "#BE185D",
    pillBg: "#FDF2F8",
    pillText: "#9D174D",
    steps: [
      "왼쪽 고객 목록에서 [관심 높음만] 필터로 열람 반응이 뚜렷한 고객을 고릅니다.",
      "가운데에서 보낼 자료(딜카드·IM·부동산뉴스)를 고르고 [AI 답장 쓰기]로 맞춤 안내 문구를 만듭니다.",
      "노란색 [카톡 문구·링크 복사] 또는 [이메일로 보내기]로 전달하고, 오른쪽에서 상담 메모와 열람 기록을 확인합니다.",
    ],
    keyTip:
      "고객별로 전용 추적 링크가 자동 생성되어, 누가 어떤 매물에 관심을 보이는지 다음 상담 전에 바로 파악할 수 있습니다.",
  },
] as const;

export interface MinimalEssentialFaq {
  q: string;
  a: string;
}

export const MINIMAL_ESSENTIAL_FAQS: readonly MinimalEssentialFaq[] = [
  {
    q: "내용을 고쳤는데 이미 보낸 고객 링크에도 자동으로 바뀌나요?",
    a: "입력하는 내용은 자동 저장되지만, 고객이 보고 있는 공개 링크는 실수 방지를 위해 바로 덮어쓰지 않습니다. 수정이 끝나면 오른쪽 미리보기 위 주황색 [변경 내용 반영] 버튼을 한 번 눌러 최신화하세요.",
  },
  {
    q: "딜카드를 보내면 정확한 건물 주소가 노출되지 않나요?",
    a: "네. 딜카드는 '강남 역삼역세권 · 80억~90억대'처럼 권역과 가격 구간만 보여주는 블라인드 요약입니다. 진성 매수 의사가 확인된 고객에게만 IM 제안서를 보내 중개권을 안전하게 지킬 수 있습니다.",
  },
  {
    q: "부동산뉴스의 거래 온도(긍정·중립·보수)는 어떻게 쓰나요?",
    a: "기본값은 '긍정적(매수 활기)'입니다. 관망세가 짙거나 신중한 법인·건물주 고객에게 보낼 때만 '중립적' 또는 '보수·신중'을 고르면, AI가 뉴스 선별과 3줄 브리핑 어조를 그 고객 눈높이에 맞춰 바꿔줍니다.",
  },
  {
    q: "IM 층별 임대현황(렌트롤)을 일일이 타이핑해야 하나요?",
    a: "아니요. 기존에 쓰시던 엑셀이나 메모를 IM 2단계 '층별 임대현황'에 붙여넣거나 엑셀 양식을 올리면 보증금·월세·관리비 합계와 예상 수익률이 자동으로 계산됩니다.",
  },
  {
    q: "화면 글씨가 작아 보일 때는 어떻게 키우나요?",
    a: "화면 오른쪽 위 상단 바의 [가-] [현재 크기] [가+] 버튼을 누르시면 모든 작업 공간의 글자 크기가 즉시 커지며, 다음 접속 때도 설정이 그대로 유지됩니다.",
  },
] as const;

export interface MinimalEssentialGlossaryItem {
  term: string;
  easyMeaning: string;
  whereUsed: string;
}

export const MINIMAL_ESSENTIAL_GLOSSARY: readonly MinimalEssentialGlossaryItem[] = [
  {
    term: "부동산뉴스",
    easyMeaning:
      "매수자·건물주에게 일간·주간·월간 시장 브리핑과 출처가 붙은 핵심 이슈 5선, 추천 매물을 묶어 보내며 자연스럽게 안부를 잇는 공간입니다.",
    whereUsed: "상단 탭 [부동산뉴스]",
  },
  {
    term: "딜카드",
    easyMeaning:
      "정확한 번지수와 건물명을 가린 채 권역·용도·규모·가격대와 핵심 장점 3가지만 1장으로 요약해 카카오톡으로 공유하는 블라인드 매물 카드입니다.",
    whereUsed: "상단 탭 [딜카드]",
  },
  {
    term: "IM",
    easyMeaning:
      "관심을 보인 진성 매수자에게 건축물·토지 공적장부, 층별 임대현황(렌트롤), 수익 분석을 담아 전달하는 정식 투자설명서(웹 링크·PPTX·PDF)입니다.",
    whereUsed: "상단 탭 [IM]",
  },
  {
    term: "고객 소통",
    easyMeaning:
      "내가 보낸 딜카드·IM·부동산뉴스를 어떤 고객이 몇 번 열어봤는지 확인하고, AI 답장 초안과 전용 열람 링크로 후속 상담을 이어가는 공간입니다.",
    whereUsed: "상단 탭 [고객 소통]",
  },
  {
    term: "블라인드 매물",
    easyMeaning:
      "초기 문의 단계에서 중개권을 보호하기 위해 정확한 지번·건물명을 숨기고 역세권·가격 구간 등 핵심 조건만 보여주는 매물 공개 방식입니다.",
    whereUsed: "딜카드 미리보기 · 공개 딜카드 화면",
  },
  {
    term: "기대수익률",
    easyMeaning:
      "현재 받고 있는 임대료 기준의 현행 수익률에 공실·자가사용 층 임대 전환 예상 수익까지 더해 계산한 매입 후 예상 연간 수익률입니다.",
    whereUsed: "IM 2단계(층별 임대현황) · IM 제안서 수익 분석",
  },
  {
    term: "5년 지가 변동률(한국부동산원)",
    easyMeaning:
      "한국부동산원 공식 통계를 바탕으로 해당 시·군·구의 최근 5년간 평균 땅값 상승 흐름을 참고 지표로 보여주는 수치입니다.",
    whereUsed: "IM 제안서 수익·시장 분석",
  },
  {
    term: "전용 열람 링크",
    easyMeaning:
      "고객별로 따로 발급되는 고유 주소(/dc/…, /im/…)로, 누가 언제 몇 번 열람했는지 [고객 소통] 화면에서 정확히 파악할 수 있습니다.",
    whereUsed: "딜카드 · IM · 고객 소통 공유 버튼",
  },
] as const;

export function resolveMinimalSpaceGuide(
  pathname: string,
  overrideModuleId: string | null,
): MinimalSpaceGuide {
  if (overrideModuleId) {
    if (overrideModuleId === "module-07" || overrideModuleId === "magazine") {
      return MINIMAL_SPACE_GUIDES[0];
    }
    if (
      overrideModuleId === "module-02" ||
      overrideModuleId === "module-03" ||
      overrideModuleId === "dealcards"
    ) {
      return MINIMAL_SPACE_GUIDES[1];
    }
    if (
      overrideModuleId === "module-04" ||
      overrideModuleId === "module-05" ||
      overrideModuleId === "im"
    ) {
      return MINIMAL_SPACE_GUIDES[2];
    }
    if (overrideModuleId === "module-08" || overrideModuleId === "inbox") {
      return MINIMAL_SPACE_GUIDES[3];
    }
    const byId = MINIMAL_SPACE_GUIDES.find((g) => g.anchorId === overrideModuleId);
    if (byId) return byId;
  }

  if (
    pathname.startsWith("/broker/w/newsletter") ||
    pathname.startsWith("/broker/w/magazine") ||
    pathname.startsWith("/broker/magazine-editor")
  ) {
    return MINIMAL_SPACE_GUIDES[0];
  }
  if (pathname.startsWith("/broker/w/dealcards") || pathname.startsWith("/broker/deal-card")) {
    return MINIMAL_SPACE_GUIDES[1];
  }
  if (
    pathname.startsWith("/broker/w/im") ||
    pathname.startsWith("/broker/basic-im-studio") ||
    pathname.includes("/im-lite")
  ) {
    return MINIMAL_SPACE_GUIDES[2];
  }
  if (
    pathname.startsWith("/broker/w/inbox") ||
    pathname.startsWith("/broker/clients") ||
    pathname.startsWith("/broker/inbox")
  ) {
    return MINIMAL_SPACE_GUIDES[3];
  }

  return MINIMAL_SPACE_GUIDES[0];
}
