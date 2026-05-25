"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Profile {
  id: string;
  investor_type: "general" | "qualified" | "professional";
  investment_preference: string[];
  preferred_sectors: string[];
  investment_min: number;
  investment_max: number;
  max_risk_tolerance: number;
  expected_return_min: number;
  investment_horizon_months: number;
  must_have_criteria: string[];
  nice_to_have_criteria: string[];
  kyc_verified: boolean;
  kyc_verified_at: string | null;
}

export default function FundingInvestorPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rawMemo, setRawMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/funding/investor/profile");
      if (!res.ok) throw new Error("투자자 프로파일을 불러오지 못했습니다.");
      const json = await res.json();
      if (json.ok) {
        setProfile(json.data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  async function handleSaveMemo(e: React.FormEvent) {
    e.preventDefault();
    if (!rawMemo.trim()) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/funding/investor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawMemo }),
      });

      if (!res.ok) throw new Error("AI 투자 성향 분석 실패");
      const json = await res.json();
      if (json.ok) {
        setProfile(json.data);
        setMessage("AI가 귀하의 비구조화 투자 메모를 분석하여 투자 성향 프로파일을 성공적으로 구성했습니다!");
        setRawMemo("");
      } else {
        throw new Error(json.error || "프로파일 수정 실패");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleKYCVerify(targetType: "qualified" | "professional") {
    setVerifying(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/funding/gate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType }),
      });

      if (!res.ok) throw new Error("인증 실패");
      const json = await res.json();
      if (json.ok) {
        setProfile(json.data);
        setMessage(`축하합니다! ${targetType === "qualified" ? "소득적격투자자 (G3)" : "전문투자자 (G4)"} 인증 심사가 완료되어 권한이 즉시 승격되었습니다!`);
      } else {
        throw new Error(json.error || "승격 실패");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground font-semibold">투자자 프로필 분석 중...</p>
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 bg-background">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">👤 투자자 프로필 & KYC 관리</h1>
            <p className="text-sm text-muted-foreground">
              투자 적격인증(KYC) 심사 및 AI 기반 투자 성향 분석 관리
            </p>
          </div>
          <Link href="/funding/marketplace" className="text-sm font-semibold text-primary hover:underline">
            마켓플레이스 이동
          </Link>
        </div>

        {/* Notifications */}
        {message && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            ✅ {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            ⚠️ {error}
          </div>
        )}

        {/* KYC Gate verification card */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-foreground">🔐 적격투자자 KYC Gate 인증 시뮬레이터</h2>
              <p className="text-xs text-muted-foreground">
                현 상태: <span className="font-bold text-primary">{profile?.investor_type === "professional" ? "전문투자자 (G4)" : profile?.investor_type === "qualified" ? "소득적격투자자 (G3)" : profile?.kyc_verified ? "일반투자자 (G2)" : "회원가입 회원 (G1)"}</span>
                {profile?.kyc_verified && ` (인증일: ${new Date(profile.kyc_verified_at!).toLocaleDateString("ko-KR")})`}
              </p>
            </div>
            <span className="text-xs font-bold bg-primary/20 text-primary px-2.5 py-0.5 rounded-full uppercase">
              Gate 레벨 {profile?.investor_type === "professional" ? "G4" : profile?.investor_type === "qualified" ? "G3" : profile?.kyc_verified ? "G2" : "G1"}
            </span>
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed bg-card p-4 rounded border border-border">
            ⚠️ <strong>자본시장법 고지</strong>: G3(소득적격) 또는 G4(전문투자자) 증빙 자료(근로소득원천징수증, 은행 잔고 증빙, 금융투자협회 자격증 등)를 시뮬레이션 업로드하면,
            제한 해제되어 비공개 정보(SSoT 상세, 숨김 주소, 정밀 세무 시나리오 계산)에 대한 실시간 AI Gate 열람 권한이 자동 검증 및 해제됩니다.
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => handleKYCVerify("qualified")}
              disabled={verifying || profile?.investor_type === "qualified" || profile?.investor_type === "professional"}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/95 transition-all disabled:opacity-50"
            >
              📄 소득적격투자자 (G3) 자격 승격 신청
            </button>
            <button
              onClick={() => handleKYCVerify("professional")}
              disabled={verifying || profile?.investor_type === "professional"}
              className="flex-1 py-2.5 bg-foreground text-background rounded-lg text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50"
            >
              🛡️ 전문투자자 / 기관 (G4) 일괄 승격 신청
            </button>
          </div>
        </div>

        {/* AI Normalizer Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* AI Parsing input */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">✍️ 비구조화 투자 성향 AI 분석</h2>
            <form onSubmit={handleSaveMemo} className="space-y-3">
              <textarea
                rows={6}
                value={rawMemo}
                onChange={(e) => setRawMemo(e.target.value)}
                placeholder="예: 저는 주로 서울 강남권 오피스나 리테일 건물에 연 8% 이상 배당 수익을 주는 부동산 STO에 최소 3000만원 이상 5000만원 한도로 투자하고 싶습니다. 투자 만기는 24개월 내로 선호하며, 원금 안정성(낮은 리스크 등급)이 최우선이고 미공개 정보나 RLS 필터링이 잘 된 매물을 좋아합니다."
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-xs focus:outline-none focus:border-primary"
                required
              />
              <button
                type="submit"
                disabled={saving || !rawMemo.trim()}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold shadow hover:bg-primary/95 transition-all disabled:opacity-50"
              >
                {saving ? "AI 성향 분석 중..." : "🚀 투자 선호도 AI 자동 추출 및 저장"}
              </button>
            </form>
          </div>

          {/* Current structured profile display */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">📊 구조화 투자자 성향 (SSoT)</h2>
            {profile ? (
              <div className="space-y-2 text-xs leading-normal">
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">투자자 유형:</span>
                  <span className="font-semibold text-foreground uppercase">{profile.investor_type}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">선호 자산 부문:</span>
                  <span className="font-semibold text-foreground">{profile.preferred_sectors.join(", ") || "전체"}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">투자 한도:</span>
                  <span className="font-semibold text-foreground">
                    {(profile.investment_min / 10000).toLocaleString()}만 ~ {(profile.investment_max / 10000).toLocaleString()}만원
                  </span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">허용 리스크 등급:</span>
                  <span className="font-semibold text-rose-500">{profile.max_risk_tolerance}등급 이하 / 5</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">최소 희망 연 수익률:</span>
                  <span className="font-semibold text-primary">{profile.expected_return_min}%</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">선호 투자 기간:</span>
                  <span className="font-semibold text-foreground">{profile.investment_horizon_months}개월 내</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-10">
                왼쪽 양식에 평소 본인의 투자 스타일을 자유롭게 입력하시면 투자 프로파일이 생성됩니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
