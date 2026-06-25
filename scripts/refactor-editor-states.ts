import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/app/(broker)/broker/magazine-editor/page.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add SECTIONS_DEF outside component
if (!content.includes('const SECTIONS_DEF')) {
  const tabsIndex = content.indexOf('const TABS =');
  content = content.slice(0, tabsIndex) + 
`const SECTIONS_DEF = [
  { id: "ai_briefing", label: "AI 마켓 브리핑" },
  { id: "broker_comment", label: "브로커 코멘트" },
  { id: "action_list", label: "오늘의 추천 액션" },
  { id: "market_data", label: "시장 데이터" },
  { id: "deal_highlights", label: "관리 매물 하이라이트" },
  { id: "sentiment_index", label: "CRE 투자자 심리 지수" },
  { id: "news", label: "오늘의 CRE 뉴스" },
  { id: "auction_picks", label: "이 주의 경매 픽" },
  { id: "call_script", label: "추천 상담 멘트" },
  { id: "reports", label: "전문 리서치 리포트" },
  { id: "broker_profile", label: "브로커 프로필" }
];

` + content.slice(tabsIndex);
}

// 2. Change "edit" tab label to "섹션 관리" and change TABS definition
content = content.replace('{ key: "edit" as const, label: "편집", icon: Pencil }', '{ key: "edit" as const, label: "섹션 관리", icon: Pencil }');

// 3. Add states for sectionOrder, sectionVisibility, actionList, callScript
const statesInsertStr = `
  const [sectionOrder, setSectionOrder] = useState<string[]>(SECTIONS_DEF.map(s => s.id));
  const [sectionVisibility, setSectionVisibility] = useState<Record<string, boolean>>(
    SECTIONS_DEF.reduce((acc, s) => ({ ...acc, [s.id]: true }), {})
  );
  const [actionList, setActionList] = useState<string[]>([]);
  const [callScript, setCallScript] = useState<string>("");
`;

if (!content.includes('const [sectionOrder')) {
  const kakaoReadyIndex = content.indexOf('const [kakaoReady, setKakaoReady]');
  const kakaoReadyEnd = content.indexOf(';', kakaoReadyIndex) + 1;
  content = content.slice(0, kakaoReadyEnd) + statesInsertStr + content.slice(kakaoReadyEnd);
}

// 4. Update previewData
const previewDataStart = content.indexOf('const previewData = useMemo(() => {');
const previewDataReturnStart = content.indexOf('return {', previewDataStart);
const previewDataReturnEnd = content.indexOf('};', previewDataReturnStart);

const newPreviewDataReturn = `return {
      ...magazineData,
      headline,
      briefing,
      brokerComment: aiExpandedComment || (brokerComment.trim() ? brokerComment : null),
      actionList,
      callScript,
      themeColor,
      topNews: filteredNews.map((n: any) => ({
        title: n.title,
        summary: n.summary,
        source: n.source,
        sentiment: n.sentiment,
        topic: n.topic,
      })),
      dealHighlights: filteredDeals,
      sectionOrder,
      sectionVisibility,
    }`;

content = content.slice(0, previewDataReturnStart) + newPreviewDataReturn + content.slice(previewDataReturnEnd);

// 5. Update previewData dependencies
const useMemoDepsStart = content.indexOf('}, [', previewDataReturnEnd);
const useMemoDepsEnd = content.indexOf(']);', useMemoDepsStart);
const newDeps = '}, [magazineData, headline, briefing, brokerComment, aiExpandedComment, actionList, callScript, themeColor, allNews, allDeals, selectedNewsIds, selectedDealIds, sectionOrder, sectionVisibility';
content = content.slice(0, useMemoDepsStart) + newDeps + content.slice(useMemoDepsEnd);

// 6. Handle sessionStorage and API loading in useEffect
// Replace the loadData function contents or just add a new useEffect
const sessionStorageUseEffect = `
  useEffect(() => {
    const saved = sessionStorage.getItem("magazine_briefing_data");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.title) setHeadline(data.title);
        if (data.briefing) setBriefing(data.briefing);
        if (data.actionList) setActionList(data.actionList);
        if (data.callScript) setCallScript(data.callScript);
        sessionStorage.removeItem("magazine_briefing_data");
      } catch(e) {}
    }
  }, []);
`;

if (!content.includes('sessionStorage.getItem("magazine_briefing_data")')) {
  const kakaoEffectIndex = content.indexOf('// ── Kakao SDK 로딩 ──');
  content = content.slice(0, kakaoEffectIndex) + sessionStorageUseEffect + '\n  ' + content.slice(kakaoEffectIndex);
}

// Also update where json.data is loaded to include sectionOrder and sectionVisibility, actionList, callScript
const jsonLoadIndex = content.indexOf('setHeadline(json.data.headline || "");');
if (!content.includes('if (json.data.sectionOrder)')) {
  const newLoadLines = `
            setHeadline(json.data.headline || "");
            setBriefing(json.data.briefing || "");
            if (json.data.brokerComment) setBrokerComment(json.data.brokerComment);
            if (json.data.actionList) setActionList(json.data.actionList);
            if (json.data.callScript) setCallScript(json.data.callScript);
            if (json.data.sectionOrder) setSectionOrder(json.data.sectionOrder);
            if (json.data.sectionVisibility) setSectionVisibility(json.data.sectionVisibility);
`;
  const nextLineIdx = content.indexOf('\n', jsonLoadIndex);
  content = content.slice(0, jsonLoadIndex) + newLoadLines.trim() + content.slice(nextLineIdx);
}

fs.writeFileSync(file, content);
console.log('Done refactoring states');
