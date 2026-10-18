'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { StaggerContainer, StaggerItem } from '@/components/motion/sota-motion';
import { computeDataQualityBadge } from '@/domain/building/mobile-im/data-quality-badge';
import { resolveEnrichment } from '@/domain/building/im-core/resolve-enrichment';
import { toast } from 'sonner';
import { normalizeSectionMarkdown } from '@/lib/utils/markdown-normalizer';
import { PHOTO_CATEGORY_LABELS } from '@/domain/building/mobile-im/photo-url-transformer';

/** 중개인 태깅용 사진 유형 (시스템 전용 'map'·'hero' 제외 15종) */
const TAGGABLE_PHOTO_CATEGORIES = (Object.keys(PHOTO_CATEGORY_LABELS) as Array<keyof typeof PHOTO_CATEGORY_LABELS>)
  .filter((c) => c !== 'map' && c !== 'hero');

type EditablePhoto = {
  url: string;
  caption?: string;
  order?: number;
  category?: string;
  type?: string;
  label?: string;
  role?: string;
  isHero?: boolean;
  excluded?: boolean;
};

/** body.gateReport (렌트롤 v1.5 게이트 V01·V12 범위) — 화면에 쓰는 필드만 */
type ApprovalGateReport = {
  blocked?: boolean;
  failedBlocks?: Array<{ id: string; label: string }>;
};

/** V12 해제 사유 한도 — 서버(RENTROLL_META_LIMITS.overrideReasonChars)와 동일 */
const V12_REASON_MAX = 200;

interface IMSection {
  section_type: string;
  title: string;
  markdown: string;
  confidence?: "confirmed" | "inferred" | "needs_check";
  aiRole?: string;
}

interface Props {
  docId: string;
  title: string;
  content: Record<string, unknown>;
  status: string;
  buildingId: string;
  createdAt: string;
  posture?: string;
  kakaoMapUrl?: string | null;
}

