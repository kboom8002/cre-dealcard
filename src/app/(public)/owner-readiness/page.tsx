"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Checklist item definition
interface ChecklistItem {
  key: string;
  label: string;
  desc: string;
  weight: number;
  emoji: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    key: "buildingRegister",
    label: "건물 등기부등본",
    desc: "최근 발급된 등기부등본",
    weight: 15,
    emoji: "📋",
  },
  {
    key: "registry",
    label: "건축물대장",
    desc: "건축물 공부 자료",
    weight: 10,
    emoji: "🏛️",
  },
  {
    key: "landUsePlan",
    label: "토지이용계획확인원",
    desc: "용도 지역·지구 확인 서류",
    weight: 10,
    emoji: "🗺️",
  },
  {
    key: "rentRoll",
    label: "임대차 현황 요약표",
    desc: "임차인 구성, 계약 만기, 임대료 요약",
    weight: 20,
    emoji: "📊",
  },
  {
    key: "photos",
    label: "건물 사진",
    desc: "외관, 내부, 주요 공간 사진",
    weight: 10,
    emoji: "📸",
  },
  {
    key: "floorPlan",
    label: "평면도",
    desc: "층별 평면도 또는 스케치",
    weight: 10,
    emoji: "📐",
  },
  {
    key: "repairHistory",
    label: "수선 이력",
    desc: "최근 주요 수선·보수 내역",
    weight: 5,
    emoji: "🔧",
  },
  {
    key: "vacancyStatus",
    label: "공실 현황",
    desc: "현재 공실 여부 및 공실 기간",
    weight: 10,
    emoji: "🏢",
  },
  {
    key: "askingPrice",
    label: "희망 매각가",
    desc: "내부 검토용 희망 가격 (비공개 가능)",
    weight: 5,
    emoji: "💰",
  },
  {
    key: "disclosurePolicy",
    label: "공개 범위 결정",
    desc: "무엇을 공개하고 무엇을 숨길지 결정",
    weight: 5,
    emoji: "🔒",
  },
];

const READINESS_STATE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  not_ready: {
    label: "준비 전 (Not Ready)",
    color: "text-muted-foreground bg-muted/10 border-border/50",
    desc: "기본적인 등기부등본 및 대장 서류부터 차근차근 준비해주세요.",
  },
  public_report_only: {
    label: "공개 리포트 가능 (Radar Ready)",
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    desc: "이 건물, 딜 될까? 분석을 통해 기초적인 시장 가치를 타진해볼 수 있습니다.",
  },
  teaser_ready: {
    label: "블라인드 티저 생성 가능 (Teaser Ready)",
    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    desc: "민감 정보가 가려진 고품질 블라인드 딜카드 배포가 준비되었습니다.",
  },
  snapshot_draft_ready: {
    label: "Snapshot 초안 가능 (Snapshot Draft Ready)",
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    desc: "핵심 물리/임대 현황을 한 장에 요약한 고밀도 스냅샷 제작이 가능합니다.",
  },
  full_im_candidate: {
    label: "Full IM 초안 대상 (Full IM Eligible)",
    color: "text-primary bg-primary/10 border-primary/20",
    desc: "18개 전 섹션을 커버하는 최고 전문성의 투자 설명서(IM) 패키지 생성이 가능합니다.",
  },
};

type ChecklistState = Record<string, boolean>;

interface ReadinessResult {
  readinessCheckId: string;
  readinessScore: number;
  readinessState: string;
  availableOutputs: string[];
  missingData: string[];
  nextRecommendedAction: string;
}

const OUTPUT_LABELS: Record<string, string> = {
  deal_curiosity_report: "🔍 이 건물, 딜 될까? 리포트",
  blind_teaser: "📄 블라인드 딜카드",
  building_snapshot_draft: "🖼️ 건물 Snapshot 초안",
  im_lite_candidate: "📊 IM Lite 후보 등록",
  full_im: "🏆 Full IM 패키지",
};

interface IMSection {
  num: number;
  title: string;
  depKey: string;
  depLabel: string;
  content: string;
}

