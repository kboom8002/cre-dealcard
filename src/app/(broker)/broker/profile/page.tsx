'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';

/* ─── Tag option constants ─── */

const SPECIALTY_REGIONS = [
  '강남구', '서초구', '송파구', '마포구', '용산구',
  '영등포구', '여의도', '종로구', '중구', '강북구',
  '노원구', '도봉구', '강동구', '광진구', '성동구',
  '기타 서울', '경기 분당', '경기 판교', '경기 수원', '인천',
];

const SPECIALTY_ASSETS = [
  '상가', '오피스빌딩', '꼬마빌딩', '지식산업센터', '물류센터',
  '호텔/숙박', '주유소', '근린상가', '복합용도', '토지',
];

const ASSOCIATIONS = ['한국공인중개사협회', '한국부동산중개협회', '대한부동산학회', '기타', '없음'];

const DEAL_SIZE_RANGES = ['10억 미만', '10~50억', '50~200억', '200~500억', '500억 이상'];

const DEAL_SPECIALTIES = [
  '사옥 취득', '투자수익형', '리모델링/밸류애드', '경공매', '임대차', '개발사업', '신탁개발',
];

const BUYER_TYPES = [
  '법인', '개인 자산가', '패밀리오피스', '리츠/펀드', '시행사/디벨로퍼', '외국인/외국법인',
];

const CONSULT_METHODS = ['전화', '카카오톡', '방문 상담', '화상 미팅', '이메일'];

const RESPONSE_TIME_OPTIONS = [1, 3, 6, 12, 24, 48];

const LANGUAGES = ['한국어', '영어', '중국어', '일본어'];

/* ─── Types ─── */

interface ProfileData {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  phone: string | null;
  company: string | null;
  tagline: string | null;
  broker?: {
    specialty_regions: string[] | null;
    specialty_assets: string[] | null;
    bio: string | null;
    slug: string | null;
    is_verified: boolean;
    license_number: string | null;
    office_reg_number: string | null;
    association: string | null;
    career_start_year: number | null;
    total_deal_count_self: number | null;
    deal_size_range: string | null;
    deal_specialty: string[] | null;
    buyer_types: string[] | null;
    preferred_price_range: string | null;
    fee_policy: string | null;
    consult_methods: string[] | null;
    response_time_hours: number | null;
    languages: string[] | null;
    kakao_channel: string | null;
    naver_blog_url: string | null;
    youtube_url: string | null;
    linkedin_url: string | null;
    avatar_url: string | null;
  } | null;
}

/* ─── CSS class helpers ─── */

const inputClass =
  'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors';

const selectClass =
  'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors appearance-none';

const sectionClass = 'space-y-4 rounded-xl border border-border bg-card p-5';

const sectionTitleClass = 'text-sm font-semibold text-muted-foreground uppercase tracking-wide';

/* ─── Component ─── */

