"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GoldenSet {
  id: string;
  document_id: string;
  section_type: string;
  section_alias: string;
  asset_type: string;
  price_band: string;
  markdown: string;
  judge_score: number;
  was_edited: boolean;
  source_type: string;
  tags: string[];
  version: number;
  usage_count: number;
  is_active: boolean;
  source_file_name: string | null;
  created_at: string;
}

interface TerminologyRule {
  id: string;
  pattern: string;
  is_regex: boolean;
  replacement: string;
  category: string;
  priority: number;
  is_active: boolean;
  hit_count: number;
  last_hit_at: string | null;
  note: string;
}

interface Stats {
  goldenStats: {
    totalCount: number;
    activeCount: number;
    avgJudgeScore: number;
    bySectionType: Record<string, number>;
    bySourceType: Record<string, number>;
    totalUsageCount: number;
  };
  terminologyStats: {
    totalRules: number;
    activeRules: number;
    totalHits: number;
    topRules: Array<{
      id: string;
      pattern: string;
      replacement: string;
      hit_count: number;
      category: string;
    }>;
  };
  fewShotStats: {
    totalLogs: number;
    avgFewShotResultScore: number;
    effectiveness: Array<{
      goldenId: string;
      sectionType: string;
      assetType: string;
      priceBand: string;
      avgResultScore: number;
      timesUsed: number;
      effectiveness: 'high' | 'medium' | 'low';
    }>;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  property_overview: '자산 개요',
  location_access: '입지 분석',
  lease_status: '임대차 현황',
  income_analysis: '수익 분석',
  risk_check: '리스크',
  investment_thesis: '투자 포인트',
  next_steps: '거래 일정',
};

const SOURCE_LABELS: Record<string, string> = {
  auto_approve: '자동 승인',
  manual_input: '수동 입력',
  pptx_upload: 'PPTX 업로드',
  pdf_upload: 'PDF 업로드',
};

const TERM_CATEGORIES = [
  { value: '면적', label: '면적/규모' },
  { value: '비용', label: '비용' },
  { value: '임대', label: '임대 구조' },
  { value: '신용', label: '신용/등급' },
  { value: '거래', label: '거래/계약' },
  { value: '건물상태', label: '건물 상태' },
  { value: '법률', label: '법률/등기' },
  { value: '홍보', label: '홍보/수식어' },
  { value: '투자', label: '투자 판단' },
  { value: '법적위험', label: '법적 위험 예방' },
];

function scoreBadgeColor(score: number): string {
  if (score >= 4.5) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (score >= 4.0) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (score >= 3.5) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
}

function sourceBadgeColor(source: string): string {
  switch (source) {
    case 'manual_input': return 'bg-blue-500/20 text-blue-400';
    case 'pptx_upload': return 'bg-emerald-500/20 text-emerald-400';
    case 'pdf_upload': return 'bg-purple-500/20 text-purple-400';
    default: return 'bg-neutral-500/20 text-neutral-400';
  }
}

// ─── Main Admin Component ────────────────────────────────────────────────────

export default function GoldenAdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'golden' | 'terminology' | 'analytics'>('golden');

  // Stats Data
  const [stats, setStats] = useState<Stats | null>(null);

  // ── Tab 1: Golden Set States ──
  const [goldenSets, setGoldenSets] = useState<GoldenSet[]>([]);
  const [goldenLoading, setGoldenLoading] = useState(true);
  const [goldenTotal, setGoldenTotal] = useState(0);
  const [goldenPage, setGoldenPage] = useState(1);
  const limit = 20;