const IM_SECTIONS: IMSection[] = [
  {
    num: 1,
    title: "요약 (Executive Summary)",
    depKey: "askingPrice",
    depLabel: "희망 매각가",
    content: "본 자산은 서울 핵심 권역에 소재한 우량 실물 자산으로, 뛰어난 접근성과 안정적인 임대 수익을 동시에 확보하고 있습니다. 소유주의 신속한 매각 의지에 따라 시장 대비 경쟁력 있는 가격 구조로 제안되었습니다. 향후 밸류애드(Value-add) 기회가 풍부합니다.",
  },
  {
    num: 2,
    title: "부동산 개요 (Property Overview)",
    depKey: "registry",
    depLabel: "건축물대장",
    content: "소재지: 서울특별시 강남구 역삼동 | 지목: 대 | 대지면적: 485.3㎡ | 연면적: 2,450.1㎡ | 주용도: 업무시설 및 근린생활시설 | 규모: 지하 1층 ~ 지상 6층 | 사용승인일: 2018년 6월",
  },
  {
    num: 3,
    title: "입지 및 권역 분석 (Location & Area Analysis)",
    depKey: "landUsePlan",
    depLabel: "토지이용계획확인원",
    content: "GBD(강남권역) 핵심 오피스 밀집 지역 내 위치. 지하철역 도보 5분 이내 초역세권 입지로 유동인구가 풍부하며 임차 선호도가 매우 높음. 인근 IT 및 테크 벤처 기업 배후수요 탄탄함.",
  },
  {
    num: 4,
    title: "건축 정보 및 스펙 (Building Specifications)",
    depKey: "registry",
    depLabel: "건축물대장",
    content: "구조: 철근콘크리트 구조 | 승강기: 승용 1대 | 주차대수: 자주식 12대 | 외벽 마감: 석재 마감 | 층고: 평균 3.8m로 개방감 우수 | 전력 수용가: 250kW",
  },
  {
    num: 5,
    title: "용도 지역 및 토지 이용 계획 (Zoning & Land Use)",
    depKey: "landUsePlan",
    depLabel: "토지이용계획확인원",
    content: "일반상업지역, 지구단위계획구역 (강남역 주변). 건폐율 상한 60%, 용적률 상한 800% 적용 구역으로 향후 재개발 또는 증축 시 높은 토지 활용 효율성 확보 가능.",
  },
  {
    num: 6,
    title: "임차인 구성 및 임대차 현황 (Tenant Mix & Rent Roll)",
    depKey: "rentRoll",
    depLabel: "임대차 현황 요약표",
    content: "총 임차 기업 수: 8개사 (IT 벤처, 금융 기관, 고급 리테일 구성). 평균 임대차 계약 잔여 기간(WALT): 2.4년. 우량 앵커 테넌트 유치로 안정적 운영 유지 중.",
  },
  {
    num: 7,
    title: "현금 흐름 분석 (Cash Flow Analysis)",
    depKey: "rentRoll",
    depLabel: "임대차 현황 요약표",
    content: "연간 잠정 총매출(GPR): 약 4.8억원. 연간 공실률 손실분(V&C): 5.0% 적용. 기타 수입 포함 연간 유효총소득(EGI): 약 4.56억원 예상. 매년 3.0% 수준의 임대료 인상 조건 반영 가능.",
  },
  {
    num: 8,
    title: "영업 소득 및 비용 - NOI (Operating Income & Expenses)",
    depKey: "repairHistory",
    depLabel: "수선 이력",
    content: "관리비 및 수선비용, 세금 및 보험료 등을 포함한 연간 운영 비용(OPEX): 약 1.2억원. 순영업소득(NOI): 약 3.36억원. 자산 효율성 증대를 위한 OPEX 절감 전략 제안 포함.",
  },
  {
    num: 9,
    title: "재무적 타당성 및 Cap Rate (Financial Feasibility)",
    depKey: "rentRoll",
    depLabel: "임대차 현황 요약표",
    content: "인근 거래 사례 분석 기반 자본환원율(Cap Rate): 4.2%~4.5% 수준 형성. 현 임대 조건 하에서도 충분한 레버리지 효과 및 우수한 지분 수익률(Cash-on-Cash) 기대.",
  },
  {
    num: 10,
    title: "가치평가 및 매각 제안가 (Valuation & Pricing Strategy)",
    depKey: "askingPrice",
    depLabel: "희망 매각가",
    content: "비교사례법 및 수익환원법을 병행한 감정가 범위: 78억원 ~ 82억원. 신속한 매각 성사를 위해 조정된 제안 매각가: 75억원. 평당 가격 기준 권역 평균 대비 8% 할인 수준.",
  },
  {
    num: 11,
    title: "수선/레트로핏 및 개선 ROI (Renovation ROI)",
    depKey: "repairHistory",
    depLabel: "수선 이력",
    content: "로비 현대화 리노베이션 및 친환경 LED 교체, 노후 기계 설비 교체안 제안. 총 투자비용: 약 1.5억원. 리노베이션 후 임대료 12% 인상 가능하여 개선 ROI 약 18.5% 달성 가능.",
  },
  {
    num: 12,
    title: "유사 실거래 및 시장 비교 사례 (Market Comparables)",
    depKey: "registry",
    depLabel: "건축물대장",
    content: "최근 1년간 반경 500m 이내 유사 규모 업무시설 거래 3건 분석. 평당 평균 거래가: 5,800만원 ~ 6,300만원 수준. 본 매각 건은 평당 5,600만원 선으로 강한 가격 경쟁력 확보.",
  },
  {
    num: 13,
    title: "임차 유치 리스크 및 대처 방안 (Risk Analysis)",
    depKey: "vacancyStatus",
    depLabel: "공실 현황",
    content: "리스크 요인: 내년도 상층부 오피스 만기 공실 예정 (300㎡). 대처 방안: 공유 오피스 브랜드 또는 중형 IT 벤처 사전 임차 의향서 확보 전략. 렌트프리 2개월 제공안 시뮬레이션.",
  },
  {
    num: 14,
    title: "대출 구도 및 금융 설계 (Financing & Loan Structure)",
    depKey: "askingPrice",
    depLabel: "희망 매각가",
    content: "LTV 60%~70% 적용 시 1순위 담보대출 한도: 약 45억원 ~ 52억원 선. 선순위 금리 4.1% 수준 대출 주선 협의 완료. 지분 투자금(Equity) 약 25억원 수준으로 매입 추진 가능.",
  },
  {
    num: 15,
    title: "세무 및 법률 검토 (Tax & Legal Considerations)",
    depKey: "buildingRegister",
    depLabel: "건물 등기부등본",
    content: "매각 시 법인세(또는 양도소득세) 최적화 가이드 제공. 토지 및 건물 귀속 가격 안분을 통한 부가가치세 환급 플래닝. 등기부등본상 제한물권(근저당 등) 잔금 시 일시 상환 및 말소 조건 검토 완료.",
  },
  {
    num: 16,
    title: "개발 및 증축 가치 극대화 (Development/Add-value)",
    depKey: "floorPlan",
    depLabel: "평면도",
    content: "용적률 여유 공간 활용 지상 1개층 증축안 검토 (약 80㎡ 증축 가능). 루프탑 정원 조성을 통한 복합 휴게 공간화 추진 시 건물 가치 최대 15% 상승 효과 분석.",
  },
  {
    num: 17,
    title: "공개 범위 및 보안 정책 (Disclosure & Security)",
    depKey: "disclosurePolicy",
    depLabel: "공개 범위 결정",
    content: "본 자산은 블라인드 티저 단계에서 엄격한 정보 차단이 적용됩니다. 임대료 상세 내역 및 등기부 세부는 LOI(매수의향서) 제출 및 NDA(비밀유지약정) 체결 이후 한정 공개됩니다.",
  },
  {
    num: 18,
    title: "다음 권장 조치 및 일정 (Next Recommended Action)",
    depKey: "buildingRegister",
    depLabel: "건물 등기부등본",
    content: "1단계: 매각 준비도 부족 서류 보완 (3일 내) -> 2단계: Full IM Studio 연동 및 전문 분석 의뢰 -> 3단계: 비밀 유지 각서 표준안 마련 -> 4단계: 잠정 매수 후보군 대상 블라인드 태핑 시작.",
  },
];