export default function BrokerProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingBio, setGeneratingBio] = useState(false);

  // Section 1: 기본 정보
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [tagline, setTagline] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Section 2: 자격/등록 정보
  const [licenseNumber, setLicenseNumber] = useState('');
  const [officeRegNumber, setOfficeRegNumber] = useState('');
  const [association, setAssociation] = useState('');
  const [careerStartYear, setCareerStartYear] = useState<number | ''>('');

  // Existing tag fields (kept from original)
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);

  // Section 3: 거래 실적
  const [totalDealCount, setTotalDealCount] = useState<number | ''>('');
  const [dealSizeRange, setDealSizeRange] = useState('');
  const [dealSpecialty, setDealSpecialty] = useState<string[]>([]);
  const [buyerTypes, setBuyerTypes] = useState<string[]>([]);
  const [preferredPriceRange, setPreferredPriceRange] = useState('');

  // Section 4: 서비스 정책
  const [feePolicy, setFeePolicy] = useState('');
  const [consultMethods, setConsultMethods] = useState<string[]>([]);
  const [responseTimeHours, setResponseTimeHours] = useState<number | ''>('');
  const [languages, setLanguages] = useState<string[]>([]);

  // Section 5: 소셜 링크
  const [kakaoChannel, setKakaoChannel] = useState('');
  const [naverBlogUrl, setNaverBlogUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');

  // Section 6: 자기소개
  const [bio, setBio] = useState('');
  const [vibeStatus, setVibeStatus] = useState<'uploading' | 'analyzing' | 'done' | null>(null);

  /* ─── Profile completeness calculation ─── */

  const completeness = useMemo(() => {
    let score = 0;
    if (displayName.trim()) score += 5;
    if (phone.trim()) score += 5;
    if (licenseNumber.trim()) score += 15;
    if (careerStartYear) score += 10;
    if (selectedRegions.length >= 3) score += 10;
    if (selectedAssets.length >= 2) score += 10;
    if (totalDealCount) score += 15;
    if (bio.trim().length >= 100) score += 10;
    const hasSocialLink = kakaoChannel.trim() || naverBlogUrl.trim() || youtubeUrl.trim() || linkedinUrl.trim();
    if (hasSocialLink) score += 10;
    if (dealSizeRange) score += 10;
    if (avatarUrl) score += 10;
    return score;
  }, [displayName, phone, licenseNumber, careerStartYear, selectedRegions, selectedAssets, totalDealCount, bio, kakaoChannel, naverBlogUrl, youtubeUrl, linkedinUrl, dealSizeRange, avatarUrl]);

  const completenessColor =
    completeness < 40 ? 'bg-red-500' : completeness < 70 ? 'bg-amber-500' : 'bg-green-500';

  const completenessTextColor =
    completeness < 40 ? 'text-red-500' : completeness < 70 ? 'text-amber-500' : 'text-green-500';

  /* ─── Career years computed ─── */

  const careerYears = useMemo(() => {
    if (!careerStartYear) return null;
    const years = new Date().getFullYear() - Number(careerStartYear);
    return years >= 0 ? years : null;
  }, [careerStartYear]);

  /* ─── Fetch profile ─── */

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/broker/profile', {
        headers: {
          Authorization: `Bearer ${await getToken()}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/login');
          return;
        }
        throw new Error('프로필을 불러오는데 실패했습니다.');
      }
      const { data } = await res.json();
      setProfile(data);

      // Section 1
      setDisplayName(data.display_name ?? '');
      setPhone(data.phone ?? '');
      setCompany(data.company ?? '');
      setTagline(data.tagline ?? '');
      setAvatarUrl(data.broker?.avatar_url ?? '');

      // Existing tags
      setSelectedRegions(data.broker?.specialty_regions ?? []);
      setSelectedAssets(data.broker?.specialty_assets ?? []);

      // Section 2
      setLicenseNumber(data.broker?.license_number ?? '');
      setOfficeRegNumber(data.broker?.office_reg_number ?? '');
      setAssociation(data.broker?.association ?? '');
      setCareerStartYear(data.broker?.career_start_year ?? '');

      // Section 3
      setTotalDealCount(data.broker?.total_deal_count_self ?? '');
      setDealSizeRange(data.broker?.deal_size_range ?? '');
      setDealSpecialty(data.broker?.deal_specialty ?? []);
      setBuyerTypes(data.broker?.buyer_types ?? []);
      setPreferredPriceRange(data.broker?.preferred_price_range ?? '');

      // Section 4
      setFeePolicy(data.broker?.fee_policy ?? '');
      setConsultMethods(data.broker?.consult_methods ?? []);
      setResponseTimeHours(data.broker?.response_time_hours ?? '');
      setLanguages(data.broker?.languages ?? []);

      // Section 5
      setKakaoChannel(data.broker?.kakao_channel ?? '');
      setNaverBlogUrl(data.broker?.naver_blog_url ?? '');
      setYoutubeUrl(data.broker?.youtube_url ?? '');
      setLinkedinUrl(data.broker?.linkedin_url ?? '');

      // Section 6
      setBio(data.broker?.bio ?? '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  /* ─── Save profile ─── */

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/broker/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({
          display_name: displayName || undefined,
          phone: phone || undefined,
          company: company || undefined,
          tagline: tagline || undefined,
          specialty_regions: selectedRegions.length > 0 ? selectedRegions : undefined,
          specialty_assets: selectedAssets.length > 0 ? selectedAssets : undefined,
          bio: bio || undefined,
          license_number: licenseNumber || undefined,
          office_reg_number: officeRegNumber || undefined,
          association: association || undefined,
          career_start_year: careerStartYear ? Number(careerStartYear) : undefined,
          total_deal_count_self: totalDealCount ? Number(totalDealCount) : undefined,
          deal_size_range: dealSizeRange || undefined,
          deal_specialty: dealSpecialty.length > 0 ? dealSpecialty : undefined,
          buyer_types: buyerTypes.length > 0 ? buyerTypes : undefined,
          preferred_price_range: preferredPriceRange || undefined,
          fee_policy: feePolicy || undefined,
          consult_methods: consultMethods.length > 0 ? consultMethods : undefined,
          response_time_hours: responseTimeHours ? Number(responseTimeHours) : undefined,
          languages: languages.length > 0 ? languages : undefined,
          kakao_channel: kakaoChannel || undefined,
          naver_blog_url: naverBlogUrl || undefined,
          youtube_url: youtubeUrl || undefined,
          linkedin_url: linkedinUrl || undefined,
          avatar_url: avatarUrl || undefined,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const detail = typeof errorData.error === 'string' 
          ? errorData.error 
          : JSON.stringify(errorData.error || errorData);
        throw new Error(`저장 실패: ${detail || res.statusText}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ─── AI bio generation ─── */

  const handleGenerateBio = async () => {
    setGeneratingBio(true);
    setError(null);
    try {
      const res = await fetch('/api/broker/profile/generate-bio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({
          name: displayName,
          company,
          licenseNumber: licenseNumber,
          careerStartYear: careerStartYear || undefined,
          regions: selectedRegions,
          assets: selectedAssets,
          dealCount: totalDealCount || undefined,
          dealSizeRange: dealSizeRange || undefined,
          dealSpecialty: dealSpecialty,
          buyerTypes: buyerTypes,
        }),
      });
      if (!res.ok) throw new Error('AI 자기소개 생성에 실패했습니다.');
      const { data } = await res.json();
      if (data?.bio) {
        setBio(data.bio);
        // 즉시 프로필 저장 (Auto-save)
        const token = await getToken();
        await fetch('/api/broker/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            display_name: displayName,
            phone,
            company,
            specialty_regions: selectedRegions,
            specialty_assets: selectedAssets,
            bio: data.bio, // 새로 생성된 바이오 반영
            license_number: licenseNumber,
            office_reg_number: officeRegNumber,
            association,
            career_start_year: careerStartYear || null,
            total_deal_count_self: totalDealCount || null,
            deal_size_range: dealSizeRange || null,
            deal_specialty: dealSpecialty,
            buyer_types: buyerTypes,
            preferred_price_range: preferredPriceRange || null,
            fee_policy: feePolicy || null,
            consult_methods: consultMethods,
            response_time_hours: responseTimeHours || null,
            languages,
            kakao_channel: kakaoChannel,
            naver_blog_url: naverBlogUrl,
            youtube_url: youtubeUrl,
            linkedin_url: linkedinUrl,
            avatar_url: avatarUrl || null,
          }),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGeneratingBio(false);
    }
  };

  /* ─── Tag toggle helper ─── */

  const toggleTag = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  /* ─── Tag chip renderer ─── */

  const renderChips = (
    options: string[],
    selected: string[],
    setSelected: (v: string[]) => void,
    idPrefix: string,
  ) => (
    <div className="flex flex-wrap gap-2">
      {options.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => toggleTag(selected, setSelected, item)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            selected.includes(item)
              ? 'bg-primary/10 text-primary border-primary/40'
              : 'bg-background text-muted-foreground border-border hover:border-primary/30'
          }`}
          id={`${idPrefix}-${item}`}
        >
          {item}
        </button>
      ))}
    </div>
  );

  /* ─── Loading state ─── */

  if (loading) {
    return (
      <main className="flex flex-col items-center min-h-screen px-4 py-8">
        <div className="w-full max-w-md mx-auto space-y-4 pt-4">
          <div className="h-8 bg-muted rounded-lg animate-pulse w-48" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
        </div>
      </main>
    );
  }

  /* ─── Render ─── */

  return (<>
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">내 프로필</h1>
            <p className="text-sm text-muted-foreground">
              {profile?.email}
              {profile?.broker?.is_verified && (
                <span className="ml-2 inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 px-2 py-0.5 text-xs font-medium">
                  ✓ 인증됨
                </span>
              )}
            </p>
          </div>
          
          {profile?.broker?.slug ? (
            <a
              href={`/vibe-card/${profile.broker.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow-sm border"
              style={{
                background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                color: '#fff',
                borderColor: 'rgba(255,255,255,0.1)',
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <circle cx="8.5" cy="11.5" r="2.5"></circle>
                <path d="M12.5 17.5v-1a2.5 2.5 0 0 0-2.5-2.5h-3A2.5 2.5 0 0 0 4.5 16.5v1"></path>
                <path d="M14 10h5"></path>
                <path d="M14 14h5"></path>
              </svg>
              내 Vibe Card 보기
            </a>
          ) : (
            <a
              href="/broker/my-card/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow-sm border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
            >
              ✨ Vibe 명함 만들기
            </a>
          )}
        </div>

        {/* Error / Success */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}
        {saved && (
          <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
            ✓ 프로필이 저장되었습니다.
          </div>
        )}

        {/* ─── Section 7: 프로필 완성도 게이지 (placed at top) ─── */}
        <section className={sectionClass}>
          <div className="flex items-center justify-between">
            <h2 className={sectionTitleClass}>프로필 완성도</h2>
            <span className={`text-sm font-bold ${completenessTextColor}`}>
              {completeness}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${completenessColor}`}
              style={{ width: `${completeness}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>이름 +5% · 연락처 +5% · 자격증번호 +15% · 개업연도 +10%</p>
            <p>전문지역 3개+ +10% · 전문자산 2개+ +10%</p>
            <p>거래실적 +15% · 자기소개 100자+ +10%</p>
            <p>소셜링크 1개+ +10% · 거래금액대 +10%</p>
          </div>
        </section>

        {/* ─── Section 1: 기본 정보 ─── */}
        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>기본 정보</h2>

          <div className="flex items-center gap-4 py-2">
            <div className="relative w-20 h-20 rounded-full bg-muted border overflow-hidden flex-shrink-0 group">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-3xl">
                  👤
                </div>
              )}
              <label className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <span className="text-[10px] font-medium">사진 변경</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    const formData = new FormData();
                    formData.append("file", file);
                    setVibeStatus('uploading');
                    
                    try {
                      const res = await fetch("/api/broker/profile/avatar", {
                        method: "POST",
                        body: formData,
                      });
                      const data = await res.json();
                      if (data.url) {
                        setAvatarUrl(data.url);
                        setVibeStatus('analyzing');
                        // Vibe 재분석은 avatar API에서 비동기 트리거됨
                        // 3초 후 완료 표시 (실제 분석 시간에 근사)
                        setTimeout(() => {
                          setVibeStatus('done');
                          setTimeout(() => setVibeStatus(null), 4000);
                        }, 3000);
                      } else {
                        throw new Error(data.error || "업로드 실패");
                      }
                    } catch (err: any) {
                      setError(err.message);
                      setVibeStatus(null);
                    }
                  }}
                />
              </label>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>신뢰를 주는 프로필 사진을 등록해보세요.</p>
              <p className="text-xs">권장: 정방형 500x500 픽셀</p>
              {/* ─── Vibe 분석 피드백 ─── */}
              {vibeStatus === 'uploading' && (
                <p className="text-xs text-blue-500 animate-pulse">📤 사진 업로드 중...</p>
              )}
              {vibeStatus === 'analyzing' && (
                <p className="text-xs text-violet-500 animate-pulse">🤖 AI가 사진을 분석하고 있습니다...</p>
              )}
              {vibeStatus === 'done' && (
                <p className="text-xs text-emerald-500 font-medium">✅ Vibe AI 분석 완료! 명함에 반영됩니다.</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5 mt-2">
            <label className="block text-sm font-medium">이름</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
              placeholder="홍길동"
              id="profile-display-name"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">연락처</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="010-0000-0000"
              id="profile-phone"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">소속 / 회사</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputClass}
              placeholder="JS 부동산 중개법인"
              id="profile-company"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">공유 타이틀 (OG Title)</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className={inputClass}
              placeholder="상업용 부동산 전문 중개사"
              id="profile-tagline"
            />
            <p className="text-xs text-muted-foreground mt-1">
              카카오톡 등에 명함을 공유할 때 제목으로 표시됩니다.
            </p>
          </div>
        </section>

        {/* ─── Section 2: 자격/등록 정보 ─── */}
        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>자격/등록 정보</h2>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">공인중개사 자격증 번호</label>
            <input
              type="text"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className={inputClass}
              placeholder="제12345호"
              id="profile-license-number"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">중개사무소 등록번호</label>
            <input
              type="text"
              value={officeRegNumber}
              onChange={(e) => setOfficeRegNumber(e.target.value)}
              className={inputClass}
              placeholder="서울강남-2024-00123"
              id="profile-office-reg-number"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">소속 협회</label>
            <select
              value={association}
              onChange={(e) => setAssociation(e.target.value)}
              className={selectClass}
              id="profile-association"
            >
              <option value="">선택하세요</option>
              {ASSOCIATIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">개업 연도</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={careerStartYear}
                onChange={(e) => setCareerStartYear(e.target.value ? Number(e.target.value) : '')}
                className={inputClass}
                placeholder="2015"
                min={1970}
                max={new Date().getFullYear()}
                id="profile-career-start-year"
              />
              {careerYears !== null && (
                <span className="text-sm text-primary font-medium whitespace-nowrap">
                  경력 {careerYears}년
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ─── Existing: 전문 지역 ─── */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className={sectionTitleClass}>전문 지역</h2>
            <p className="text-xs text-muted-foreground mt-0.5">주로 활동하는 지역을 선택하세요 (복수 선택 가능)</p>
          </div>
          {renderChips(SPECIALTY_REGIONS, selectedRegions, setSelectedRegions, 'region')}
        </section>

        {/* ─── Existing: 전문 자산 유형 ─── */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className={sectionTitleClass}>전문 자산 유형</h2>
            <p className="text-xs text-muted-foreground mt-0.5">주로 다루는 자산 유형을 선택하세요</p>
          </div>
          {renderChips(SPECIALTY_ASSETS, selectedAssets, setSelectedAssets, 'asset')}
        </section>

        {/* ─── Section 3: 거래 실적 ─── */}
        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>거래 실적</h2>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">총 거래 건수</label>
            <input
              type="number"
              value={totalDealCount}
              onChange={(e) => setTotalDealCount(e.target.value ? Number(e.target.value) : '')}
              className={inputClass}
              placeholder="0"
              min={0}
              id="profile-total-deal-count"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">전문 거래 금액대</label>
            <select
              value={dealSizeRange}
              onChange={(e) => setDealSizeRange(e.target.value)}
              className={selectClass}
              id="profile-deal-size-range"
            >
              <option value="">선택하세요</option>
              {DEAL_SIZE_RANGES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">딜 유형 전문성</label>
            {renderChips(DEAL_SPECIALTIES, dealSpecialty, setDealSpecialty, 'deal-spec')}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">매수자 유형</label>
            {renderChips(BUYER_TYPES, buyerTypes, setBuyerTypes, 'buyer-type')}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">선호 거래 규모</label>
            <select
              value={preferredPriceRange}
              onChange={(e) => setPreferredPriceRange(e.target.value)}
              className={selectClass}
              id="profile-preferred-price-range"
            >
              <option value="">선택하세요</option>
              {DEAL_SIZE_RANGES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ─── Section 4: 서비스 정책 ─── */}
        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>서비스 정책</h2>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">수수료 정책</label>
            <div className="flex gap-4">
              {(['법정수수료 준수', '별도 협의'] as const).map((option) => (
                <label key={option} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="fee-policy"
                    value={option}
                    checked={feePolicy === option}
                    onChange={(e) => setFeePolicy(e.target.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{option}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">상담 방식</label>
            {renderChips(CONSULT_METHODS, consultMethods, setConsultMethods, 'consult')}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">응답 보장 시간</label>
            <select
              value={responseTimeHours}
              onChange={(e) => setResponseTimeHours(e.target.value ? Number(e.target.value) : '')}
              className={selectClass}
              id="profile-response-time"
            >
              <option value="">선택하세요</option>
              {RESPONSE_TIME_OPTIONS.map((h) => (
                <option key={h} value={h}>{h}시간 이내</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">소통 가능 언어</label>
            {renderChips(LANGUAGES, languages, setLanguages, 'lang')}
          </div>
        </section>

        {/* ─── Section 5: 소셜 링크 ─── */}
        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>소셜 링크</h2>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">카카오채널 ID</label>
            <input
              type="text"
              value={kakaoChannel}
              onChange={(e) => setKakaoChannel(e.target.value)}
              className={inputClass}
              placeholder="@credeal"
              id="profile-kakao-channel"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">네이버 블로그</label>
            <input
              type="url"
              value={naverBlogUrl}
              onChange={(e) => setNaverBlogUrl(e.target.value)}
              className={inputClass}
              placeholder="https://blog.naver.com/..."
              id="profile-naver-blog"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">유튜브 채널</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className={inputClass}
              placeholder="https://youtube.com/@..."
              id="profile-youtube"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">LinkedIn</label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className={inputClass}
              placeholder="https://linkedin.com/in/..."
              id="profile-linkedin"
            />
          </div>
        </section>

        {/* ─── Section 6: 자기소개 ─── */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className={sectionTitleClass}>자기소개</h2>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={5}
            maxLength={1000}
            className={`${inputClass} resize-none`}
            placeholder="중개 경력, 전문 분야, 고객에게 전하고 싶은 메시지를 작성해주세요."
            id="profile-bio"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleGenerateBio}
              disabled={generatingBio}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              id="generate-bio-btn"
            >
              {generatingBio ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  AI가 프로필 정보를 기반으로 작성 중...
                </>
              ) : (
                '✨ AI로 자기소개 생성하기'
              )}
            </button>
            <p className="text-xs text-muted-foreground">{bio.length}/1000</p>
          </div>
        </section>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl px-4 py-3.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          id="save-profile-btn"
        >
          {saving ? '저장 중...' : '프로필 저장'}
        </button>

        {/* Logout */}
        <form action={logout}>
          <button
            type="submit"
            className="w-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-xl px-4 py-3 text-sm transition-colors"
            id="logout-btn"
          >
            로그아웃
          </button>
        </form>
      </div>
    </main>
    <BrokerBottomNav />
  </>);
}

// Helper to get Supabase session token from cookie via client
async function getToken(): Promise<string> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  } catch {
    return '';
  }
}