  const [filterSection, setFilterSection] = useState('');
  const [filterAssetType, setFilterAssetType] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterActive, setFilterActive] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    section_type: 'property_overview',
    asset_type: '',
    price_band: '',
    markdown: '',
    judge_score: 4.0,
    tags: '',
  });
  const [creating, setCreating] = useState(false);

  // ── Tab 2: Terminology States ──
  const [terminologyRules, setTerminologyRules] = useState<TerminologyRule[]>([]);
  const [termLoading, setTermLoading] = useState(true);
  const [termTotal, setTermTotal] = useState(0);
  const [termPage, setTermPage] = useState(1);

  const [filterCategory, setFilterCategory] = useState('');
  const [termSearch, setTermSearch] = useState('');
  const [termActiveFilter, setTermActiveFilter] = useState('');

  const [showTermModal, setShowTermModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<TerminologyRule | null>(null);
  const [termForm, setTermForm] = useState({
    pattern: '',
    replacement: '',
    category: 'general',
    priority: 100,
    is_regex: true,
    is_active: true,
    note: '',
  });
  const [termSaving, setTermSaving] = useState(false);

  // ── API Fetch Callbacks ──

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/golden-sets/stats');
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchGoldenRows = useCallback(async () => {
    setGoldenLoading(true);
    try {
      const params = new URLSearchParams({ page: String(goldenPage), limit: String(limit) });
      if (filterSection) params.set('section_type', filterSection);
      if (filterAssetType) params.set('asset_type', filterAssetType);
      if (filterSource) params.set('source_type', filterSource);
      params.set('is_active', String(filterActive));

      const res = await fetch(`/api/admin/golden-sets?${params}`);
      if (res.ok) {
        const json = await res.json();
        setGoldenSets(json.data || []);
        setGoldenTotal(json.total || 0);
      }
    } catch { /* ignore */ }
    setGoldenLoading(false);
  }, [goldenPage, filterSection, filterAssetType, filterSource, filterActive]);

  const fetchTerminologyRows = useCallback(async () => {
    setTermLoading(true);
    try {
      const params = new URLSearchParams({ page: String(termPage), limit: String(limit) });
      if (filterCategory) params.set('category', filterCategory);
      if (termSearch) params.set('search', termSearch);
      if (termActiveFilter) params.set('is_active', termActiveFilter);

      const res = await fetch(`/api/admin/terminology?${params}`);
      if (res.ok) {
        const json = await res.json();
        setTerminologyRules(json.data || []);
        setTermTotal(json.total || 0);
      }
    } catch { /* ignore */ }
    setTermLoading(false);
  }, [termPage, filterCategory, termSearch, termActiveFilter]);

  // Initial Loaders
  useEffect(() => { fetchStats(); }, [fetchStats, activeTab]);
  useEffect(() => {
    if (activeTab === 'golden') fetchGoldenRows();
    else if (activeTab === 'terminology') fetchTerminologyRows();
  }, [activeTab, fetchGoldenRows, fetchTerminologyRows]);

  // ── Tab 1 Actions ──

  const handleToggleGoldenActive = async (gs: GoldenSet) => {
    await fetch(`/api/admin/golden-sets/${gs.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !gs.is_active }),
    });
    fetchGoldenRows();
    fetchStats();
  };

  const handleDeleteGolden = async (id: string) => {
    if (!confirm('이 골든셋을 비활성화하시겠습니까?')) return;
    await fetch(`/api/admin/golden-sets/${id}`, { method: 'DELETE' });
    fetchGoldenRows();
    fetchStats();
  };

  const handleExportFewShot = async () => {
    const res = await fetch('/api/admin/golden-sets/export?format=jsonl');
    if (!res.ok) return alert('내보내기 실패');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `golden_sets_${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateGolden = async () => {
    if (!createForm.markdown || createForm.markdown.length < 50) {
      return alert('마크다운은 최소 50자 이상이어야 합니다.');
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/golden-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          tags: createForm.tags ? createForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          source_type: 'manual_input',
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setCreateForm({ section_type: 'property_overview', asset_type: '', price_band: '', markdown: '', judge_score: 4.0, tags: '' });
        fetchGoldenRows();
        fetchStats();
      }
    } catch { /* ignore */ }
    setCreating(false);
  };

  // ── Tab 2 Actions ──

  const handleToggleTermActive = async (rule: TerminologyRule) => {
    await fetch(`/api/admin/terminology/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    fetchTerminologyRows();
    fetchStats();
  };

  const handleDeleteTerm = async (id: string) => {
    if (!confirm('이 규칙을 비활성화하시겠습니까?')) return;
    await fetch(`/api/admin/terminology/${id}`, { method: 'DELETE' });
    fetchTerminologyRows();
    fetchStats();
  };

  const handleOpenTermModal = (rule: TerminologyRule | null) => {
    if (rule) {
      setEditingTerm(rule);
      setTermForm({
        pattern: rule.pattern,
        replacement: rule.replacement,
        category: rule.category,
        priority: rule.priority,
        is_regex: rule.is_regex,
        is_active: rule.is_active,
        note: rule.note || '',
      });
    } else {
      setEditingTerm(null);
      setTermForm({
        pattern: '',
        replacement: '',
        category: '거래',
        priority: 100,
        is_regex: true,
        is_active: true,
        note: '',
      });
    }
    setShowTermModal(true);
  };

  const handleSaveTerm = async () => {
    if (!termForm.pattern || !termForm.replacement) {
      return alert('패턴과 치환값을 입력해 주세요.');
    }
    setTermSaving(true);
    try {
      const url = editingTerm ? `/api/admin/terminology/${editingTerm.id}` : '/api/admin/terminology';
      const method = editingTerm ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(termForm),
      });

      if (res.ok) {
        setShowTermModal(false);
        fetchTerminologyRows();
        fetchStats();
      }
    } catch { /* ignore */ }
    setTermSaving(false);
  };

  const handleSeedTerminology = async () => {
    if (!confirm('시스템 기본 용어 규칙 46개를 DB에 시딩하시겠습니까? (이미 있으면 중단됨)')) return;
    try {
      const res = await fetch('/api/admin/terminology/seed', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        alert(`시딩 성공! ${json.inserted_count}개 규칙이 등록되었습니다.`);
        fetchTerminologyRows();
        fetchStats();
      } else {
        alert(`시딩 실패: ${json.error}`);
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">🏆 IM 고도화 지식 엔진 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">Few-shot 퓨샷 자산 데이터 및 CRE 표준 용어 사전을 통합 제어합니다.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeTab === 'golden' && (
            <>
              <Button onClick={() => setShowCreate(true)} className="bg-primary text-primary-foreground text-sm">
                + 퓨샷 수동 추가
              </Button>
              <Button onClick={() => router.push('/broker/golden-admin/upload')} variant="outline" className="text-sm">
                📄 PPTX/PDF 업로드
              </Button>
              <Button onClick={handleExportFewShot} variant="outline" className="text-sm">
                📦 JSONL 내보내기
              </Button>
            </>
          )}
          {activeTab === 'terminology' && (
            <>
              <Button onClick={() => handleOpenTermModal(null)} className="bg-primary text-primary-foreground text-sm">
                + 용어 규칙 추가
              </Button>
              <Button onClick={handleSeedTerminology} variant="outline" className="text-sm text-yellow-500 border-yellow-500/30">
                🌱 기본 규칙 시드 로드
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 gap-1 mb-6">
        <button
          onClick={() => setActiveTab('golden')}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'golden' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🏆 Few-shot 퓨샷 관리
        </button>
        <button
          onClick={() => setActiveTab('terminology')}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'terminology' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          📖 용어 사전 관리
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'analytics' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          📊 효과 & 품질 Analytics
        </button>
      </div>

      {/* ─── TAB 1: GOLDEN SETS ─── */}
      {activeTab === 'golden' && (
        <>
          {stats?.goldenStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <Card className="p-4 bg-neutral-900 border-neutral-800">
                <p className="text-xs text-muted-foreground">전체 퓨샷</p>
                <p className="text-2xl font-bold mt-1">{stats.goldenStats.totalCount}</p>
              </Card>
              <Card className="p-4 bg-neutral-900 border-neutral-800">
                <p className="text-xs text-muted-foreground">활성 비율</p>
                <p className="text-2xl font-bold mt-1 text-emerald-400">
                  {stats.goldenStats.totalCount > 0 ? Math.round((stats.goldenStats.activeCount / stats.goldenStats.totalCount) * 100) : 0}%
                </p>
              </Card>
              <Card className="p-4 bg-neutral-900 border-neutral-800">
                <p className="text-xs text-muted-foreground">평균 Judge 점수</p>
                <p className="text-2xl font-bold mt-1 text-blue-400">{stats.goldenStats.avgJudgeScore.toFixed(1)}</p>
              </Card>
              <Card className="p-4 bg-neutral-900 border-neutral-800">
                <p className="text-xs text-muted-foreground">총 활용 횟수</p>
                <p className="text-2xl font-bold mt-1 text-amber-400">{stats.goldenStats.totalUsageCount}</p>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={filterSection}
              onChange={e => { setFilterSection(e.target.value); setGoldenPage(1); }}
              className="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 border border-neutral-700 text-foreground"
            >
              <option value="">전체 섹션</option>
              {Object.entries(SECTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <Input
              placeholder="자산 유형"
              value={filterAssetType}
              onChange={e => { setFilterAssetType(e.target.value); setGoldenPage(1); }}
              className="w-32 text-sm bg-neutral-800 border-neutral-700"
            />
            <select
              value={filterSource}
              onChange={e => { setFilterSource(e.target.value); setGoldenPage(1); }}
              className="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 border border-neutral-700 text-foreground"
            >
              <option value="">전체 소스</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              onClick={() => { setFilterActive(!filterActive); setGoldenPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filterActive
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
              }`}
            >
              {filterActive ? '✅ 활성만' : '전체 (비활성 포함)'}
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-900 border-b border-neutral-800">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">섹션</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">자산유형</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">가격대</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">품질</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">소스</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">활용</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">상태</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">생성일</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">액션</th>
                </tr>
              </thead>
              <tbody>
                {goldenLoading ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">로딩 중...</td></tr>
                ) : goldenSets.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">골든셋이 없습니다</td></tr>
                ) : goldenSets.map(gs => (
                  <tr key={gs.id} className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium">{SECTION_LABELS[gs.section_type] || gs.section_type}</span>
                      {gs.section_alias && (
                        <span className="block text-[10px] text-muted-foreground mt-0.5">{gs.section_alias}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{gs.asset_type || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{gs.price_band || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${scoreBadgeColor(gs.judge_score)}`}>
                        {gs.judge_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] ${sourceBadgeColor(gs.source_type)}`}>
                        {SOURCE_LABELS[gs.source_type] || gs.source_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{gs.usage_count || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleGoldenActive(gs)}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                          gs.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-400'
                        }`}
                      >
                        {gs.is_active ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                      {new Date(gs.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => router.push(`/broker/golden-admin/${gs.id}`)}
                          className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                        >
                          편집
                        </button>
                        <button
                          onClick={() => handleDeleteGolden(gs.id)}
                          className="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded hover:bg-rose-500/30 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {Math.ceil(goldenTotal / limit) > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={goldenPage <= 1}
                onClick={() => setGoldenPage(p => p - 1)}
              >
                이전
              </Button>
              <span className="flex items-center text-sm text-muted-foreground px-3">
                {goldenPage} / {Math.ceil(goldenTotal / limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={goldenPage >= Math.ceil(goldenTotal / limit)}
                onClick={() => setGoldenPage(p => p + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}

      {/* ─── TAB 2: TERMINOLOGY DICTIONARY ─── */}
      {activeTab === 'terminology' && (
        <>
          {stats?.terminologyStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <Card className="p-4 bg-neutral-900 border-neutral-800">
                <p className="text-xs text-muted-foreground">전체 규칙 수</p>
                <p className="text-2xl font-bold mt-1">{stats.terminologyStats.totalRules}</p>
              </Card>
              <Card className="p-4 bg-neutral-900 border-neutral-800">
                <p className="text-xs text-muted-foreground">활성 규칙 수</p>
                <p className="text-2xl font-bold mt-1 text-emerald-400">{stats.terminologyStats.activeRules}</p>
              </Card>
              <Card className="p-4 bg-neutral-900 border-neutral-800">
                <p className="text-xs text-muted-foreground">총 규칙 치환 횟수</p>
                <p className="text-2xl font-bold mt-1 text-blue-400">{stats.terminologyStats.totalHits}</p>
              </Card>
              <Card className="p-4 bg-neutral-900 border-neutral-800">
                <p className="text-xs text-muted-foreground">평균 우선순위</p>
                <p className="text-2xl font-bold mt-1 text-amber-400">100</p>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={filterCategory}
              onChange={e => { setFilterCategory(e.target.value); setTermPage(1); }}
              className="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 border border-neutral-700 text-foreground"
            >
              <option value="">전체 카테고리</option>
              {TERM_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select
              value={termActiveFilter}
              onChange={e => { setTermActiveFilter(e.target.value); setTermPage(1); }}
              className="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 border border-neutral-700 text-foreground"
            >
              <option value="">전체 상태</option>
              <option value="true">활성</option>
              <option value="false">비활성</option>
            </select>
            <Input
              placeholder="검색 (패턴, 치환어, 메모)"
              value={termSearch}
              onChange={e => { setTermSearch(e.target.value); setTermPage(1); }}
              className="w-64 text-sm bg-neutral-800 border-neutral-700"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-900 border-b border-neutral-800">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">카테고리</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">매칭 패턴</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">치환 단어 / 함수</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">우선순위</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">발동 횟수</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Regex 여부</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">상태</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">액션</th>
                </tr>
              </thead>
              <tbody>
                {termLoading ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">로딩 중...</td></tr>
                ) : terminologyRules.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">용어 규칙이 없습니다</td></tr>
                ) : terminologyRules.map(rule => (
                  <tr key={rule.id} className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="px-2 py-0.5 rounded bg-neutral-800 text-xs">{rule.category}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs max-w-xs truncate" title={rule.pattern}>
                      {rule.pattern}
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-400">
                      {rule.replacement.startsWith('fn:') ? (
                        <span className="text-yellow-400 font-mono text-xs underline cursor-help" title="JS/TS 동적 함수형 매핑 규칙">
                          ⚙️ {rule.replacement}
                        </span>
                      ) : rule.replacement}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{rule.priority}</td>
                    <td className="px-4 py-3 text-center font-bold text-blue-400">{rule.hit_count || 0}</td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                      {rule.is_regex ? 'Regex' : '텍스트'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleTermActive(rule)}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                          rule.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-400'
                        }`}
                      >
                        {rule.is_active ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleOpenTermModal(rule)}
                          className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                        >
                          편집
                        </button>
                        <button
                          onClick={() => handleDeleteTerm(rule.id)}
                          className="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded hover:bg-rose-500/30 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {Math.ceil(termTotal / limit) > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={termPage <= 1}
                onClick={() => setTermPage(p => p - 1)}
              >
                이전
              </Button>
              <span className="flex items-center text-sm text-muted-foreground px-3">
                {termPage} / {Math.ceil(termTotal / limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={termPage >= Math.ceil(termTotal / limit)}
                onClick={() => setTermPage(p => p + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}

      {/* ─── TAB 3: EFFECTIVENESS & QUALITY ANALYTICS ─── */}
      {activeTab === 'analytics' && stats && (
        <div className="space-y-6">
          {/* Main indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 bg-neutral-900 border-neutral-800 flex flex-col justify-between">
              <div>
                <p className="text-xs text-muted-foreground">최근 Few-shot 주입 평균 품질 점수</p>
                <p className="text-3xl font-extrabold text-blue-400 mt-2">{stats.fewShotStats.avgFewShotResultScore.toFixed(1)} / 5.0</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-4">최근 200건 생성 섹션에 대한 AI Judge 자가 평가 평균</p>
            </Card>
            <Card className="p-5 bg-neutral-900 border-neutral-800 flex flex-col justify-between">
              <div>
                <p className="text-xs text-muted-foreground">지식 엔진 총 퓨샷 활용 로그</p>
                <p className="text-3xl font-extrabold text-emerald-400 mt-2">{stats.fewShotStats.totalLogs} 건</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-4">생성 시 DB Few-shot이 매칭 및 로드된 누적 횟수</p>
            </Card>
            <Card className="p-5 bg-neutral-900 border-neutral-800 flex flex-col justify-between">
              <div>
                <p className="text-xs text-muted-foreground">최다 치환 카테고리</p>
                <p className="text-3xl font-extrabold text-yellow-400 mt-2">임대 및 거래</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-4">용어 필터 규칙 발동 분포 기반 상위 카테고리</p>
            </Card>
          </div>

          {/* Sub-grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top 10 Terminology hits */}
            <Card className="p-5 bg-neutral-900 border-neutral-800">
              <h3 className="font-bold text-sm mb-4">🔥 최다 발동 용어 규칙 Top 10</h3>
              <div className="space-y-3">
                {stats.terminologyStats.topRules.map((rule, idx) => (
                  <div key={rule.id} className="flex justify-between items-center text-xs border-b border-neutral-800/50 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono w-4">{idx + 1}</span>
                      <span className="font-mono bg-neutral-800 text-muted-foreground px-1.5 py-0.5 rounded text-[10px]">
                        {rule.category}
                      </span>
                      <span className="font-mono text-neutral-300 max-w-[120px] truncate" title={rule.pattern}>
                        {rule.pattern}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-emerald-400 font-semibold max-w-[120px] truncate">
                        {rule.replacement}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                      {rule.hit_count}회
                    </span>
                  </div>
                ))}
                {stats.terminologyStats.topRules.length === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-xs">발동 로그가 존재하지 않습니다</p>
                )}
              </div>
            </Card>

            {/* Few-shot correlation analysis */}
            <Card className="p-5 bg-neutral-900 border-neutral-800">
              <h3 className="font-bold text-sm mb-4">📈 퓨샷별 품질 상관관계 (Effectiveness)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-muted-foreground border-b border-neutral-800 pb-2">
                      <th className="py-2">섹션 유형</th>
                      <th className="py-2">자산유형 / 가격</th>
                      <th className="text-center py-2">사용횟수</th>
                      <th className="text-center py-2">평균 Judge</th>
                      <th className="text-center py-2">효과성</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.fewShotStats.effectiveness.map(eff => (
                      <tr key={eff.goldenId} className="border-b border-neutral-800/40 hover:bg-neutral-800/20">
                        <td className="py-2.5 font-medium">{SECTION_LABELS[eff.sectionType] || eff.sectionType}</td>
                        <td className="py-2.5 text-muted-foreground">{eff.assetType} / {eff.priceBand}</td>
                        <td className="text-center py-2.5 font-mono">{eff.timesUsed}회</td>
                        <td className="text-center py-2.5 font-mono font-bold text-blue-400">{eff.avgResultScore.toFixed(1)}</td>
                        <td className="text-center py-2.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            eff.effectiveness === 'high' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : eff.effectiveness === 'low' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-neutral-800 text-muted-foreground'
                          }`}>
                            {eff.effectiveness === 'high' ? '우수(High)' : eff.effectiveness === 'low' ? '교체권장' : '보통'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {stats.fewShotStats.effectiveness.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted-foreground">
                          분석 가능한 퓨샷 사용 로그가 부족합니다 (최소 1회 이상 생성 및 채점 필요)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Create Golden Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div
            className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4">골든셋 수동 추가</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">섹션 타입</label>
                <select
                  value={createForm.section_type}
                  onChange={e => setCreateForm(f => ({ ...f, section_type: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-800 border border-neutral-700"
                >
                  {Object.entries(SECTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">자산 유형</label>
                  <Input
                    value={createForm.asset_type}
                    onChange={e => setCreateForm(f => ({ ...f, asset_type: e.target.value }))}
                    placeholder="오피스, 꼬마빌딩..."
                    className="bg-neutral-800 border-neutral-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">가격대</label>
                  <Input
                    value={createForm.price_band}
                    onChange={e => setCreateForm(f => ({ ...f, price_band: e.target.value }))}
                    placeholder="10~30억"
                    className="bg-neutral-800 border-neutral-700"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">마크다운 본문 (최소 50자)</label>
                <textarea
                  value={createForm.markdown}
                  onChange={e => setCreateForm(f => ({ ...f, markdown: e.target.value }))}
                  placeholder="골든셋으로 사용할 마크다운 내용을 입력하세요..."
                  rows={8}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-800 border border-neutral-700 resize-y"
                />
                <span className="text-[10px] text-muted-foreground">{createForm.markdown.length}자</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">품질 점수: {createForm.judge_score}</label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  value={createForm.judge_score}
                  onChange={e => setCreateForm(f => ({ ...f, judge_score: parseFloat(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">태그 (쉼표 구분)</label>
                <Input
                  value={createForm.tags}
                  onChange={e => setCreateForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="오피스, 강남, 50억이상"
                  className="bg-neutral-800 border-neutral-700"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button onClick={handleCreateGolden} disabled={creating} className="flex-1 bg-primary text-primary-foreground">
                {creating ? '등록 중...' : '등록'}
              </Button>
              <Button onClick={() => setShowCreate(false)} variant="outline" className="flex-1">
                취소
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Terminology Modal ── */}
      {showTermModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowTermModal(false)}>
          <div
            className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4">{editingTerm ? '용어 규칙 수정' : '용어 규칙 추가'}</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">카테고리</label>
                <select
                  value={termForm.category}
                  onChange={e => setTermForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-800 border border-neutral-700"
                >
                  {TERM_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                  <option value="general">기타</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">매칭 패턴 (Regex 또는 일반 텍스트)</label>
                <Input
                  value={termForm.pattern}
                  onChange={e => setTermForm(f => ({ ...f, pattern: e.target.value }))}
                  placeholder="예: 근저당\s*많 또는 급매"
                  className="bg-neutral-800 border-neutral-700 font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">치환 단어 / 함수 (fn:형식 가능)</label>
                <Input
                  value={termForm.replacement}
                  onChange={e => setTermForm(f => ({ ...f, replacement: e.target.value }))}
                  placeholder="예: 선순위 채권 부담이 큰 또는 fn:pyeongToSqm"
                  className="bg-neutral-800 border-neutral-700 font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">우선순위 (낮을수록 선실행)</label>
                  <Input
                    type="number"
                    value={termForm.priority}
                    onChange={e => setTermForm(f => ({ ...f, priority: parseInt(e.target.value) || 100 }))}
                    className="bg-neutral-800 border-neutral-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">매칭 방식</label>
                  <select
                    value={String(termForm.is_regex)}
                    onChange={e => setTermForm(f => ({ ...f, is_regex: e.target.value === 'true' }))}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-800 border border-neutral-700"
                  >
                    <option value="true">Regex (정규표현식)</option>
                    <option value="false">일반 텍스트 정확 매치</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">설명 / 메모</label>
                <textarea
                  value={termForm.note}
                  onChange={e => setTermForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="규칙에 대한 설명이나 목적을 기록하세요..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-800 border border-neutral-700 resize-y"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <label className="text-xs text-muted-foreground">활성 여부</label>
                <button
                  onClick={() => setTermForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${
                    termForm.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-400'
                  }`}
                >
                  {termForm.is_active ? '활성' : '비활성'}
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button onClick={handleSaveTerm} disabled={termSaving} className="flex-1 bg-primary text-primary-foreground">
                {termSaving ? '저장 중...' : '저장'}
              </Button>
              <Button onClick={() => setShowTermModal(false)} variant="outline" className="flex-1">
                취소
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