function LargeReadinessGauge({ score }: { score: number }) {
  const radius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const scoreColor =
    score >= 90
      ? "text-success"
      : score >= 70
        ? "text-primary"
        : score >= 50
          ? "text-warning"
          : "text-destructive";

  return (
    <div className="relative w-36 h-36 flex flex-col items-center justify-center mx-auto select-none">
      <svg className="w-36 h-36 transform -rotate-90">
        <circle
          cx="72"
          cy="72"
          r={radius}
          stroke="currentColor"
          className="text-muted-foreground/10"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx="72"
          cy="72"
          r={radius}
          stroke="currentColor"
          className={`${scoreColor} transition-all duration-1000 ease-out`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-extrabold tracking-tight ${scoreColor}`}>
          {score}
        </span>
        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
          Readiness
        </span>
      </div>
    </div>
  );
}

function IMSectionAccordionItem({
  section,
  isUnlocked,
  isOpen,
  onToggle,
}: {
  section: IMSection;
  isUnlocked: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left font-medium select-none hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono">
            {String(section.num).padStart(2, "0")}
          </span>
          <span className="text-sm font-semibold">{section.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isUnlocked ? (
            <span className="shrink-0 inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-0.5 text-xs font-semibold">
              ✨ AI 초안 작성됨
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center rounded-full bg-warning/10 text-warning border border-warning/20 px-2.5 py-0.5 text-xs font-semibold">
              🔒 {section.depLabel} 필요
            </span>
          )}
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${
              isOpen ? "transform rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50 bg-muted/10">
          {isUnlocked ? (
            <div className="bg-muted/20 border border-border/30 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground/90 select-text">
              {section.content}
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-lg p-4 text-center space-y-2">
              <span className="text-2xl">🔒</span>
              <p className="text-sm font-medium">자료 대입 대기 중</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                이 섹션을 생성하려면 <strong>{section.depLabel}</strong>이(가) 필요합니다.
                상단 체크리스트에서 해당 항목을 체크하고 다시 확인해주세요.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OwnerReadinessContent() {
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [checklist, setChecklist] = useState<ChecklistState>(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, false]))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Buildings selector state
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");

  // IM Outline Section State
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  // Handoff state
  const [handoffLoading, setHandoffLoading] = useState(false);

  // Fetch building list
  useEffect(() => {
    async function loadBuildings() {
      const { data } = await supabase
        .from("building_ssot_lite")
        .select("id, area_signal, asset_type, price_band")
        .order("created_at", { ascending: false });

      let currentBuildings = data || [];

      // Create fallback dummy building if database is completely empty
      if (currentBuildings.length === 0) {
        const { data: newBuilding } = await supabase
          .from("building_ssot_lite")
          .insert({
            input_type: "manual_form",
            raw_input: "오너 준비도용 기본 자산 데이터",
            area_signal: "성수",
            asset_type: "근생빌딩",
            price_band: "50-60억",
            status: "draft",
          })
          .select("id, area_signal, asset_type, price_band")
          .single();

        if (newBuilding) {
          currentBuildings = [newBuilding];
        }
      }

      setBuildings(currentBuildings);

      if (currentBuildings.length > 0) {
        const paramId = searchParams.get("buildingId");
        if (paramId && currentBuildings.some((b) => b.id === paramId)) {
          setSelectedBuildingId(paramId);
        } else {
          setSelectedBuildingId(currentBuildings[0].id);
        }
      }
    }
    loadBuildings();
  }, [searchParams]);

  // Live score calculation
  const liveScore = CHECKLIST_ITEMS.reduce(
    (sum, item) => sum + (checklist[item.key] ? item.weight : 0),
    0
  );
  const checkedCount = Object.values(checklist).filter(Boolean).length;

  function toggleItem(key: string) {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/owner-readiness/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: selectedBuildingId || undefined,
          checklist,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || "확인에 실패했습니다.");

      setResult(json.data);
      // Scroll to result
      setTimeout(() => {
        document.getElementById("readiness-result")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  // Trigger Full IM Handoff Studio import URL
  async function handleFullImHandoff() {
    if (!result) return;
    setHandoffLoading(true);

    try {
      const res = await fetch("/api/full-im-handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_building_ssot_lite_id: selectedBuildingId,
          source_owner_readiness_id: result.readinessCheckId,
          requested_output: "buyer_ready_full_im",
          package_intent: "ai_expert_review",
          full_im_studio_base_url:
            process.env.NEXT_PUBLIC_FULLIM_URL ?? "https://cre-fullim.vercel.app",
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        alert(json?.error?.message ?? "핸드오프 토큰 발급에 실패했습니다.");
        return;
      }

      const token = json.data?.handoff_token;
      const url = json.data?.handoff_url;

      if (url) {
        window.open(url, "_blank");
      } else {
        const fullImUrl = process.env.NEXT_PUBLIC_FULLIM_URL ?? "https://cre-fullim.vercel.app";
        window.open(`${fullImUrl}/im-projects/import?token=${token}`, "_blank");
      }
    } catch (err) {
      console.error("[OwnerReadiness Handoff]", err);
      alert("핸드오프 생성 중 오류가 발생했습니다.");
    } finally {
      setHandoffLoading(false);
    }
  }

  const liveScoreColor =
    liveScore >= 70
      ? "text-success"
      : liveScore >= 40
        ? "text-primary"
        : "text-destructive";

  const stateInfo = result
    ? (READINESS_STATE_LABELS[result.readinessState] ?? READINESS_STATE_LABELS.not_ready)
    : null;

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-32">
      <div className="w-full max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Input Form (Checklist) */}
        <form onSubmit={handleSubmit} className="lg:col-span-5 space-y-6">
          <div className="space-y-2 pt-4">
            <h1 className="text-2xl font-bold tracking-tight">🏢 매각 준비도 점검 (Owner Readiness)</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              자료 준비 현황을 체크하고 지금 생성 가능한 투자설명서(IM) 수준과 18개 섹션 초안을 즉시 확인해보세요.
            </p>
          </div>

          {/* Building Selection Dropdown */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">
              분석 대상 매물 선택 (Select Asset)
            </label>
            {buildings.length > 0 ? (
              <select
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary/50 focus:outline-none"
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.area_signal || "권역 미상"} {b.asset_type || "건물"} ({b.price_band || "가격 미상"})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-muted-foreground">로딩 중...</div>
            )}
          </div>

          {/* Live Score Preview */}
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between shadow-elevation-1">
            <div>
              <p className="text-xs text-muted-foreground">실시간 예상 점수</p>
              <p className={`text-3xl font-extrabold ${liveScoreColor}`}>
                {liveScore}
                <span className="text-base text-muted-foreground font-normal"> / 100</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">선택된 서류</p>
              <p className="text-lg font-bold">
                {checkedCount}
                <span className="text-muted-foreground text-sm font-normal"> / {CHECKLIST_ITEMS.length}</span>
              </p>
            </div>
          </div>

          {/* Checklist Container */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">준비된 자료를 선택하세요</p>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {CHECKLIST_ITEMS.map((item) => {
                const isChecked = checklist[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    id={`check-${item.key}`}
                    onClick={() => toggleItem(item.key)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                      isChecked
                        ? "border-primary bg-primary/5 shadow-elevation-1"
                        : "border-border hover:border-primary/20 hover:bg-muted/10"
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        isChecked
                          ? "border-primary bg-primary text-white"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isChecked && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="text-lg">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold transition-colors ${isChecked ? "text-foreground" : "text-foreground/90"}`}>
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-muted-foreground shrink-0">
                      +{item.weight}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-semibold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-elevation-2 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
            id="cta-check-readiness"
          >
            {isLoading ? "진단 중..." : "매각 준비도 진단하기"}
          </button>
        </form>

        {/* Right Column: Results & Interactive 18-Section IM */}
        <div className="lg:col-span-7 space-y-6">
          {result && stateInfo ? (
            <div id="readiness-result" className="space-y-6 scroll-mt-6">
              
              {/* Score summary & Circular gauge */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-elevation-2 flex flex-col md:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                  <LargeReadinessGauge score={result.readinessScore} />
                </div>
                <div className="flex-1 text-center md:text-left space-y-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${stateInfo.color}`}>
                    {stateInfo.label}
                  </span>
                  <h2 className="text-xl font-bold">자료 매각 준비 상태</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">{stateInfo.desc}</p>
                </div>
              </div>

              {/* Available & Missing lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Available */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-elevation-1">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="text-success">✅</span>
                    <span>지금 생성 가능한 산출물</span>
                  </h3>
                  {result.availableOutputs.length > 0 ? (
                    <div className="space-y-2">
                      {result.availableOutputs.map((output) => (
                        <div key={output} className="flex items-center gap-2 text-xs font-medium bg-muted/30 border border-border/50 rounded-lg px-2.5 py-1.5">
                          <span className="text-success">•</span>
                          <span>{OUTPUT_LABELS[output] || output}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">현재 점수에서 생성 가능한 출물이 없습니다.</p>
                  )}
                </div>

                {/* Missing */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-elevation-1">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="text-warning">📋</span>
                    <span>보완이 필요한 자료</span>
                  </h3>
                  {result.missingData.length > 0 ? (
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {result.missingData.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="text-warning font-bold">-</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[100px] text-xs text-success font-semibold">
                      🎉 모든 서류 준비 완료!
                    </div>
                  )}
                </div>
              </div>

              {/* Next Action Alert */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                <span className="text-lg">💡</span>
                <div className="space-y-0.5">
                  <p className="text-xs text-primary font-bold uppercase tracking-wider">추천 액션 가이드</p>
                  <p className="text-sm font-medium text-foreground/95">{result.nextRecommendedAction}</p>
                </div>
              </div>

              {/* Interactive 18-Section IM Structure Outline */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-elevation-2">
                <div className="space-y-1">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <span>📁</span> 18개 섹션 정밀 IM 초안 구조
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    체크리스트 준비 현황에 실시간 연동되어 락이 해제되는 CRE 정밀 투자설명서 모형입니다.
                  </p>
                </div>

                <div className="space-y-2">
                  {IM_SECTIONS.map((section) => {
                    const isUnlocked = checklist[section.depKey] || false;
                    const isOpen = expandedSection === section.num;
                    return (
                      <IMSectionAccordionItem
                        key={section.num}
                        section={section}
                        isUnlocked={isUnlocked}
                        isOpen={isOpen}
                        onToggle={() => setExpandedSection(isOpen ? null : section.num)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Full IM Studio Handoff CTA (Active when Score >= 70) */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-elevation-2">
                <div className="space-y-1">
                  <h3 className="text-base font-bold">📄 Full IM Studio에서 고품질 투자각서 만들기</h3>
                  <p className="text-xs text-muted-foreground">
                    준비도가 충분히 높은 경우(70점 이상), Full IM Studio로 데이터를 송출해 인쇄용 정식 PDF로 빌드할 수 있습니다.
                  </p>
                </div>

                {result.readinessScore >= 70 ? (
                  <button
                    type="button"
                    onClick={handleFullImHandoff}
                    disabled={handoffLoading}
                    className="inline-flex items-center justify-center w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3.5 text-base font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-blue-500/20"
                    id="cta-full-im-handoff"
                  >
                    {handoffLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Full IM Studio 연동 토큰 발행 중…
                      </>
                    ) : (
                      <>📄 Full IM Studio에서 투자각서 만들기 (즉시 이동)</>
                    )}
                  </button>
                ) : (
                  <div className="rounded-xl bg-muted/50 border border-border p-4 text-center space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      ⚠️ 자금 조달 및 현금흐름 상세 IM 출력을 위한 자료 준비 요함
                    </p>
                    <p className="text-xs text-muted-foreground">
                      체크리스트 보완으로 매각 준비도 점수 <strong>70점 이상</strong>을 달성 시 원클릭 handoff 링크가 활성화됩니다. (현재 {result.readinessScore}점)
                    </p>
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl bg-muted border border-border py-3 text-sm font-semibold text-muted-foreground/60 cursor-not-allowed"
                    >
                      🔒 자료 보완 대기 중
                    </button>
                  </div>
                )}
              </div>

              {/* Expert Note CTA */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-elevation-1">
                <h3 className="text-base font-bold">전문가 3줄 코멘트 받기</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  현재 자산의 매각 구조와 공실 상태에서 어떠한 금융 설계와 개별 마케팅이 가장 효과적인지 상용 수준의 전문가 3줄 검토 메모를 무료로 요청할 수 있습니다.
                </p>
                <Link
                  href={`/expert-note/request?readiness=${result.readinessCheckId}&buildingId=${selectedBuildingId}`}
                  className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/95"
                  id="cta-expert-note-from-readiness"
                >
                  전문가 코멘트 요청하기
                </Link>
              </div>

              {/* Boundary / Safe Advisory Note */}
              <div className="rounded-xl bg-muted/40 border border-border/80 px-4 py-3">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  [준비도 유의 사항] 본 점검은 사용자가 제출한 기초 서류 구비 현황에 기반하여 투자 자산 적격도(IM)를 사전에 매핑해보는 참고용 리포트입니다. 당사는 실제 거래의 가격 구조, 대출 가용 여부, 법률 및 세무적 채무 발생 가능성 등에 대한 어떠한 금전적 보증도 제공하지 않습니다. 모든 법적·재무적 최종 투자 판단은 전문 대리인과의 상의를 권장합니다.
                </p>
              </div>

            </div>
          ) : (
            // Empty view before check is submitted
            <div className="h-full min-h-[400px] border border-dashed border-border rounded-xl bg-card p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-elevation-1">
              <span className="text-5xl">📊</span>
              <div className="space-y-1">
                <h3 className="text-base font-bold">실시간 오너 준비도 분석 리포트</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  왼쪽 양식에서 현재 준비된 서류 항목을 마킹하고 버튼을 클릭하시면 점수와 누락 목록, 18개 섹션 IM 초안 미리보기가 즉시 로드됩니다.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}

export default function OwnerReadinessPage() {
  return (
    <Suspense fallback={<div className="text-center p-12 text-sm text-muted-foreground">오너 준비도 로딩 중...</div>}>
      <OwnerReadinessContent />
    </Suspense>
  );
}
