"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";

export interface FeaturedDealItem {
  id: string;
  type: "dealcard" | "im";
  title: string;
  region: string;
  use: string;
  priceBand: string;
  points: string[];
}

export interface MagazineIssueItem {
  id: string;
  issueNo: number;
  title: string;
  date: string;
  status: "published" | "draft";
  recipientCount: number;
  openRatePct: number;
  intro: string;
  commentary: string;
  featuredDeals: FeaturedDealItem[];
}

const INITIAL_ISSUES: MagazineIssueItem[] = [
  {
    id: "mag-42",
    issueNo: 42,
    title: "주간 CRE 브리핑 제 42호: 영등포·당산 권역 급매물 분석",
    date: "2026.10.27",
    status: "draft",
    recipientCount: 45,
    openRatePct: 0,
    intro:
      "안녕하십니까, 크리딜 파트너스입니다. 최근 금리 인하 기대감 속에 영등포 및 당산 권역의 100억 미만 꼬마빌딩 거래 문의가 급증하고 있습니다. 이번 호에서는 현장 확인된 특급 매물 2건을 엄선하여 전해드립니다.",
    commentary:
      "당산역 역세권 상권은 배후 오피스 및 주거 수요가 탄탄하여 공실 위험이 매우 낮으며, 인근 실거래 평당가(8,000만 원 선) 대비 본 매물의 호가는 높은 가격 경쟁력을 확보하고 있습니다.",
    featuredDeals: [
      {
        id: "deal-01",
        type: "dealcard",
        title: "영등포구 양평동 근생빌딩",
        region: "영등포구 양평동",
        use: "근린생활시설",
        priceBand: "90~100억",
        points: [
          "역세권 도보 3분 코너",
          "우량 프랜차이즈 임대중",
          "연 수익률 4.2% 안정권",
        ],
      },
    ],
  },
  {
    id: "mag-41",
    issueNo: 41,
    title: "주간 CRE 브리핑 제 41호: 강남 도산대로 이면 사옥 매물 특집",
    date: "2026.10.20",
    status: "published",
    recipientCount: 52,
    openRatePct: 68.4,
    intro: "강남권역 기업 사옥 및 복합 용도 매입 수요를 위한 주간 브리핑입니다.",
    commentary: "도산대로 이면 상가주택 및 소형 빌딩의 자산 가치 안정성이 입증되고 있습니다.",
    featuredDeals: [
      {
        id: "deal-02",
        type: "im",
        title: "강남구 신사동 사옥형 빌딩",
        region: "강남구 신사동",
        use: "상가주택",
        priceBand: "140~150억",
        points: [
          "도산대로 이면 가시성",
          "사옥 및 복합 용도 최적",
          "최근 인근 평당 1.8억 거래",
        ],
      },
    ],
  },
];

function MagazineWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [issues, setIssues] = useState<MagazineIssueItem[]>(INITIAL_ISSUES);
  const [selectedId, setSelectedId] = useState<string>(issues[0]?.id || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewMode, setPreviewMode] = useState<"phone" | "web">("phone");
  const [isPublishing, setIsPublishing] = useState(false);

  // Sync selection from query params
  useEffect(() => {
    const queryId = searchParams.get("issue") || searchParams.get("id");
    if (queryId) {
      const match = issues.find((i) => i.id === queryId);
      if (match) setSelectedId(match.id);
    }
  }, [searchParams, issues]);

  const activeIssue = useMemo(() => {
    return issues.find((i) => i.id === selectedId) || issues[0];
  }, [issues, selectedId]);

  // Form edit state
  const [title, setTitle] = useState(activeIssue?.title || "");
  const [intro, setIntro] = useState(activeIssue?.intro || "");
  const [commentary, setCommentary] = useState(activeIssue?.commentary || "");
  const [featuredDeals, setFeaturedDeals] = useState<FeaturedDealItem[]>(
    activeIssue?.featuredDeals || []
  );

  useEffect(() => {
    if (activeIssue) {
      setTitle(activeIssue.title);
      setIntro(activeIssue.intro);
      setCommentary(activeIssue.commentary);
      setFeaturedDeals(activeIssue.featuredDeals);
    }
  }, [activeIssue?.id]);

  // Create new issue
  const handleCreateNewIssue = () => {
    const nextNo = (issues[0]?.issueNo || 42) + 1;
    const newId = `mag-${nextNo}`;
    const newIssue: MagazineIssueItem = {
      id: newId,
      issueNo: nextNo,
      title: `주간 CRE 브리핑 제 ${nextNo}호`,
      date: new Date().toLocaleDateString("ko-KR"),
      status: "draft",
      recipientCount: 0,
      openRatePct: 0,
      intro: "안녕하십니까, 금주 추천 상업용 부동산 매물 브리핑입니다.",
      commentary: "최근 금리 동향과 상권별 유동인구 지표를 공유합니다.",
      featuredDeals: [],
    };
    setIssues([newIssue, ...issues]);
    setSelectedId(newId);
    showUndoToast(`제 ${nextNo}호 소식지 초안이 생성되었습니다.`);
  };

  // 1-Click Deal Card insertion (WP-P5-03)
  const handleInsertDealCard = () => {
    const sampleDeal: FeaturedDealItem = {
      id: `deal-${Date.now()}`,
      type: "dealcard",
      title: "마포구 서교동 올근생 꼬마빌딩",
      region: "마포구 서교동",
      use: "근린생활시설",
      priceBand: "60~70억",
      points: [
        "홍대 상권 유동인구 풍부",
        "전층 만실 공실 위험 낮음",
        "연 4.5% 배당형 수익",
      ],
    };
    setFeaturedDeals([...featuredDeals, sampleDeal]);
    showUndoToast("✓ 4항목 딜카드가 소식지에 1초 삽입되었습니다!");
  };

  // 1-Click IM insertion (WP-P5-03)
  const handleInsertIm = () => {
    const sampleIm: FeaturedDealItem = {
      id: `im-${Date.now()}`,
      type: "im",
      title: "강남구 신사동 사옥형 빌딩",
      region: "강남구 신사동",
      use: "상가주택",
      priceBand: "140~150억",
      points: [
        "도산대로 이면 가시성",
        "사옥 및 복합 용도 최적",
        "최근 인근 평당 1.8억 거래",
      ],
    };
    setFeaturedDeals([...featuredDeals, sampleIm]);
    showUndoToast("✓ 추천 Basic IM 요약 카드가 소식지에 삽입되었습니다!");
  };

  const handleRemoveDeal = (dealId: string) => {
    setFeaturedDeals(featuredDeals.filter((d) => d.id !== dealId));
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setTimeout(() => {
      setIsPublishing(false);
      showUndoToast(`🚀 제 ${activeIssue.issueNo}호 소식지가 VIP 고객 45명에게 발행되었습니다!`);
    }, 800);
  };

  /* ──────── Column 1: Past Issue List ──────── */
  const listSlot = (
    <div className="flex flex-col h-full bg-[#FAF9F5] p-3 space-y-3" data-testid="magazine-list-slot">
      <button
        type="button"
        onClick={handleCreateNewIssue}
        className="w-full min-h-[56px] px-4 py-3 bg-[#0F172A] text-white rounded-2xl font-bold text-[17px] hover:bg-[#1E293B] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
      >
        <span>+ 새 소식지 작성</span>
      </button>

      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 지난 호 검색"
          className="w-full min-h-[48px] px-3.5 bg-white text-[16px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {issues.map((issue) => {
          const isSelected = issue.id === selectedId;
          return (
            <div
              key={issue.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(issue.id)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedId(issue.id)}
              className={`w-full min-h-[72px] p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                isSelected
                  ? "bg-white border-[#1D4ED8] shadow-sm ring-2 ring-[#1D4ED8]/20"
                  : "bg-white border-[#E2E8F0] hover:border-[#64748B]"
              }`}
            >
              {isSelected && (
                <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-[#1D4ED8] rounded-r" />
              )}
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="font-extrabold text-[16px] text-[#0F172A]">
                  제 {issue.issueNo}호
                </span>
                <span
                  className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
                    issue.status === "published"
                      ? "bg-[#D1FAE5] text-[#065F46]"
                      : "bg-[#FEF3C7] text-[#92400E]"
                  }`}
                >
                  {issue.status === "published" ? "발행 완료" : "작성 중"}
                </span>
              </div>
              <p className="text-[14px] text-[#334155] font-semibold truncate">{issue.title}</p>
              <div className="flex items-center justify-between text-[13px] text-[#64748B] mt-1 pt-1 border-t border-[#F1F5F9]">
                <span>{issue.date}</span>
                {issue.status === "published" && (
                  <span className="text-[#065F46] font-bold">열람률 {issue.openRatePct}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ──────── Column 2: Magazine Editor ──────── */
  const editorSlot = (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto" data-testid="magazine-editor-slot">
      {/* Title & Metadata */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <span className="text-[15px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-1 rounded-lg">
            제 {activeIssue.issueNo}호 소식지 편집
          </span>
          <span className="text-[14px] text-[#64748B]">{activeIssue.date}</span>
        </div>

        <div>
          <label className="block text-[16px] font-bold text-[#0F172A] mb-1.5">
            소식지 제목
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full min-h-[48px] px-3.5 text-[17px] font-bold rounded-xl border border-[#64748B] focus:border-[#1D4ED8] outline-none"
          />
        </div>

        <div>
          <label className="block text-[15px] font-bold text-[#0F172A] mb-1.5">
            인사말 및 헤드카피
          </label>
          <textarea
            rows={3}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            className="w-full p-3 text-[15px] leading-relaxed rounded-xl border border-[#64748B] focus:border-[#1D4ED8] outline-none"
          />
        </div>
      </div>

      {/* Featured Deals with 1-Click Insertion Helpers (WP-P5-03) */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h3 className="text-[18px] font-extrabold text-[#0F172A]">금주 추천 매물</h3>
            <p className="text-[14px] text-[#475569]">
              작업공간의 딜카드 또는 Basic IM을 1-클릭으로 바로 소식지에 삽입합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInsertDealCard}
              className="min-h-[40px] px-3 py-1.5 bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] hover:bg-[#DBEAFE] font-bold text-[14px] rounded-xl cursor-pointer"
            >
              + 딜카드 1초 삽입
            </button>
            <button
              type="button"
              onClick={handleInsertIm}
              className="min-h-[40px] px-3 py-1.5 bg-[#F0FDF4] text-[#065F46] border border-[#BBF7D0] hover:bg-[#DCFCE7] font-bold text-[14px] rounded-xl cursor-pointer"
            >
              + 추천 IM 삽입
            </button>
          </div>
        </div>

        {featuredDeals.length === 0 ? (
          <div className="p-8 text-center text-[#64748B] text-[15px] bg-[#FAF9F5] rounded-xl border border-dashed border-[#CBD5E1]">
            소식지에 실을 추천 매물이 아직 없습니다. 상단 버튼을 눌러 추가하세요.
          </div>
        ) : (
          <div className="space-y-3">
            {featuredDeals.map((deal) => (
              <div
                key={deal.id}
                className="p-4 bg-[#FAF9F5] rounded-xl border border-[#CBD5E1] flex items-start justify-between gap-3"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-white bg-[#0F172A] px-2 py-0.5 rounded">
                      {deal.type === "dealcard" ? "딜카드" : "모바일 IM"}
                    </span>
                    <strong className="text-[16px] text-[#0F172A]">{deal.title}</strong>
                    <span className="text-[14px] font-bold text-[#1D4ED8]">{deal.priceBand}</span>
                  </div>
                  <ul className="text-[14px] text-[#475569] space-y-0.5 pt-1">
                    {deal.points.map((pt, idx) => (
                      <li key={idx}>• {pt}</li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDeal(deal.id)}
                  className="text-[14px] font-bold text-[#991B1B] hover:underline p-1 cursor-pointer"
                >
                  제거
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Market Commentary */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 shadow-sm space-y-3">
        <h3 className="text-[18px] font-extrabold text-[#0F172A]">시장 브리핑 및 중개인 코멘트</h3>
        <textarea
          rows={3}
          value={commentary}
          onChange={(e) => setCommentary(e.target.value)}
          className="w-full p-3 text-[15px] leading-relaxed rounded-xl border border-[#64748B] focus:border-[#1D4ED8] outline-none"
        />
      </div>
    </div>
  );

  /* ──────── Column 3: Live Magazine Phone Preview ──────── */
  const previewTabSlot = (
    <div className="inline-flex rounded-xl border border-[#CBD5E1] p-0.5 bg-[#FAF9F5]">
      <button
        type="button"
        onClick={() => setPreviewMode("phone")}
        className={`px-3 py-1.5 text-[14px] font-bold rounded-lg transition-colors cursor-pointer ${
          previewMode === "phone"
            ? "bg-[#0F172A] text-white shadow-xs"
            : "text-[#475569] hover:text-[#0F172A]"
        }`}
      >
        📱 휴대폰 미리보기
      </button>
      <button
        type="button"
        onClick={() => setPreviewMode("web")}
        className={`px-3 py-1.5 text-[14px] font-bold rounded-lg transition-colors cursor-pointer ${
          previewMode === "web"
            ? "bg-[#0F172A] text-white shadow-xs"
            : "text-[#475569] hover:text-[#0F172A]"
        }`}
      >
        🌐 웹 화면
      </button>
    </div>
  );

  const previewSlot = (
    <div className="p-4 space-y-4 max-w-sm mx-auto" data-testid="magazine-preview-slot">
      {/* Phone container mockup */}
      <div className="bg-[#FAF9F5] rounded-3xl border-4 border-[#334155] p-3 shadow-lg space-y-3">
        <div className="flex items-center justify-between text-[12px] font-bold text-[#475569] px-2 pt-1">
          <span>09:41</span>
          <span>주간 소식지 ✉️</span>
        </div>

        {/* Magazine Header */}
        <div className="bg-white rounded-2xl p-4 border border-[#CBD5E1] space-y-2">
          <span className="text-[12px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
            제 {activeIssue.issueNo}호
          </span>
          <h4 className="text-[17px] font-extrabold text-[#0F172A] leading-tight">{title}</h4>
          <p className="text-[13px] text-[#475569] line-clamp-3 leading-relaxed">{intro}</p>
        </div>

        {/* Inserted Deals Preview */}
        {featuredDeals.map((deal) => (
          <div key={deal.id} className="bg-white rounded-2xl p-3 border border-[#CBD5E1] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-1.5 py-0.5 rounded">
                {deal.use}
              </span>
              <strong className="text-[14px] text-[#0F172A]">{deal.priceBand}</strong>
            </div>
            <h5 className="text-[14px] font-extrabold text-[#0F172A] truncate">{deal.title}</h5>
            <p className="text-[12px] text-[#475569] truncate">• {deal.points[0]}</p>
          </div>
        ))}

        {/* Footer */}
        <div className="p-3 bg-white rounded-xl text-center text-[12px] text-[#64748B]">
          크리딜 파트너스 부동산중개법인
        </div>
      </div>
    </div>
  );

  const primaryActionSlot = (
    <button
      type="button"
      disabled={isPublishing}
      onClick={handlePublish}
      className="w-full min-h-[56px] px-6 py-3.5 bg-[#1D4ED8] text-white rounded-2xl font-extrabold text-[17px] hover:bg-[#1E40AF] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
    >
      <span>{isPublishing ? "🚀 발행 중..." : "🚀 발행하고 보내기"}</span>
    </button>
  );

  return (
    <WorkspaceShell
      workspace="magazine"
      listTitle="① 지난 호 보기"
      editorTitle="② 소식지 작성"
      previewTitle="③ 실시간 모바일 미리보기"
      listSlot={listSlot}
      editorSlot={editorSlot}
      previewSlot={previewSlot}
      previewTabSlot={previewTabSlot}
      primaryActionSlot={primaryActionSlot}
      saveStatus={<span className="text-[14px] text-[#065F46] font-semibold">저장됨 · 방금</span>}
      selectedBuildingId={selectedId}
      onBuildingSelect={setSelectedId}
    />
  );
}

export default function MagazineWorkspacePage() {
  return (
    <UndoToastProvider>
      <Suspense fallback={<div className="p-8 text-center text-[#475569]">뉴스레터 로딩 중...</div>}>
        <MagazineWorkspaceInner />
      </Suspense>
    </UndoToastProvider>
  );
}
