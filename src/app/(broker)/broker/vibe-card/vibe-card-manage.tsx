"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import {
  Camera,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Share2,
  Pencil,
  FileText,
  Newspaper,
  ChevronLeft,
  Upload,
  Trash2,
  HelpCircle,
  Plus,
  X,
} from "lucide-react";
import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";
import {
  VibeCardHero,
  VibeShareSheet,
  type VibeCardHeroProps,
} from "@/components/vibe-card";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";

// ── Types ─────────────────────────────────────────────

interface VibeManageData {
  slug: string;
  profile: VibeCardHeroProps["profile"];
  broker: VibeCardHeroProps["broker"];
  vibe: VibeCardHeroProps["vibe"];
  template: VibeCardHeroProps["template"];
  professional: VibeCardHeroProps["professional"];
  stats: VibeCardHeroProps["stats"];
  logoCompanyUrl?: string | null;
  logoPartnerUrl?: string | null;
  email?: string;
  latestMagazine?: {
    date: string;
    headline: string;
    url: string;
    marketTemp?: string;
  } | null;
  faqItems?: Array<{q: string; a: string}>;
}

interface Props {
  data: VibeManageData;
}

// ── Logo Upload Card ─────────────────────────────────

function LogoUploadCard({
  label,
  logoUrl,
  defaultUrl,
  type,
  accentColor,
  onUploaded,
}: {
  label: string;
  logoUrl: string | null | undefined;
  defaultUrl: string;
  type: "company" | "partner";
  accentColor: string;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentLogo = logoUrl || defaultUrl;
  const isCustom = !!logoUrl;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch("/api/broker/profile/logo", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("업로드 실패");
      onUploaded();
    } catch {
      alert("로고 업로드에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      const res = await fetch(`/api/broker/profile/logo?type=${type}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("삭제 실패");
      onUploaded();
    } catch {
      alert("로고 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="flex-1 text-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleUpload}
      />
      <p className="text-[10px] font-bold text-neutral-500 mb-2">{label}</p>
      <div
        className="h-[60px] rounded-xl border border-neutral-700 bg-neutral-800/50 flex items-center justify-center mb-2 overflow-hidden"
      >
        <Image
          src={currentLogo}
          alt={label}
          width={80}
          height={40}
          className="object-contain opacity-80"
        />
      </div>
      <div className="flex gap-1.5 justify-center">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3 h-3" style={{ color: accentColor }} />
          {uploading ? "..." : "변경"}
        </button>
        {isCustom && (
          <button
            onClick={handleRemove}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-neutral-800 hover:bg-neutral-700 text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            제거
          </button>
        )}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────

export function VibeCardManage({ data }: Props) {
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenStatus, setRegenStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // FAQ state
  const FAQ_PLACEHOLDERS = [
    "주요 전문 분야와 활동 권역은 어디인가요?",
    "상담 및 수수료 정책은 어떻게 되나요?",
    "매물 임장이나 현장 방문이 가능한가요?",
    "계약 진행 절차는 어떻게 되나요?",
    "법인 대상 투자자문도 하시나요?",
    "매물 정보는 얼마나 자주 업데이트되나요?",
    "긴급 상담이나 야간 연락도 가능한가요?",
  ];
  const initFaq = (data.faqItems && data.faqItems.length > 0)
    ? data.faqItems.map(item => ({ q: item.q || "", a: item.a || "" }))
    : [{ q: "", a: "" }];
  const [faqItems, setFaqItems] = useState<Array<{q: string; a: string}>>(initFaq);
  const [faqSaving, setFaqSaving] = useState(false);
  const [faqSaved, setFaqSaved] = useState(false);

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://www.credeal.net";
  const vibeCardUrl = `${siteUrl}/vibe-card/${data.slug}`;

  const css = data.template?.css;
  const accentColor = css?.accentColor || "#8b5cf6";

  // ── Copy URL ──
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(vibeCardUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = vibeCardUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [vibeCardUrl]);

  // ── Photo change ──
  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRegenerating(true);
    setRegenStatus("사진 업로드 중...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/broker/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("업로드 실패");

      const { url } = await res.json();

      setRegenStatus("✨ Vibe AI 분석 중...");

      // 동기적으로 vibe-analyze 호출 (비동기 trigger의 race condition 방지)
      const analyzeRes = await fetch("/api/broker/vibe-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_url: url }),
      });
      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || "Vibe AI 분석에 실패했습니다.");
      }

      setRegenStatus("✅ 분석 완료! 새로고침합니다...");
      await new Promise((r) => setTimeout(r, 1500));
      window.location.reload();
    } catch {
      setRegenStatus("❌ 업로드 실패. 다시 시도해주세요.");
      setTimeout(() => {
        setRegenerating(false);
        setRegenStatus(null);
      }, 3000);
    }
  }, []);

  // ── Regenerate ──
  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    setRegenStatus("🔄 Vibe AI 재분석 요청 중...");

    try {
      const photoUrl = data.profile.photoUrl;
      if (!photoUrl) {
        setRegenStatus("❌ 프로필 사진이 없습니다. 먼저 사진을 업로드해주세요.");
        setTimeout(() => {
          setRegenerating(false);
          setRegenStatus(null);
        }, 3000);
        return;
      }

      setRegenStatus("✨ Vibe AI 분석 중...");

      const res = await fetch("/api/broker/vibe-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_url: photoUrl }),
      });

      if (!res.ok) throw new Error("재분석 실패");

      setRegenStatus("✅ 분석 완료!");
      await new Promise((r) => setTimeout(r, 1500));
      window.location.reload();
    } catch {
      setRegenStatus("❌ 재분석 실패. 다시 시도해주세요.");
      setTimeout(() => {
        setRegenerating(false);
        setRegenStatus(null);
      }, 3000);
    }
  }, [data.profile.photoUrl]);

  // ── Analyze existing profile photo ──
  const handleAnalyzeExistingPhoto = useCallback(async () => {
    const photoUrl = data.profile.photoUrl;
    if (!photoUrl) return;

    setRegenerating(true);
    setRegenStatus("✨ 기존 사진으로 Vibe AI 분석 중...");

    try {
      const res = await fetch("/api/broker/vibe-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_url: photoUrl }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || "Vibe 분석에 실패했습니다.");
      }

      setRegenStatus("✅ 분석 완료! 새로고침합니다...");
      await new Promise((r) => setTimeout(r, 1500));
      window.location.reload();
    } catch (err: any) {
      setRegenStatus(`❌ ${err.message || "분석 실패. 다시 시도해주세요."}`);
      setTimeout(() => {
        setRegenerating(false);
        setRegenStatus(null);
      }, 3000);
    }
  }, [data.profile.photoUrl]);

  const handleLogoUploaded = () => window.location.reload();

  const hasVibe = !!data.vibe;

  return (
    <main className="min-h-screen bg-[#0a0e1a] text-white pb-24">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0a0e1a]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/broker" className="flex items-center gap-1 text-neutral-400 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-xs">홈</span>
          </Link>
          <h1 className="text-sm font-bold">📇 내 Vibe 명함</h1>
          <button
            onClick={() => setShareOpen(true)}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* ── Vibe Card Preview ── */}
        {hasVibe ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link href={`/vibe-card/${data.slug}`} target="_blank" className="block">
              <VibeCardHero
                profile={data.profile}
                broker={data.broker}
                vibe={data.vibe}
                template={data.template}
                professional={data.professional}
                stats={data.stats}
                logoCompanyUrl={data.logoCompanyUrl || undefined}
                logoPartnerUrl={data.logoPartnerUrl || undefined}
                email={data.email}
                latestMagazine={data.latestMagazine}
              />
            </Link>
            <p className="text-center text-[10px] text-neutral-500 mt-2">
              카드를 탭하면 공개 페이지로 이동합니다
            </p>

            {/* ── 명함 이름/타이틀 편집 ── */}
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-3">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">명함 표시 정보</p>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">이름 (명함에 표시)</label>
                <input
                  defaultValue={data.profile.displayName}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (!val || val === data.profile.displayName) return;
                    try {
                      await fetch("/api/broker/profile", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ card_name: val }),
                      });
                      window.location.reload();
                    } catch { /* silent */ }
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500/50 transition-colors"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">타이틀 (직함 · 전문 분야)</label>
                <input
                  defaultValue={data.profile.cardTitle}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (!val || val === data.profile.cardTitle) return;
                    try {
                      await fetch("/api/broker/profile", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ card_title: val }),
                      });
                      window.location.reload();
                    } catch { /* silent */ }
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500/50 transition-colors"
                  placeholder="CRE 투자 전문가"
                />
                <p className="text-[10px] text-neutral-600 mt-1">예: 공인중개사, CRE 투자 전문가, 상업용 부동산 컨설턴트</p>
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">이메일 (명함에 표시)</label>
                <input
                  defaultValue={data.email || ""}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val === (data.email || "")) return;
                    try {
                      await fetch("/api/broker/profile", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contact_email: val || null }),
                      });
                      window.location.reload();
                    } catch { /* silent */ }
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500/50 transition-colors"
                  placeholder="hong@example.com"
                />
                <p className="text-[10px] text-neutral-600 mt-1">비워두면 가입 이메일이 사용됩니다</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center"
          >
            <p className="text-4xl mb-3">📸</p>
            <p className="text-sm font-bold text-neutral-300 mb-1">아직 Vibe 분석이 없습니다</p>
            <p className="text-xs text-neutral-500 mb-5">
              사진을 업로드하면 AI가 자동으로 분석합니다
            </p>
            <div className="flex flex-col items-center gap-3">
              {data.profile.photoUrl && (
                <button
                  onClick={handleAnalyzeExistingPhoto}
                  disabled={regenerating}
                  className="w-full max-w-[240px] px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: accentColor, color: "#000" }}
                >
                  ✨ 기존 프로필 사진으로 분석
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={regenerating}
                className="w-full max-w-[240px] px-5 py-2.5 rounded-xl text-sm font-bold transition-all border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50"
              >
                📷 새 사진 업로드하기
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Regenerating overlay ── */}
        {regenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-4 text-center"
          >
            <RefreshCw className="w-5 h-5 text-violet-400 mx-auto mb-2 animate-spin" />
            <p className="text-sm font-medium text-violet-300">{regenStatus}</p>
          </motion.div>
        )}

        {/* ── Action Buttons ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={regenerating}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-sm font-medium transition-all disabled:opacity-50"
          >
            <Camera className="w-4 h-4 text-amber-400" />
            사진 변경
          </button>

          <button
            onClick={handleRegenerate}
            disabled={regenerating || !hasVibe}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-sm font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            재분석
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-sm font-medium transition-all"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-green-400">복사됨!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-blue-400" />
                URL 복사
              </>
            )}
          </button>

          <Link
            href={`/vibe-card/${data.slug}`}
            target="_blank"
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-sm font-medium transition-all"
          >
            <ExternalLink className="w-4 h-4 text-purple-400" />
            공개 보기
          </Link>
        </div>

        {/* ── Logo Settings ── */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-4">로고 설정</p>
          <div className="flex gap-4">
            <LogoUploadCard
              label="회사 로고 (좌측)"
              logoUrl={data.logoCompanyUrl}
              defaultUrl="/logos/default-company-logo.png"
              type="company"
              accentColor={accentColor}
              onUploaded={handleLogoUploaded}
            />
            <LogoUploadCard
              label="제휴사 로고 (우측)"
              logoUrl={data.logoPartnerUrl}
              defaultUrl="/logos/default-partner-logo.png"
              type="partner"
              accentColor={accentColor}
              onUploaded={handleLogoUploaded}
            />
          </div>
          <p className="text-[9px] text-neutral-600 mt-3 text-center">
            투명 PNG 권장 · 최대 2MB · 명함 하단에 표시됩니다
          </p>
        </div>

        {/* ── Public URL ── */}
        {data.slug && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-2">공개 URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-neutral-300 bg-neutral-800 rounded-lg px-3 py-2 truncate">
                credeal.net/vibe-card/{data.slug}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 transition-colors"
              >
                {copied ? "✅" : "복사"}
              </button>
            </div>
          </div>
        )}

        {/* ── Vibe Analysis Results (Internal) ── */}
        {data.vibe && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5"
          >
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-3">Vibe AI 분석 결과 (내부용)</p>
            <div className="space-y-3">
              {data.vibe.vtiMeta && (
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{data.vibe.vtiMeta.emoji}</span>
                  <div>
                    <p className="text-sm font-bold" style={{ color: data.vibe.vtiMeta.color }}>
                      {data.vibe.vtiMeta.labelKo}
                    </p>
                    <p className="text-[10px] text-neutral-500">{data.vibe.vtiMeta.label} · {data.vibe.vtiMeta.description}</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-800">
                {data.vibe.valence != null && (
                  <div>
                    <p className="text-[10px] text-neutral-500">Valence</p>
                    <p className="text-lg font-bold text-amber-400">{Math.round(data.vibe.valence * 100)}</p>
                  </div>
                )}
                {data.vibe.trust != null && (
                  <div>
                    <p className="text-[10px] text-neutral-500">Trust</p>
                    <p className="text-lg font-bold text-emerald-400">{Math.round(data.vibe.trust * 100)}</p>
                  </div>
                )}
              </div>
              {data.template && (
                <div className="pt-2 border-t border-neutral-800">
                  <p className="text-[10px] text-neutral-500">템플릿</p>
                  <p className="text-xs font-medium text-neutral-300">{data.template.nameKo} ({data.template.name})</p>
                </div>
              )}
              {data.vibe.analyzedAt && (
                <p className="text-[10px] text-neutral-600 pt-1">
                  분석일: {new Date(data.vibe.analyzedAt).toLocaleDateString("ko-KR")}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* ── FAQ Editor ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4" style={{ color: accentColor }} />
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">자주 묻는 질문 (FAQ)</p>
            </div>
            <button
              onClick={async () => {
                setFaqSaving(true);
                try {
                  const validItems = faqItems.filter(item => item.q.trim() || item.a.trim());
                  const res = await fetch("/api/broker/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ faq_items: validItems }),
                  });
                  if (!res.ok) throw new Error();
                  setFaqSaved(true);
                  setTimeout(() => setFaqSaved(false), 2000);
                } catch {
                  alert("FAQ 저장에 실패했습니다.");
                } finally {
                  setFaqSaving(false);
                }
              }}
              disabled={faqSaving}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors"
              style={{
                backgroundColor: faqSaved ? '#22c55e20' : `${accentColor}15`,
                color: faqSaved ? '#22c55e' : accentColor,
              }}
            >
              {faqSaved ? <><Check className="w-3 h-3" /> 저장됨</> : faqSaving ? "저장 중..." : "저장"}
            </button>
          </div>

          <div className="space-y-4">
            {faqItems.map((item, idx) => (
              <div key={idx} className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold" style={{ color: accentColor }}>Q{idx + 1}</span>
                  {faqItems.length > 1 && (
                    <button
                      onClick={() => setFaqItems(prev => prev.filter((_, i) => i !== idx))}
                      className="p-0.5 rounded hover:bg-neutral-700 text-neutral-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={item.q}
                  onChange={(e) => {
                    const updated = [...faqItems];
                    updated[idx] = { ...updated[idx], q: e.target.value };
                    setFaqItems(updated);
                  }}
                  placeholder={FAQ_PLACEHOLDERS[idx] || "질문을 입력하세요"}
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                />
                <textarea
                  value={item.a}
                  onChange={(e) => {
                    const updated = [...faqItems];
                    updated[idx] = { ...updated[idx], a: e.target.value };
                    setFaqItems(updated);
                  }}
                  placeholder="답변을 입력하세요"
                  rows={2}
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors resize-none"
                />
              </div>
            ))}
          </div>

          {faqItems.length < 7 && (
            <button
              onClick={() => setFaqItems(prev => [...prev, { q: "", a: "" }])}
              className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 transition-colors text-[11px] font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              질문 추가 (남은: {7 - faqItems.length}개)
            </button>
          )}

          <p className="text-[10px] text-neutral-600 px-1">
            💡 입력하지 않은 FAQ는 명함에 표시되지 않습니다.
          </p>
        </div>

        {/* ── Quick Links ── */}
        <div className="space-y-2">
          <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold px-1">바로가기</p>

          <Link
            href="/broker/profile"
            className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50 transition-colors"
          >
            <Pencil className="w-4 h-4 text-cyan-400" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">프로필 편집</p>
              <p className="text-[10px] text-neutral-500">이름, 전문 분야, 자기소개 수정</p>
            </div>
          </Link>

          {data.stats.activeCount > 0 && (
            <Link
              href="/broker/buildings?tab=im"
              className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50 transition-colors"
            >
              <FileText className="w-4 h-4 text-amber-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">모바일 IM</p>
                <p className="text-[10px] text-neutral-500">활성 매물 {data.stats.activeCount}건 · 하단에 Vibe 명함 연동됨</p>
              </div>
            </Link>
          )}

          {data.latestMagazine?.url ? (
            <Link
              href={data.latestMagazine.url}
              className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50 transition-colors"
            >
              <Newspaper className="w-4 h-4 text-rose-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">주간 매거진</p>
                <p className="text-[10px] text-neutral-500">{data.latestMagazine.headline}</p>
              </div>
            </Link>
          ) : (
            <div
              className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 bg-neutral-900/50 opacity-50 cursor-not-allowed"
            >
              <Newspaper className="w-4 h-4 text-rose-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">주간 매거진</p>
                <p className="text-[10px] text-neutral-500">아직 발행된 매거진이 없습니다</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Share Sheet */}
      <VibeShareSheet
        slug={data.slug}
        cardTitle={`${data.profile.displayName} — ${data.profile.cardTitle || '공인중개사'}`}
        cardDescription={data.broker?.bio || data.profile.tagline || ""}
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
      />

      <BrokerBottomNav />
    </main>
  );
}