export function IMApprovalClient({ docId, title, content, status: initialStatus, buildingId, createdAt, posture, kakaoMapUrl }: Props) {
  // content.sections가 배열인지 안전하게 확인
  const rawSections = Array.isArray(content?.sections) ? content.sections : [];
  const [sections, setSections] = useState<IMSection[]>(rawSections as IMSection[]);
  const [currentApprovalHash, setCurrentApprovalHash] = useState<string>(
    (content as any)?.approval_target_hash || (content as any)?.targetHash || ''
  );
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editableTitle, setEditableTitle] = useState(title);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPublishedModal, setShowPublishedModal] = useState(false);
  const router = useRouter();
  
  // Track which sections have been verified by the broker
  const initialVerified = new Set(
    sections.map((s, i) => s.confidence === 'confirmed' ? i : -1).filter(i => i !== -1)
  );
  const [verifiedSet, setVerifiedSet] = useState<Set<number>>(initialVerified);

  const [actionStatus, setActionStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [resultMsg, setResultMsg] = useState('');
  const [docStatus, setDocStatus] = useState(initialStatus);
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');

  // 렌트롤 게이트(V01·V12) 리포트 — 승인 시점 V12 해제 후 서버가 돌려준 최신 리포트로 교체된다
  const [gateReport, setGateReport] = useState<ApprovalGateReport | null>(
    ((content as any)?.gateReport as ApprovalGateReport | undefined) ?? null
  );
  const [v12Reason, setV12Reason] = useState('');
  const [v12Applying, setV12Applying] = useState(false);
  const blockedGates = gateReport?.blocked === true && Array.isArray(gateReport.failedBlocks) ? gateReport.failedBlocks : [];
  const hasV12Block = blockedGates.some((g) => g.id === 'V12');
  const hasOtherBlock = blockedGates.some((g) => g.id !== 'V12');

  // OG Meta States
  const [ogTitle, setOgTitle] = useState((content as any)?.ogTitle || '');
  const [ogDescription, setOgDescription] = useState((content as any)?.ogDescription || '');
  const [ogTimestamp, setOgTimestamp] = useState(Date.now());
  const [isOgSaving, setIsOgSaving] = useState(false);
  const [isOgMetaDirty, setIsOgMetaDirty] = useState(false);

  // Hero Content States
  const [heroTitle, setHeroTitle] = useState((content as any)?.heroTitle || title || '');
  const [heroSubtitle, setHeroSubtitle] = useState((content as any)?.heroSubtitle || '');
  // Bug 3 클라이언트 폴백: 기존 DB 문서에 디폴트 문장이 저장된 경우,
  // investment_thesis 섹션에서 의미 있는 첫 문장을 추출하여 대체
  const extractedKeyPoint = (() => {
    const raw = (content as any)?.heroCard?.keyInvestmentPoint || (content as any)?.keyInvestmentPoint || '';
    // 디폴트 문장 패턴 감지 (area_signal + asset_type + 희망가 + 투자 검토)
    if (raw && !raw.includes('투자 검토 자료입니다')) return raw;
    // 디폴트이므로 investment_thesis에서 추출 시도
    const thesisSec = rawSections.find((s: any) => s.section_type === 'investment_thesis');
    if (thesisSec && (thesisSec as any).markdown) {
      const lines = ((thesisSec as any).markdown as string).split('\n').map(l => l.trim()).filter(Boolean);
      const meaningful = lines
        .filter(l => l.length > 15 && !l.startsWith('#'))
        .map(l => l.replace(/^[-*0-9.\s]+/, '').replace(/\*\*/g, '').trim())
        .filter(l => l.length > 10);
      if (meaningful.length > 0) return meaningful[0];
    }
    return raw;
  })();
  const [heroKeyPoint, setHeroKeyPoint] = useState(extractedKeyPoint);
  // Bug 3: 3대 핵심 투자 포인트 편집 — heroCard.keyPoints에서 초기화
  const [heroKeyPoints, setHeroKeyPoints] = useState<string[]>(() => {
    const hc = (content as any)?.heroCard;
    if (Array.isArray(hc?.keyPoints) && hc.keyPoints.length > 0) return [...hc.keyPoints];
    // 폴백: investment_thesis 섹션에서 불릿 추출
    const thesis = rawSections.find((s: any) => s.section_type === 'investment_thesis');
    if (thesis && (thesis as any).markdown) {
      const lines = ((thesis as any).markdown as string).split('\n').map(l => l.trim()).filter(Boolean);
      const bullets = lines
        .filter(l => /^[-*•·]\s|^\d+[.)]\s|^\*\*/.test(l))
        .map(l => l.replace(/^[-*•·0-9.):\s]+/, '').replace(/\*\*/g, '').trim())
        .filter(l => l.length > 10);
      if (bullets.length > 0) return bullets.slice(0, 3);
    }
    return ['', '', ''];
  });
  const [isHeroSaving, setIsHeroSaving] = useState(false);
  const [isHeroDirty, setIsHeroDirty] = useState(false);

  const saveOgMeta = async () => {
    setIsOgSaving(true);
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections,
          title: editableTitle,
          hidden_sections: Array.from(hiddenSections),
          photos,
          ogTitle,
          ogDescription,
        }),
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData.targetHash) setCurrentApprovalHash(resData.targetHash);
        setOgTimestamp(Date.now());
        setIsOgMetaDirty(false);
      }
    } catch (err) {
      console.error("Failed to save OG meta", err);
    } finally {
      setIsOgSaving(false);
    }
  };

  const saveHeroContent = async () => {
    setIsHeroSaving(true);
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections,
          title: heroTitle,
          hidden_sections: Array.from(hiddenSections),
          photos,
          heroTitle,
          heroSubtitle,
          keyInvestmentPoint: heroKeyPoint,
          keyPoints: heroKeyPoints.filter(Boolean),
        }),
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData.targetHash) setCurrentApprovalHash(resData.targetHash);
        setEditableTitle(heroTitle);
        setIsHeroDirty(false);
      }
    } catch (err) {
      console.error('Failed to save hero content', err);
    } finally {
      setIsHeroSaving(false);
    }
  };

  const handleDeleteDraft = async () => {
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}`, { method: "DELETE" });
      if (res.ok) {
        router.push(`/broker/deal-card/${buildingId}`);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // 섹션 숨김
  const initialHidden = new Set<string>(
    Array.isArray((content as any)?.hidden_sections) ? (content as any).hidden_sections : []
  );
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(initialHidden);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // 사진 캡션
  const [photos, setPhotos] = useState<EditablePhoto[]>(
    Array.isArray(content?.photos)
      ? (content.photos as any[])
      : Array.isArray(content?.photo_urls)
      ? (content.photo_urls as string[]).map((url, i) => ({ url, caption: '', order: i }))
      : []
  );

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditDraft(sections[idx].markdown);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditDraft('');
  };

  const saveEdit = async (idx: number) => {
    const newSections = [...sections];
    newSections[idx] = { 
      ...newSections[idx], 
      markdown: editDraft,
      confidence: 'confirmed', // Broker has edited/verified it
    };
    
    setSections(newSections);
    setEditingIdx(null);
    
    const newVerified = new Set(verifiedSet);
    newVerified.add(idx);
    setVerifiedSet(newVerified);

    // Auto-save to DB
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: newSections,
          title: editableTitle,
          hidden_sections: Array.from(hiddenSections),
          photos,
        }),
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData.targetHash) setCurrentApprovalHash(resData.targetHash);
      }
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const toggleVerify = async (idx: number) => {
    const isVerified = verifiedSet.has(idx);
    const newVerified = new Set(verifiedSet);
    const newSections = [...sections];

    if (isVerified) {
      newVerified.delete(idx);
    } else {
      newVerified.add(idx);
      newSections[idx].confidence = 'confirmed';
    }

    setVerifiedSet(newVerified);
    setSections(newSections);

    if (!isVerified) {
      try {
        const res = await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: newSections,
            hidden_sections: Array.from(hiddenSections),
            photos,
          }),
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData.targetHash) setCurrentApprovalHash(resData.targetHash);
        }
      } catch (err) {
        console.error("Save failed", err);
      }
    }
  };

  /** 60대 초심자 중개인 편의: 11개 섹션을 한 번에 일괄 확인 완료 처리 */
  const verifyAllSections = async () => {
    const allIndices = new Set(sections.map((_, idx) => idx));
    const newSections = sections.map((s) => ({ ...s, confidence: 'confirmed' as const }));
    setVerifiedSet(allIndices);
    setSections(newSections);
    toast.success(`전체 ${sections.length}개 섹션이 일괄 확인 완료되었습니다.`);
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: newSections,
          hidden_sections: Array.from(hiddenSections),
          photos,
        }),
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData.targetHash) setCurrentApprovalHash(resData.targetHash);
      }
    } catch (err) {
      console.error("Bulk verify save failed", err);
    }
  };

  /** 미확인 상태인 첫 번째 섹션으로 자동 스크롤 이동 */
  const scrollToNextUnverified = () => {
    const nextIdx = sections.findIndex((_, idx) => !verifiedSet.has(idx));
    if (nextIdx === -1) return;
    const el = document.querySelector(`[data-approval-section-idx="${nextIdx}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.info(`${nextIdx + 1}번 '${sections[nextIdx]?.title}' 섹션을 확인해 주세요.`);
    }
  };

  const toggleHideSection = useCallback(async (idx: number) => {
    const sectionId = sections[idx]?.section_type;
    if (!sectionId) return;
    const newHidden = new Set(hiddenSections);
    if (newHidden.has(sectionId)) {
      newHidden.delete(sectionId);
    } else {
      newHidden.add(sectionId);
    }
    setHiddenSections(newHidden);
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections,
          hidden_sections: Array.from(newHidden),
          photos,
        }),
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData.targetHash) setCurrentApprovalHash(resData.targetHash);
      }
    } catch (err) { console.warn('[im-approval]', err); }
  }, [sections, hiddenSections, docId, photos]);

  const updatePhotoCaption = (idx: number, caption: string) => {
    const newPhotos = [...photos];
    newPhotos[idx] = { ...newPhotos[idx], caption };
    setPhotos(newPhotos);
  };

  // nextPhotos: setState 직후 저장 시 클로저의 stale photos 대신 갱신 배열을 전달 (토글 저장 누락 버그 수정)
  const savePhotoCaptions = async (nextPhotos?: EditablePhoto[]) => {
    const payloadPhotos = Array.isArray(nextPhotos) ? nextPhotos : photos;
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, photos: payloadPhotos, hidden_sections: Array.from(hiddenSections) }),
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData.targetHash) setCurrentApprovalHash(resData.targetHash);
      } else {
        toast.error('사진 정보 저장 실패');
      }
    } catch (err) { console.warn('[im-approval]', err); }
  };

  /** 사진 메타 패치 + 즉시 저장 */
  const patchPhoto = (idx: number, patch: Partial<EditablePhoto>) => {
    const updated = photos.map((p, j) => (j === idx ? { ...p, ...patch } : p));
    setPhotos(updated);
    void savePhotoCaptions(updated);
  };

  /** 사진 유형 변경 — category/type/label 동기화, 캡션이 비었거나 기존 유형 라벨이면 새 라벨로 교체 */
  const setPhotoCategory = (idx: number, category: string) => {
    const p = photos[idx];
    const newLabel = PHOTO_CATEGORY_LABELS[category as keyof typeof PHOTO_CATEGORY_LABELS] ?? category;
    const prevCat = p.category || p.type;
    const prevLabel = prevCat ? PHOTO_CATEGORY_LABELS[prevCat as keyof typeof PHOTO_CATEGORY_LABELS] : undefined;
    const keepCaption = p.caption && p.caption.trim() && p.caption !== prevLabel;
    patchPhoto(idx, { category, type: category, label: newLabel, caption: keepCaption ? p.caption : newLabel });
  };

  // 데이터 품질 계산
  const ssotSummary = content?.ssot_summary as Record<string, unknown> | undefined;
  const enriched = resolveEnrichment(content || {});
  const readinessScore = (content?.readiness_score as number) ?? 0;
  
  // 정확한 주소 또는 PNU 존재 여부 (단순 권역명 area_signal은 주소로 인정하지 않음)
  const hasRealAddress = !!(
    ssotSummary?.address ||
    ssotSummary?.pnu ||
    (ssotSummary?.raw_address as string)
  );

  const qualityBadge = computeDataQualityBadge({
    hasAddress: hasRealAddress,
    hasPublicData: !!(enriched.meta.hasPublicData || enriched.meta.enrichedAt),
    hasMonthlyRent: !!(ssotSummary?.monthly_rent_total_krw),
    hasVacancy: !!(ssotSummary?.vacancy_signal || ssotSummary?.vacancy_pct),
    hasPhotos: photos.length > 0,
    hasAskingPrice: !!(ssotSummary?.asking_price_manwon),
    hasLoanAmount: !!(ssotSummary?.loan_amount_manwon),
  }, (posture as any) || 'income');

  const handleApprove = async () => {
    setActionStatus('loading');
    try {
      // 제목, 투자 요약(isHeroDirty), OG 설정(isOgMetaDirty) 중 하나라도 변경되었거나 해시가 없으면 승인 전 일괄 자동 저장
      let approvalHash = currentApprovalHash;
      const effectiveTitle = isHeroDirty ? (heroTitle || editableTitle) : editableTitle;
      const needsPreSave = editableTitle !== title || isHeroDirty || isOgMetaDirty || !approvalHash || !approvalHash.startsWith('sha256:');
      if (needsPreSave) {
        const saveRes = await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections,
            title: effectiveTitle,
            hidden_sections: Array.from(hiddenSections),
            photos,
            heroTitle: heroTitle || effectiveTitle,
            heroSubtitle,
            keyInvestmentPoint: heroKeyPoint,
            keyPoints: heroKeyPoints.filter(Boolean),
            ogTitle,
            ogDescription,
          }),
        });
        if (saveRes.ok) {
          const saveData = await saveRes.json();
          if (saveData.targetHash) {
            approvalHash = saveData.targetHash;
            setCurrentApprovalHash(saveData.targetHash);
          }
          setEditableTitle(effectiveTitle);
          setIsHeroDirty(false);
          setIsOgMetaDirty(false);
        }
      }

      const res = await fetch(`/api/broker/im-lite/${docId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', expectedHash: approvalHash }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || data.message || 'Unknown error';
        const err = new Error(errorMsg) as any;
        err.data = data;
        err.status = res.status;
        throw err;
      }
      setDocStatus('published');
      setResultMsg('IM이 성공적으로 공개되었습니다.');
      setActionStatus('done');
      setShowPublishedModal(true);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      toast.success("🎉 모바일 투자설명서가 성공적으로 공개되었습니다!");
    } catch (err: any) {
      const errorMsg = err.message || 'Error';
      
      // 422 hash mismatch 시 서버의 최신 hash를 자동 채택
      if (err.status === 422 && err.data?.serverHash) {
        setCurrentApprovalHash(err.data.serverHash);
        toast.error('문서가 변경되었습니다. 다시 승인 버튼을 눌러주세요.');
      } else if (err.status === 422 && err.data?.blockers) {
        const blockerTexts = err.data.blockers
          .filter((b: any) => b.severity === 'block')
          .map((b: any) => b.description)
          .join('\n');
        toast.error(`승인 조건 미충족:\n${blockerTexts}`);
        setResultMsg(`승인 게이트 미통과: ${blockerTexts}`);
      } else {
        toast.error(errorMsg || '공개 승인 처리 중 오류가 발생했습니다.');
      }
      
      if (!err.data?.blockers) setResultMsg(errorMsg);
      setActionStatus('error');
    }
  };

  // 승인 시점 V12(렌트롤 면적 단위 혼동) 해제 — 서버가 사유 검증·by/at 기록·게이트 재평가 후 최신 gateReport/targetHash 를 돌려준다
  const handleV12Override = async () => {
    const reason = v12Reason.trim();
    if (!reason) return;
    setV12Applying(true);
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/approve-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'V12 해제 처리 중 오류가 발생했습니다.');
        return;
      }
      if (data.gateReport) setGateReport(data.gateReport as ApprovalGateReport);
      if (data.targetHash) setCurrentApprovalHash(data.targetHash);
      setV12Reason('');
      setActionStatus('idle');
      setResultMsg('');
      toast.success('V12 차단이 해제되었습니다. 이제 승인할 수 있습니다.');
    } catch (err) {
      console.error('V12 override failed', err);
      toast.error('V12 해제 처리 중 오류가 발생했습니다.');
    } finally {
      setV12Applying(false);
    }
  };

  const statusBadge = {
    pending_approval: { label: '검토 대기', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    published: { label: '공개됨', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    revision_needed: { label: '수정 요청', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    draft: { label: '초안', color: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30' },
  }[docStatus] ?? { label: docStatus, color: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30' };

  const allVerified = verifiedSet.size === sections.length;
  const [isPptxDownloading, setIsPptxDownloading] = useState(false);

  const handleDownloadPptx = async () => {
    if (isPptxDownloading) return;
    setIsPptxDownloading(true);
    const toastId = toast.loading('PPTX 투자설명서 파일을 준비하고 있습니다 (약 10~20초)...');
    try {
      const preset = (content as any)?.preset || 'credeal_basic';
      const url = `/api/public/im-lite/${buildingId}/pptx?doc_id=${encodeURIComponent(docId)}&tier=basic&preset=${encodeURIComponent(preset)}&watermark=false&direct=1`;
      const res = await fetch(url);
      if (!res.ok) {
        let payload: any = null;
        try { payload = await res.json(); } catch { payload = null; }
        const { humanizeImExportError } = await import('@/constants/ui-lexicon');
        const msg = humanizeImExportError(res.status, payload, 'pptx');
        toast.error(`${msg.title} ${msg.detail}`, { id: toastId, duration: 6000 });
        return;
      }
      const safeHeader = res.headers.get('X-Safe-Filename');
      const downloadName = safeHeader
        ? decodeURIComponent(safeHeader)
        : `${(editableTitle || '투자설명서').replace(/[^a-zA-Z0-9가-힣]/g, '_')}_Basic_IM.pptx`;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success('📊 PPTX 투자설명서 다운로드가 완료되었습니다!', { id: toastId });
    } catch {
      toast.error('PPTX 파일 다운로드 중 일시적인 오류가 발생했습니다. 잠시 후 다시 눌러주세요.', { id: toastId });
    } finally {
      setIsPptxDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-20">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <Link href={`/broker/deal-card/${buildingId}`} className="text-[16px] font-bold text-neutral-200 hover:text-white transition-colors">
            ← 딜카드 화면으로 돌아가기
          </Link>
          <div className="flex items-center gap-2.5">
            <span className={`px-3 py-1 text-[13px] font-bold rounded-full border ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
            <Link href={`/broker/basic-im-studio/${buildingId}`} className="text-[14px] font-semibold text-sky-300 hover:text-sky-200 bg-sky-500/10 border border-sky-500/30 px-3.5 py-2 min-h-[40px] flex items-center rounded-xl transition-colors whitespace-nowrap">
              📐 슬라이드 상세 편집
            </Link>
          </div>
        </div>
      </div>

      <StaggerContainer className="max-w-5xl mx-auto px-4 py-8">
        <StaggerItem className="mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 p-6 shadow-md">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">투자설명서(Basic IM) 완성 · 다운로드</h1>
            <p className="text-[16px] text-neutral-200 leading-relaxed">
              맞춤형 PPTX 제안서 파일을 지금 바로 PC로 내려받거나 카카오톡 링크로 고객에게 전달할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <motion.button
              type="button"
              whileHover={{ y: -1.5 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDownloadPptx}
              disabled={isPptxDownloading}
              id="approval-top-download-pptx"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[54px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-[17px] shadow-lg transition-all disabled:opacity-60"
            >
              <span>📊</span>
              <span>{isPptxDownloading ? 'PPTX 준비 중...' : 'PPTX 제안서 파일 받기'}</span>
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                navigator.clipboard.writeText(`https://credeal.net/im-lite/${buildingId}`);
                toast.success("🔗 투자설명서 링크가 복사되었습니다. 카카오톡에 붙여넣으세요.");
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 min-h-[54px] rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-bold text-[16px] transition-colors"
            >
              <span>🔗 카톡용 링크 복사</span>
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => window.open(`/im-lite/${buildingId}`, '_blank')}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-3.5 min-h-[54px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[16px] transition-colors shadow-md"
            >
              <span>🖥️ 웹 화면 열기</span>
              <span>↗</span>
            </motion.button>
          </div>
        </StaggerItem>

        {/* Empty State */}
        {sections.length === 0 && actionStatus !== 'done' && (
          <div className="text-center py-16 px-6">
            <div className="text-5xl mb-4">📄</div>
            <h2 className="text-lg font-bold text-white mb-2">섹션 데이터를 불러올 수 없습니다</h2>
            <p className="text-sm text-neutral-400 mb-6">
              AI 투자설명서가 아직 생성 중이거나, 데이터가 저장되지 않았을 수 있습니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`/broker/deal-card/${buildingId}`}
                className="inline-block px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                ← 딜카드로 돌아가기
              </a>
              <button
                onClick={() => window.location.reload()}
                className="inline-block px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-xl transition-colors"
              >
                🔄 다시 불러오기
              </button>
            </div>
          </div>
        )}

        {/* Result message */}
        {actionStatus === 'done' && (
          <div className="mb-6 p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center">
            <h3 className="text-lg font-bold mb-2">✅ {resultMsg}</h3>
            <p className="text-sm text-emerald-500/80 mb-4">투자설명서가 성공적으로 공개되었습니다.</p>
            <a
              href={`/im-lite/${buildingId}?doc=${docId}`}
              className="inline-block px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-colors"
            >
              퍼블릭 IM 확인하기
            </a>
          </div>
        )}
        {actionStatus === 'error' && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
            ❌ {resultMsg}
          </div>
        )}

        {/* 렌트롤 게이트(V01·V12) 차단 패널 — V12 만 승인 시점에 사유를 적어 해제할 수 있다 */}
        {docStatus !== 'published' && blockedGates.length > 0 && (
          <div data-testid="approve-blocked-gates" className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm">
            <h3 className="text-xs font-bold text-amber-400 mb-2">⛔ 승인 차단 — 렌트롤 검증 게이트</h3>
            <ul className="space-y-1 text-[11px] text-amber-200/90">
              {blockedGates.map((g) => (
                <li key={g.id} data-testid={`approve-blocked-gate-${g.id}`}>
                  <span className="font-bold">{g.id}</span> — {g.label}
                </li>
              ))}
            </ul>
            {hasV12Block && (
              <div className="mt-3 space-y-2">
                <label className="block text-[10px] font-semibold text-neutral-400" htmlFor="approve-v12-override-reason">
                  V12 해제 사유 (필수, {V12_REASON_MAX}자 이하 — 예: 일부 층만 매각)
                </label>
                <textarea
                  id="approve-v12-override-reason"
                  data-testid="approve-v12-override-reason"
                  value={v12Reason}
                  onChange={(e) => setV12Reason(e.target.value)}
                  maxLength={V12_REASON_MAX}
                  rows={2}
                  className="w-full text-xs bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-primary/60"
                  placeholder="면적 단위 혼동이 아닌 이유를 적어주세요"
                />
                <button
                  type="button"
                  data-testid="approve-v12-override-apply"
                  onClick={handleV12Override}
                  disabled={v12Applying || !v12Reason.trim()}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {v12Applying ? '적용 중…' : '사유 입력 후 해제'}
                </button>
                {hasOtherBlock && (
                  <p className="text-[10px] text-neutral-500">V01 등 다른 차단 게이트는 해제할 수 없습니다 — 렌트롤을 수정해 재업로드해주세요.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bug 2: 카카오 POI 지도 (PPTX 입지정보) 우선 렌더링 및 카카오맵 스위치 */}
        {(() => {
          const locMap = (content as any)?.enrichment?.locationMapImage;
          const validLocMap = locMap && typeof locMap === 'string' && locMap.length > 500;
          const initialMapSrc = validLocMap ? locMap : kakaoMapUrl;
          if (!initialMapSrc) return null;

          return (
            <ApprovalMapViewer 
              initialSrc={initialMapSrc} 
              fallbackSrc={kakaoMapUrl} 
              isPptxMap={validLocMap} 
            />
          );
        })()}

        {/* 📊 데이터 품질 모니터링 */}
        <div className="mb-6 p-5 rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <h3 className="text-[15px] font-bold text-neutral-300 mb-3">📊 제안서 필수 데이터 자동 점검</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400 font-medium">데이터 자동 연동 상태</span>
              <p className="text-lg font-extrabold text-emerald-400 mt-1">
                ✓ 정부 공적장부 · 입지 데이터 반영됨 ({readinessScore}점)
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400 font-medium">제안서 분석 유형</span>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-lg font-extrabold text-primary">
                  {qualityBadge.emoji} {qualityBadge.label.replace(/^[A-D]등급\s*[—-]\s*/, '')}
                </p>
              </div>
            </div>
          </div>
          {/* 포스처별 맞춤형 체크리스트 */}
          <div className="mt-4 space-y-2">
            <p className="text-[13px] font-semibold text-neutral-400 mb-1.5">필수 항목 확인 결과</p>
            {(() => {
              const hasPrice = !!(ssotSummary?.asking_price_manwon || (content as any)?.asking_price_manwon || (content as any)?.price_band);
              const baseItems = [
                {
                  ok: hasRealAddress,
                  label: '정확한 주소',
                  detail: (ssotSummary?.address as string) || (ssotSummary?.raw_address as string) || (ssotSummary?.pnu ? '정부 토지·건축물대장 연결됨' : '바텀시트에서 주소 검색 필요'),
                },
                {
                  ok: !!(enriched.meta.hasPublicData || enriched.meta.enrichedAt),
                  label: '정부 공적장부',
                  detail: (enriched.meta.hasPublicData || enriched.meta.enrichedAt) ? '건축물대장 · 토지이용계획 · 공시지가 연동됨' : '건축물대장 API 미연동',
                },
                {
                  ok: hasPrice,
                  label: '매각 희망가',
                  detail: ssotSummary?.asking_price_manwon
                    ? `${(Number(ssotSummary.asking_price_manwon) / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억 원 반영됨`
                    : hasPrice ? '매각 희망가 반영됨' : '매각가 미입력',
                },
              ];
              const p = (posture as string) || 'income';
              if (p === 'development') {
                baseItems.push({
                  ok: true,
                  label: '개발·토지 법정 한도',
                  detail: '용도지역 · 건폐율/용적률 · 개발 타당성 자동 반영됨',
                });
              } else if (p === 'owner_occupied') {
                baseItems.push({
                  ok: true,
                  label: '사옥 활용 · 절감 분석',
                  detail: '자가사용 면적 · 임차비 절감 효과 자동 반영됨',
                });
              } else if (p === 'trading' || p === 'short_term_flip') {
                baseItems.push({
                  ok: true,
                  label: '인근 시세 · 매매차익 분석',
                  detail: '인근 실거래 비교 · 목표 수익 분석 반영됨',
                });
              } else if (p === 'operating') {
                baseItems.push({
                  ok: true,
                  label: '운영 수지 분석',
                  detail: '객실 가동률(OCC) · 객단가(ADR) · GOP 수지 반영됨',
                });
              } else {
                baseItems.push({
                  ok: !!(ssotSummary?.monthly_rent_total_krw),
                  label: '월 임대료 · 수익률',
                  detail: ssotSummary?.monthly_rent_total_krw
                    ? `월 ${(Number(ssotSummary.monthly_rent_total_krw) / 10000).toLocaleString()}만원 반영됨`
                    : '추가 입력 시 정밀 수익률 표 자동 생성',
                });
              }
              return baseItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[14px]">
                  <span className={item.ok ? 'text-emerald-400' : 'text-amber-400'}>{item.ok ? '✅' : 'ℹ️'}</span>
                  <span className="font-bold text-neutral-200">{item.label}</span>
                  <span className="text-neutral-400 ml-auto truncate max-w-[320px]">{item.detail}</span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* 사진 프리뷰 + 캡션 편집 */}
        {photos.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[16px] font-bold text-neutral-200 mb-1">📷 매물 사진 관리 ({photos.filter(p => !p.excluded).length}/{photos.length}장 사용)</h3>
            <p className="text-[14px] text-neutral-400 mb-3 leading-relaxed">
              표지에 쓸 사진은 <b className="text-amber-400">📌 대표</b>, 건물 전체 모습은 <b className="text-blue-400">🏢 외관</b>을 눌러주세요. 도면·서류·명함 등은 <b className="text-rose-400">🚫 제외</b>를 누르면 IM에서 빠집니다.
            </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((photo, i) => {
                  const cat = photo.category || photo.type || '';
                  const isWebUrl = typeof photo.url === 'string' && (photo.url.startsWith('http') || photo.url.startsWith('/') || photo.url.startsWith('data:') || photo.url.startsWith('blob:'));
                  return (
                  <div key={i} className={`space-y-1.5 p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 ${photo.excluded ? 'opacity-40' : ''}`}>
                    <div 
                      className="w-full aspect-square rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all relative flex items-center justify-center"
                      onClick={() => setLightboxIdx(i)}
                    >
                      {isWebUrl ? (
                        <img
                          src={photo.url}
                          alt={photo.caption || `사진 ${i+1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                      <div className="flex flex-col items-center justify-center p-3 text-center select-none pointer-events-none">
                        <span className="text-2xl mb-1">🖼️</span>
                        <span className="text-[12px] font-bold text-neutral-300 line-clamp-2">{photo.caption || `매물 사진 #${i + 1}`}</span>
                        <span className="text-[11px] text-emerald-400 mt-0.5 font-medium">✓ PPTX 반영됨</span>
                      </div>
                      {photo.excluded ? (
                        <span className="absolute top-1.5 left-1.5 bg-rose-600 text-white text-[11px] px-2.5 py-0.5 rounded-full font-bold shadow">🚫 IM 제외</span>
                      ) : photo.role === 'cover' ? (
                        <span className="absolute top-1.5 left-1.5 bg-amber-500 text-slate-950 text-[11px] px-2.5 py-0.5 rounded-full font-extrabold shadow">📌 대표</span>
                      ) : photo.role === 'exterior' ? (
                        <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[11px] px-2.5 py-0.5 rounded-full font-bold shadow">🏢 외관</span>
                      ) : null}
                    </div>
                    <select
                      value={TAGGABLE_PHOTO_CATEGORIES.includes(cat as any) ? cat : ''}
                      onChange={(e) => { if (e.target.value) setPhotoCategory(i, e.target.value); }}
                      disabled={!!photo.excluded}
                      aria-label={`사진 ${i+1} 유형`}
                      className="w-full text-[13px] bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-200 focus:outline-none focus:border-primary/50 disabled:opacity-50"
                    >
                      <option value="">유형 선택</option>
                      {TAGGABLE_PHOTO_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{PHOTO_CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                    <input
                      value={photo.caption || ''}
                      onChange={(e) => updatePhotoCaption(i, e.target.value)}
                      onBlur={() => { void savePhotoCaptions(); }}
                      placeholder={`사진 ${i+1} 캡션`}
                      className="w-full text-[13px] bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-primary/50"
                    />
                    <div className="flex gap-1.5 flex-wrap pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); 
                          const updated = photos.map((p, j) => ({
                            ...p,
                            role: j === i ? 'cover' : (p.role === 'cover' ? 'general' : p.role),
                            isHero: j === i,
                            ...(j === i ? { excluded: false } : {}),
                          }));
                          setPhotos(updated);
                          void savePhotoCaptions(updated);
                        }}
                        className={`text-xs px-2.5 py-1.5 min-h-[34px] rounded-lg font-bold transition-colors ${
                          photo.role === 'cover' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >📌 대표</button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation();
                          const updated = photos.map((p, j) => ({
                            ...p,
                            role: j === i ? (p.role === 'exterior' ? 'general' : 'exterior') : (p.role === 'exterior' ? 'general' : p.role),
                            ...(j === i && p.role !== 'exterior' ? { excluded: false, category: 'exterior', type: 'exterior' } : {}),
                          }));
                          setPhotos(updated);
                          void savePhotoCaptions(updated);
                        }}
                        className={`text-xs px-2.5 py-1.5 min-h-[34px] rounded-lg font-bold transition-colors ${
                          photo.role === 'exterior' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >🏢 외관</button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation();
                          const willExclude = !photo.excluded;
                          // 제외 시 대표/외관 역할 해제 (제외 자산이 표지·개요 사진으로 쓰이지 않도록)
                          patchPhoto(i, willExclude
                            ? { excluded: true, role: 'general', isHero: false }
                            : { excluded: false });
                        }}
                        className={`text-xs px-2.5 py-1.5 min-h-[34px] rounded-lg font-bold transition-colors ${
                          photo.excluded ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >🚫 제외</button>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* 라이트박스 오버레이 */}
              {lightboxIdx !== null && (
                <div 
                  className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                  onClick={() => setLightboxIdx(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setLightboxIdx(null);
                    if (e.key === 'ArrowLeft') setLightboxIdx(prev => prev !== null && prev > 0 ? prev - 1 : prev);
                    if (e.key === 'ArrowRight') setLightboxIdx(prev => prev !== null && prev < photos.length - 1 ? prev + 1 : prev);
                  }}
                  tabIndex={0}
                  ref={(el) => el?.focus()}
                >
                  {/* 닫기 버튼 */}
                  <button 
                    className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl z-10"
                    onClick={() => setLightboxIdx(null)}
                  >✕</button>

                  {/* 좌측 화살표 */}
                  {lightboxIdx > 0 && (
                    <button 
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl font-light z-10 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
                      onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                    >‹</button>
                  )}

                  {/* 이미지 */}
                  <div className="max-w-[85vw] max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                    <img 
                      src={photos[lightboxIdx].url} 
                      alt={photos[lightboxIdx].caption || `사진 ${lightboxIdx + 1}`}
                      className="max-w-full max-h-[80vh] object-contain rounded-lg"
                    />
                    <p className="text-neutral-400 text-sm mt-2">
                      {photos[lightboxIdx].caption || `사진 ${lightboxIdx + 1}`} ({lightboxIdx + 1}/{photos.length})
                    </p>
                  </div>

                  {/* 우측 화살표 */}
                  {lightboxIdx < photos.length - 1 && (
                    <button 
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl font-light z-10 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
                      onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                    >›</button>
                  )}
                </div>
              )}
          </div>
        )}

        {/* 📋 투자 요약 편집 (Hero Content) */}
        <div className="mb-6 p-5 rounded-2xl border border-neutral-800 bg-neutral-900/30 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
            <h3 className="text-[16px] font-bold text-neutral-200">📋 상단 투자 요약 편집 (표지 · 핵심 요약)</h3>
            {isHeroDirty && (
              <span className="text-xs text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded font-bold">
                ⚠️ 미저장 (승인 시 자동 저장됨)
              </span>
            )}
          </div>

          {/* IM 뷰어 스타일 미리보기 + 편집 */}
          <div className="rounded-xl bg-neutral-950 border border-neutral-800 p-5 space-y-5">
            {/* 제목 */}
            <div className="space-y-1.5">
              <label className="text-[14px] text-neutral-300 font-bold block">
                IM 제목 (공유 화면 · 표지에 표시)
              </label>
              <input
                type="text"
                value={heroTitle}
                onChange={(e) => { setHeroTitle(e.target.value); setIsHeroDirty(true); }}
                placeholder="예: 강남역 초역세권 프라임 오피스 매각"
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-primary rounded-xl px-4 py-3 text-xl font-black text-white placeholder-neutral-500 outline-none transition-colors"
              />
            </div>

            {/* 서브제목 — 핵심 투자 하이라이트 헤드카피 */}
            <div className="space-y-1.5">
              <label className="text-[14px] text-neutral-300 font-bold block">
                서브제목 (핵심 투자 하이라이트 한 줄 문구)
              </label>
              <input
                type="text"
                value={heroSubtitle}
                onChange={(e) => { setHeroSubtitle(e.target.value); setIsHeroDirty(true); }}
                placeholder="예: 연 수익률 6.4% · 공실 Zero · 우량 임차 기반 안정 수익형"
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-lg font-bold text-primary placeholder-neutral-500 outline-none transition-colors"
              />
            </div>

            {/* 핵심 투자 포인트 */}
            <div className="space-y-1.5">
              <label className="text-[14px] text-neutral-300 font-bold block">
                💡 핵심 투자 포인트 요약문
              </label>
              <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3.5">
                <textarea
                  value={heroKeyPoint}
                  onChange={(e) => { setHeroKeyPoint(e.target.value); setIsHeroDirty(true); }}
                  placeholder="예: 강남 핵심 상권 내 대로변 코너 입지로, 안정적인 임대 수익과 향후 개발 잠재력을 동시에 갖춘 투자 적격 자산입니다."
                  rows={3}
                  className="w-full bg-transparent text-[16px] text-neutral-100 placeholder-neutral-500 outline-none resize-y leading-relaxed"
                />
              </div>
            </div>

            {/* 3대 핵심 투자 포인트 (개별 편집 — 긴 문장 잘림 방지를 위해 2줄 textarea 사용) */}
            <div className="space-y-2.5">
              <label className="text-[14px] text-neutral-300 font-bold block">
                ⭐ 3대 핵심 투자 포인트 (모바일 IM · PPTX에 동시 반영)
              </label>
              <div className="space-y-2.5">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-full bg-primary/20 text-primary text-sm font-extrabold flex items-center justify-center shrink-0 mt-2">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <textarea
                      rows={2}
                      value={heroKeyPoints[idx] || ''}
                      onChange={(e) => {
                        const updated = [...heroKeyPoints];
                        updated[idx] = e.target.value;
                        setHeroKeyPoints(updated);
                        setIsHeroDirty(true);
                      }}
                      placeholder={idx === 0 ? '예: 선유도역 도보 1분 초역세권, 유동인구 풍부' : idx === 1 ? '예: 임대수익률 5.2%, 만실 운영 3년 지속' : '예: 준공업지역, 용적률 400% 개발 여력'}
                      className="flex-1 bg-neutral-900 border border-neutral-700 focus:border-primary rounded-xl px-3.5 py-2.5 text-[15px] text-neutral-100 placeholder-neutral-500 leading-relaxed outline-none resize-y"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={saveHeroContent}
            disabled={isHeroSaving || !isHeroDirty}
            className="w-full py-2.5 bg-gradient-to-r from-violet-600/80 to-primary/80 hover:from-violet-600 hover:to-primary text-xs font-bold rounded-lg disabled:opacity-40 transition-all text-white"
          >
            {isHeroSaving ? '저장 중...' : '💾 투자 요약 저장'}
          </button>
        </div>

        {/* 🖼️ 공유 OG 메타 및 이미지 관리 */}
        <div className="mb-6 p-4 rounded-xl border border-neutral-800 bg-neutral-900/30 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <h3 className="text-xs font-bold text-neutral-300">🖼️ 카카오톡·문자 공유 카드 설정 (OG 메타)</h3>
            {isOgMetaDirty && (
              <span className="text-xs text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded font-bold">
                ⚠️ 미저장 (승인 시 자동 저장됨)
              </span>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Preview */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-400 font-semibold tracking-wider block">
                공유 썸네일 미리보기 (실시간)
              </label>
              <div className="relative rounded-lg overflow-hidden border border-neutral-800 aspect-[1.91/1] bg-neutral-950 flex items-center justify-center">
                <img
                  src={`/api/og/deal/${buildingId}?type=im&t=${ogTimestamp}`}
                  alt="OG Preview"
                  className="w-full h-full object-cover"
                  key={ogTimestamp}
                />
              </div>
            </div>
            {/* Inputs */}
            <div className="space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-400 font-semibold tracking-wider block">
                    카카오톡 공유 제목
                  </label>
                  <input
                    type="text"
                    value={ogTitle}
                    onChange={(e) => { setOgTitle(e.target.value); setIsOgMetaDirty(true); }}
                    placeholder={editableTitle || "투자설명서 제목"}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-neutral-200 placeholder-neutral-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-400 font-semibold tracking-wider block">
                    카카오톡 공유 요약 설명
                  </label>
                  <textarea
                    value={ogDescription}
                    onChange={(e) => { setOgDescription(e.target.value); setIsOgMetaDirty(true); }}
                    placeholder={title || "투자설명서 요약 설명"}
                    rows={3}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/50 text-neutral-200 placeholder-neutral-600 resize-none"
                  />
                </div>
              </div>
              <button
                onClick={saveOgMeta}
                disabled={isOgSaving || !isOgMetaDirty}
                className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold rounded-lg disabled:opacity-40 transition-all text-neutral-200 hover:text-white"
              >
                {isOgSaving ? "공유 정보 저장 중..." : "💾 공유 카드 정보 저장"}
              </button>
            </div>
          </div>
        </div>

        {/* Section verification quick toolbar + Section editor (Web IM 선택 검토용 아코디언) */}
        <details className="group mb-12 rounded-2xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
          <summary className="cursor-pointer list-none p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-900/60 transition-colors select-none">
            <div>
              <h3 className="text-[15px] font-bold text-white flex items-center gap-2">
                <span>📑 웹 화면용 상세 섹션 검토 (선택 사항)</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${allVerified ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-300'}`}>
                  {verifiedSet.size} / {sections.length} 확인됨
                </span>
              </h3>
              <p className="text-[13px] text-neutral-400 mt-1">
                PPTX 파일은 위 [📥 PPTX 파일 받기] 버튼으로 바로 내려받을 수 있습니다. 웹 주소로 공유할 때만 상세 섹션을 펼쳐 확인하세요.
              </p>
            </div>
            <span className="text-xs font-semibold text-neutral-300 bg-neutral-800 px-3 py-1.5 rounded-lg shrink-0 group-open:bg-neutral-700">
              상세 섹션 펼치기 ▾
            </span>
          </summary>

          <div className="p-4 pt-2 border-t border-neutral-800/70">
            <div className="mb-4 p-3.5 rounded-xl border border-neutral-800 bg-neutral-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-neutral-300">
                {allVerified
                  ? '모든 섹션 확인이 완료되었습니다. 하단의 [🚀 승인 및 공개] 버튼을 눌러주세요.'
                  : '내용을 검토한 뒤 우측의 [미확인] 버튼을 누르거나, [✓ 전체 섹션 일괄 확인]을 눌러 한 번에 완료할 수 있습니다.'}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {!allVerified && (
                  <button
                    type="button"
                    onClick={scrollToNextUnverified}
                    data-testid="jump-unverified-section-btn"
                    className="px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors"
                  >
                    🔍 미확인 섹션 찾기
                  </button>
                )}
                <button
                  type="button"
                  onClick={verifyAllSections}
                  disabled={allVerified}
                  data-testid="verify-all-sections-btn"
                  className="px-3.5 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-colors disabled:opacity-40"
                >
                  {allVerified ? '✓ 전체 확인 완료됨' : '✓ 전체 섹션 일괄 확인'}
                </button>
              </div>
            </div>

            {/* Section editor */}
            <div className="space-y-4">
          {sections.map((section, idx) => {
            const isVerified = verifiedSet.has(idx);
            const isEditing = editingIdx === idx;
            
            const isProcedural = section.section_type === 'next_steps' 
              || section.section_type === 'disclaimer'
              || section.title?.includes('다음 단계')
              || section.title?.includes('면책');

            let badgeUI = null;
            if (isProcedural) {
              badgeUI = isVerified
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🟢 검토 확인됨</span>
                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">⚪ 표준 안내</span>;
            } else if (section.confidence === 'confirmed') {
              badgeUI = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🟢 공공데이터 확인됨</span>;
            } else if (isVerified) {
              badgeUI = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🟢 브로커 검토완료</span>;
            } else if (section.confidence === 'needs_check') {
              badgeUI = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">🔴 보완 필요</span>;
            } else {
              badgeUI = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">🟡 AI 추론 — 검토 권장</span>;
            }

            const isHidden = hiddenSections.has(section.section_type);

            return (
              <div
                key={section.section_type ?? idx}
                data-approval-section-idx={idx}
                className={`rounded-2xl border transition-all ${isHidden ? 'border-red-900/30 bg-neutral-900/20 opacity-50' : isVerified ? 'border-neutral-800 bg-neutral-900/30' : 'border-amber-500/40 bg-neutral-900/80'} overflow-hidden`}
              >
                <div className="p-4 flex items-center justify-between border-b border-neutral-800/50 gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-white">{idx + 1}. {section.title}</span>
                    {badgeUI}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleHideSection(idx)}
                      className={`text-xs px-2.5 py-1.5 min-h-[34px] rounded-lg transition-colors ${
                        isHidden ? 'bg-red-500/20 text-red-400' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                      title={isHidden ? '섹션 숨김 해제' : '공개 IM에서 이 섹션 숨기기'}
                    >
                      {isHidden ? '👁‍🗨 숨김 해제' : '👁 숨기기'}
                    </button>
                    {!isEditing && (
                      <button
                        onClick={() => toggleVerify(idx)}
                        className={`text-xs px-3 py-1.5 min-h-[34px] rounded-lg font-bold transition-colors ${
                          isVerified 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {isVerified ? '✓ 확인완료' : '미확인 (클릭하여 확인)'}
                      </button>
                    )}
                    <button
                      onClick={() => isEditing ? saveEdit(idx) : startEdit(idx)}
                      className="text-xs px-3 py-1.5 min-h-[34px] rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                    >
                      {isEditing ? '💾 저장' : '✏ 수정'}
                    </button>
                  </div>
                </div>
                
                {isEditing ? (
                  <div className="border-t border-neutral-800">
                    {/* 모바일: 탭 전환 */}
                    <div className="flex md:hidden border-b border-neutral-800">
                      <button onClick={() => setEditorTab('edit')}
                        className={`flex-1 px-4 py-2 text-xs font-bold transition-colors ${editorTab === 'edit' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}>
                        ✏️ 편집
                      </button>
                      <button onClick={() => setEditorTab('preview')}
                        className={`flex-1 px-4 py-2 text-xs font-bold transition-colors ${editorTab === 'preview' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}>
                        👁 미리보기
                      </button>
                    </div>
                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-neutral-800">
                      <div className={`w-full md:w-1/2 flex flex-col ${editorTab === 'preview' ? 'hidden md:flex' : ''}`}>
                        <div className="px-4 py-2 bg-neutral-950 text-xs text-neutral-500 font-medium hidden md:block">마크다운 편집기</div>
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className="w-full bg-neutral-950 p-4 text-sm text-neutral-300 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[300px] md:min-h-0 md:h-[400px]"
                          rows={15}
                        />
                      </div>
                      <div className={`w-full md:w-1/2 flex flex-col bg-neutral-900/50 ${editorTab === 'edit' ? 'hidden md:flex' : ''}`}>
                        <div className="px-4 py-2 bg-neutral-950 text-xs text-neutral-500 font-medium hidden md:block">실시간 미리보기</div>
                        <div className="p-4 overflow-y-auto min-h-[300px] md:h-[400px]">
                          <MarkdownRenderer content={editDraft} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-6 bg-neutral-950/30">
                    <MarkdownRenderer content={section.markdown} />
                  </div>
                )}
                {isEditing && (
                  <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex justify-end gap-2">
                    <button onClick={cancelEdit} className="text-xs px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg">취소</button>
                    <button onClick={() => saveEdit(idx)} className="text-xs px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg">저장 및 확인</button>
                  </div>
                )}
              </div>
            );
          })}
            </div>
          </div>
        </details>

        {/* Bottom Action Card (본문 겹침 방지를 위해 인라인 하단 카드로 배치) */}
        <div className="mt-8 rounded-2xl bg-neutral-900 border border-neutral-800 p-5 shadow-lg">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {docStatus !== 'published' ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <button 
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-sm text-red-500/80 hover:text-red-500 underline underline-offset-4 transition-colors font-medium"
                  >
                    🗑 작성 취소
                  </button>
                  <div className="text-[15px] font-medium flex items-center gap-2">
                    <span className={allVerified ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {verifiedSet.size} / {sections.length} 섹션 확인 완료
                    </span>
                    {!allVerified && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={scrollToNextUnverified}
                          className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold transition-colors"
                        >
                          미확인 이동 ↑
                        </button>
                        <button
                          type="button"
                          onClick={verifyAllSections}
                          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-semibold transition-colors"
                        >
                          ✓ 전체 일괄 확인
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleDownloadPptx}
                    disabled={isPptxDownloading}
                    className="px-5 py-3 min-h-[48px] bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl transition-colors text-[15px] shadow-md disabled:opacity-60"
                  >
                    {isPptxDownloading ? '⏳ PPTX 준비 중...' : '📊 PPTX 제안서 파일 받기'}
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={actionStatus === 'loading' || !allVerified}
                    className="px-6 py-3 min-h-[48px] bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50 disabled:bg-neutral-800 disabled:text-neutral-500 text-[15px] shadow-lg shadow-emerald-500/20"
                  >
                    {actionStatus === 'loading' ? '처리 중...' : '🚀 승인 및 공개'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-[15px] text-emerald-400 font-bold flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    공개 완료 상태
                  </span>
                  <Link
                    href={`/broker/deal-card/${buildingId}`}
                    className="text-[15px] font-semibold text-neutral-300 hover:text-white transition-colors"
                  >
                    ← 딜카드 관리로 이동
                  </Link>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleDownloadPptx}
                    disabled={isPptxDownloading}
                    className="px-5 py-3 min-h-[48px] bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[15px] rounded-xl transition-colors shadow-md disabled:opacity-60"
                  >
                    {isPptxDownloading ? '⏳ PPTX 준비 중...' : '📊 PPTX 제안서 다운로드'}
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://credeal.net/im-lite/${buildingId}`);
                      toast.success("🔗 투자설명서 링크가 복사되었습니다. 카카오톡에 붙여넣으세요.");
                    }}
                    className="px-4 py-3 min-h-[48px] bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[15px] rounded-xl transition-colors"
                  >
                    🔗 카톡용 링크 복사
                  </button>
                  <button
                    onClick={() => window.open(`/im-lite/${buildingId}`, '_blank')}
                    className="px-5 py-3 min-h-[48px] bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[15px] rounded-xl transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
                  >
                    <span>🖥️ 웹 화면 열기</span>
                    <span>↗</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

      </StaggerContainer>

      {/* Published Success Celebration Modal */}
      {showPublishedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative bg-neutral-900 border border-emerald-500/40 rounded-3xl p-6 md:p-8 max-w-md w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-300 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto text-3xl">
              🎉
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-white">
                투자설명서 준비가 완료되었습니다!
              </h2>
              <p className="text-[15px] text-neutral-300 leading-relaxed">
                PC에서 인쇄·편집할 수 있는 맞춤형 PPTX 제안서 파일을 내려받거나, 고객에게 카카오톡으로 웹 주소를 복사해 전달하세요.
              </p>
            </div>

            <div className="p-3.5 bg-neutral-950/80 rounded-xl border border-neutral-800 text-left space-y-1">
              <p className="text-[12px] text-neutral-400 font-bold">고객 공유용 웹 주소</p>
              <p className="text-[13px] text-emerald-400 font-mono truncate">
                https://credeal.net/im-lite/{buildingId}
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleDownloadPptx}
                disabled={isPptxDownloading}
                className="w-full min-h-[50px] bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-[16px] rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>📊</span>
                <span>{isPptxDownloading ? 'PPTX 파일 준비 중...' : 'PPTX 제안서 파일 다운로드 (PC용)'}</span>
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(`https://credeal.net/im-lite/${buildingId}`);
                  toast.success("🔗 투자설명서 주소가 복사되었습니다. 카카오톡 대화창에 붙여넣으세요.");
                }}
                className="w-full min-h-[48px] bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-[15px] rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                <span>📋 카카오톡 공유용 주소 복사</span>
              </button>

              <button
                onClick={() => {
                  window.open(`/im-lite/${buildingId}`, '_blank');
                }}
                className="w-full min-h-[46px] bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[14px] rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <span>🖥️ 완성된 웹 투자설명서 열어보기</span>
                <span>↗</span>
              </button>

              <div className="flex justify-center pt-1">
                <Link
                  href={`/broker/deal-card/${buildingId}`}
                  className="py-2.5 px-4 text-[14px] font-semibold text-neutral-300 hover:text-white transition-colors text-center"
                >
                  ← 딜카드 화면으로 돌아가기
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">모바일 IM 초안을 삭제하시겠습니까?</h3>
            <p className="text-sm text-muted-foreground">삭제된 초안은 복구할 수 없습니다. 딜카드는 유지됩니다.</p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium">취소</button>
              <button onClick={handleDeleteDraft} className="flex-1 h-10 rounded-lg bg-red-500 text-white text-sm font-bold">삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Approval Map Viewer ─────────────────────────────────────────────────────────────

function ApprovalMapViewer({ 
  initialSrc, 
  fallbackSrc, 
  isPptxMap 
}: { 
  initialSrc: string; 
  fallbackSrc?: string | null; 
  isPptxMap?: boolean; 
}) {
  const [src, setSrc] = useState(initialSrc);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="mb-8 rounded-xl overflow-hidden border border-neutral-800 relative group h-48 sm:h-64 bg-neutral-900 flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img 
        src={src} 
        alt="위치 지도" 
        className="w-full h-full object-cover"
        onError={() => {
          if (!hasError && fallbackSrc && src !== fallbackSrc) {
            setSrc(fallbackSrc);
            setHasError(true);
          }
        }}
      />
      
      <div className="absolute inset-0 border border-black/10 rounded-xl pointer-events-none" />
      
      {/* 안내 배지 */}
      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 pointer-events-none">
        <span className="text-[10px] text-white/90 font-medium">
          {isPptxMap && !hasError ? '🗺️ 입지 지도 (PPTX 동기화)' : '🗺️ 카카오 지도'}
        </span>
      </div>
    </div>
  );
}

// ─── Local Markdown Renderer ─────────────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;

  // ── Pre-process: 인라인 뷸렛/헤더/테이블 줄바꿈 보정 ──
  let md = normalizeSectionMarkdown(content);

  // LLM이 인라인 강조용으로 사용하는 파이프 제거: "| 항목 |" → "항목"
  // (실제 마크다운 테이블은 3+ 파이프가 있으므로 2파이프 이하만 제거)
  md = md.replace(/^\|\s*([^|]+?)\s*\|$/gm, '$1');

  // 단일 줄바꿈 → 이중 줄바꿈 (줄의 시작이 불릿/번호/볼드/이모지인 경우만)
  md = md.replace(/([^\n])\n(?=[-*•·] |\d+[.)]\s|\*\*[^*]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gmu, '$1\n\n');

  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;
  let key = 0;

  const flush = () => {
    if (tableBuffer.length > 0) {
      elements.push(<TableFromLines key={key++} lines={tableBuffer} />);
      tableBuffer = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 마크다운 테이블: | col1 | col2 | 형식 (최소 3개 파이프 = 2열 이상)
    // 단순 인라인 파이프 (| 항목 |) 는 테이블이 아님
    const isTableRow = trimmed.startsWith("|") && (trimmed.match(/\|/g) || []).length >= 3;
    if (isTableRow) {
      inTable = true;
      tableBuffer.push(trimmed);
      continue;
    }

    if (inTable && !trimmed.startsWith("|")) {
      flush();
    }

    if (trimmed.startsWith("#### ")) {
      flush();
      elements.push(
        <h4 key={key++} className="text-xs font-bold text-primary/90 mt-3 mb-1.5">
          <InlineMarkdown text={trimmed.slice(5)} />
        </h4>,
      );
    } else if (trimmed.startsWith("### ")) {
      flush();
      elements.push(
        <h3 key={key++} className="text-xs font-bold uppercase tracking-wider text-primary mt-4 mb-2">
          <InlineMarkdown text={trimmed.slice(4)} />
        </h3>,
      );
    } else if (trimmed.startsWith("## ")) {
      flush();
      elements.push(
        <h2 key={key++} className="text-sm font-bold text-white mt-4 mb-2">
          <InlineMarkdown text={trimmed.slice(3)} />
        </h2>,
      );
    } else if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
      // 볼드 전용 줄 — 공백 포함도 허용 (이전: !line.includes(" ")로 대부분 누락)
      flush();
      elements.push(
        <p key={key++} className="font-bold text-white text-sm mt-2">
          {trimmed.slice(2, -2)}
        </p>,
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ") || trimmed.startsWith("· ")) {
      // 불릿 리스트 — •, · 문자도 지원
      flush();
      const text = trimmed.replace(/^[-*•·]\s+/, '');
      elements.push(
        <li key={key++} className="text-neutral-300 text-sm leading-relaxed ml-4 list-disc">
          <InlineMarkdown text={text} />
        </li>,
      );
    } else if (/^\d+[.)]\s/.test(trimmed)) {
      // 번호 목록 — "1. " 또는 "1) " 형식
      flush();
      const text = trimmed.replace(/^\d+[.)]\s+/, '');
      elements.push(
        <li key={key++} className="text-neutral-300 text-sm leading-relaxed ml-4 list-decimal">
          <InlineMarkdown text={text} />
        </li>,
      );
    } else if (trimmed.startsWith("> ")) {
      flush();
      elements.push(
        <blockquote
          key={key++}
          className="border-l-2 border-primary/50 bg-primary/5 rounded-r-lg py-1 px-3 my-2"
        >
          <p className="text-neutral-400 text-xs leading-relaxed">
            <InlineMarkdown text={trimmed.slice(2)} />
          </p>
        </blockquote>,
      );
    } else if (trimmed === "") {
      flush();
      elements.push(<div key={key++} className="h-2" />);
    } else {
      flush();
      // LLM이 ### 를 인라인 구분자로 사용하는 경우 제거
      const cleanedLine = trimmed.replace(/\s*#{2,4}\s*/g, ' ').trim();
      if (cleanedLine) {
        elements.push(
          <p key={key++} className="text-neutral-300 text-sm leading-relaxed">
            <InlineMarkdown text={cleanedLine} />
          </p>,
        );
      }
    }
  }

  flush();
  return <div className="space-y-1">{elements}</div>;
}

function formatReadableKoreanUnits(raw: string): string {
  // 7자리 이상 원/평 (예: 76,304,545원/평 -> 약 7,630만 원/평)
  return raw.replace(/(\d{1,3}(?:,\d{3}){2,})\s*원\/평/g, (match, numStr) => {
    const n = Number(String(numStr).replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 1_000_000) return match;
    const man = Math.round(n / 10_000);
    if (man >= 10_000) {
      const eok = Math.floor(man / 10_000);
      const remMan = man % 10_000;
      return remMan > 0 ? `약 ${eok}억 ${remMan.toLocaleString()}만 원/평` : `약 ${eok}억 원/평`;
    }
    return `약 ${man.toLocaleString()}만 원/평`;
  });
}

function InlineMarkdown({ text }: { text: string }) {
  const normalized = formatReadableKoreanUnits(text);
  const parts = normalized.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i} className="italic text-neutral-200">{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function TableFromLines({ lines }: { lines: string[] }) {
  const rows = lines.filter((l) => !/^\s*\|[\s-:|]+\|\s*$/.test(l));
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  const parseRow = (row: string) =>
    row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

  const headers = parseRow(header);

  return (
    <div className="overflow-x-auto my-3 rounded-xl border border-neutral-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-950/50">
            {headers.map((h, i) => (
              <th key={i} className="text-left text-neutral-400 font-medium px-3 py-2">
                <InlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20">
              {parseRow(row).map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-neutral-300">
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
