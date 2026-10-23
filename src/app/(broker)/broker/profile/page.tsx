'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';
import { FieldCoachBanner } from '@/components/help/FieldCoachBanner';
import { SeniorTermTooltip } from '@/components/help/SeniorTermTooltip';

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
  'w-full bg-background border border-border rounded-xl px-4 py-3 min-h-[48px] text-[16px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors';

const selectClass =
  'w-full bg-background border border-border rounded-xl px-4 py-3 min-h-[48px] text-[16px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors appearance-none';

const sectionClass = 'space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm';

const sectionTitleClass = 'text-[18px] font-extrabold text-foreground tracking-tight';

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
      setAvatarUrl(data.broker?.avatar_url ?? data.broker?.photo_url ?? data.photo_url ?? '');

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
      // 전화번호 자동 포맷팅: 하이픈 없이 입력해도 정상 저장되도록
      let formattedPhone = phone;
      if (phone) {
        const digits = phone.replace(/[^\d]/g, '');
        if (digits.length === 11 && digits.startsWith('010')) {
          formattedPhone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        }
      }

      const res = await fetch('/api/broker/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({
          display_name: displayName || undefined,
          phone: formattedPhone || undefined,
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
        // 사용자 친화적 에러 메시지 변환
        if (errorData.error?.fieldErrors) {
          const fieldErrors = errorData.error.fieldErrors;
          const messages: string[] = [];
          for (const [field, errs] of Object.entries(fieldErrors)) {
            const fieldLabels: Record<string, string> = {
              buyer_types: '매수자 유형',
              deal_specialty: '딜 유형 전문성',
              languages: '소통 언어',
              phone: '연락처',
              display_name: '이름',
              bio: '자기소개',
            };
            const label = fieldLabels[field] || field;
            messages.push(`${label}: ${(errs as string[]).join(', ')}`);
          }
          throw new Error(`저장 실패: ${messages.join(' | ')}`);
        }
        const detail = typeof errorData.error === 'string' 
          ? errorData.error 
          : '알 수 없는 오류가 발생했습니다';
        throw new Error(`저장 실패: ${detail}`);
      }
      // 포맷팅된 전화번호를 UI에도 반영
      if (formattedPhone && formattedPhone !== phone) {
        setPhone(formattedPhone);
      }
      // 저장 후 서버 데이터로 동기화하여 필드 초기화 방지
      await fetchProfile();
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
      const json = await res.json();
      if (json.bio) {
        setBio(json.bio);
        // 즉시 프로필 저장 (Auto-save)
        const token = await getToken();
        const autoSaveRes = await fetch('/api/broker/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            display_name: displayName || undefined,
            phone: phone || undefined,
            company: company || undefined,
            tagline: tagline || undefined,
            specialty_regions: selectedRegions.length > 0 ? selectedRegions : undefined,
            specialty_assets: selectedAssets.length > 0 ? selectedAssets : undefined,
            bio: json.bio, // 새로 생성된 바이오 반영
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
        if (!autoSaveRes.ok) {
          console.warn('[profile] AI bio auto-save failed:', autoSaveRes.status);
        }
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
          className={`px-3.5 py-2 min-h-[40px] rounded-xl text-[14px] font-bold border transition-all ${
            selected.includes(item)
              ? 'bg-primary/15 text-primary border-primary/50 shadow-xs'
              : 'bg-background text-muted-foreground border-border hover:border-primary/30'
          }`}
          id={`${idPrefix}-${item}`}
        >
          {selected.includes(item) ? `✓ ${item}` : item}
        </button>
      ))}
    </div>
  );

  /* ─── Loading state ─── */

  if (loading) {
    return (
      <main className="flex flex-col items-center min-h-screen px-4 py-8">
        <div className="w-full max-w-2xl mx-auto space-y-4 pt-4">
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
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="space-y-1">
            <h1 className="text-[26px] font-black tracking-tight">내 프로필 · 중개사무소 설정</h1>
            <p className="text-[15px] text-muted-foreground font-medium">
              로그인 계정: {profile?.email}
              {profile?.broker?.is_verified && (
                <span className="ml-2 inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-0.5 text-xs font-bold">
                  ✓ 공인중개사 인증됨
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold rounded-xl px-5 py-3 min-h-[46px] text-[15px] shadow-sm transition-colors disabled:opacity-60"
            data-testid="save-profile-top-btn"
          >
            {saving ? '저장 중...' : '💾 변경사항 저장'}
          </button>
        </div>

        {/* 60대 중개인 친화 안내 배너: 어디에 인쇄/표시되는지 명확히 설명 */}
        <div data-testid="profile-where-it-shows-banner">
          <FieldCoachBanner
            headline="🏛️ 중개사무소 정보 인쇄 위치 및 명함 등록 안내"
            guidance={
              <ul className="space-y-1 text-[14px] text-slate-800 leading-relaxed">
                <li>• <strong>PPTX Slide 01 표지 &amp; Slide 10 문의/유의사항</strong>: 대표자 성함, 직통 연락처, 상호, 개설등록번호 자동 인쇄</li>
                <li>• <strong>카카오톡 딜카드 하단 명함 &amp; 주간 고객 소식지 상단 헤더</strong>: 대표님 프로필 사진과 직통 전화 연결 배지로 표시</li>
                <li>• 한 번만 정확히 등록해 두시면 모든 제안서와 고객용 화면에 법정 표시 규격으로 자동 반영됩니다.</li>
              </ul>
            }
            sampleText="[표준 공인중개사무소 프로필 예시]&#10;상호: JS 부동산중개법인 (대표: 홍길동)&#10;직통전화: 010-1234-5678 (사무실: 02-555-1234)&#10;개설등록번호: 제 11560-2015-00123 호&#10;자격증번호: 2008-11-05432"
            sampleButtonLabel="✨ 표준 양식 1초 예시 채우기"
            onApplySample={() => {
              if (!displayName) setDisplayName("홍길동 대표공인중개사");
              if (!phone) setPhone("010-1234-5678");
              if (!company) setCompany("JS 부동산중개법인");
              if (!officeRegNumber) setOfficeRegNumber("제 11560-2015-00123 호");
              if (!licenseNumber) setLicenseNumber("2008-11-05432");
              if (!tagline) setTagline("강남·서초 꼬마빌딩 및 사옥 전문 20년 베테랑 중개");
            }}
            mistakeWarning="개설등록번호나 직통 연락처 오타가 나면 제안서를 받은 고객이 전화를 걸지 못하거나 공인중개사법상 표시광고 위반 소지가 생길 수 있으니, 등록증상의 번호와 정확히 일치하는지 한 번 더 확인해 주세요."
            variant="amber"
          />
        </div>

        {/* Error / Success */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-[15px] font-semibold text-destructive">
            {error}
          </div>
        )}
        {saved && (
          <div className="p-4 bg-success/10 border border-success/30 rounded-xl text-[15px] font-bold text-success">
            ✓ 내 프로필과 중개사무소 정보가 저장되었습니다.
          </div>
        )}

        {/* ─── Section 7: 프로필 완성도 게이지 (placed at top) ─── */}
        <section className={sectionClass}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={sectionTitleClass}>프로필 신뢰도 완성 점수</h2>
              <p className="text-[14px] text-muted-foreground mt-0.5">
                70% 이상 채우시면 고객에게 보여지는 명함과 소식지의 신뢰도가 크게 높아집니다.
              </p>
            </div>
            <span className={`text-[22px] font-black ${completenessTextColor}`}>
              {completeness}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-3.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${completenessColor}`}
              style={{ width: `${completeness}%` }}
            />
          </div>
          <div className="text-[13px] text-muted-foreground space-y-0.5 pt-1">
            <p>• 필수 기본정보(이름 +5% · 연락처 +5% · 사진 +10%) · 자격증번호(+15%) · 개업연도(+10%)</p>
            <p>• 전문지역 3곳 이상(+10%) · 전문자산 2개 이상(+10%) · 거래실적(+15%) · 거래금액대(+10%) · 자기소개 100자+(+10%)</p>
          </div>
        </section>

        {/* ─── Section 1: 기본 정보 (필수 3대 정보 강조) ─── */}
        <section className="space-y-5 rounded-2xl border-2 border-amber-500/40 bg-card p-6 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[13px] font-extrabold">
                가장 중요 · 필수 입력
              </span>
              <h2 className={sectionTitleClass}>① 기본 명함 정보 (이름 · 연락처 · 상호 · 사진)</h2>
            </div>
            <p className="text-[14px] text-muted-foreground">
              딜카드, PPTX 제안서(IM) 표지, 고객 소식지에 대표님의 명함으로 바로 인쇄되는 항목입니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 py-2 p-4 rounded-xl bg-muted/40 border border-border">
            <div className="relative w-24 h-24 rounded-full bg-muted border-2 border-border overflow-hidden flex-shrink-0 group">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-4xl">
                  👤
                </div>
              )}
            </div>
            <div className="flex-1 min-w-[200px] space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[15px] font-bold text-foreground">대표님 인물 사진 (또는 사무소 로고)</p>
                <SeniorTermTooltip termKey="프로필 사진 인쇄 위치" />
              </div>
              <p className="text-[13px] text-muted-foreground">
                밝게 웃으시는 정장 사진이나 사무소 로고를 등록하시면 고객 소식지와 모바일 명함 상단에 표시됩니다.
              </p>
              <div>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[14px] font-extrabold cursor-pointer transition-colors">
                  <span>📷 내 컴퓨터/폰에서 사진 선택하기</span>
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
              {/* ─── Vibe 분석 피드백 ─── */}
              {vibeStatus === 'uploading' && (
                <p className="text-[14px] text-blue-500 font-semibold animate-pulse">📤 사진을 올리고 있습니다...</p>
              )}
              {vibeStatus === 'analyzing' && (
                <p className="text-[14px] text-violet-500 font-semibold animate-pulse">🤖 명함에 어울리게 사진을 다듬고 있습니다...</p>
              )}
              {vibeStatus === 'done' && (
                <p className="text-[14px] text-emerald-500 font-bold">✅ 사진 등록 완료! 아래 [프로필 저장] 버튼을 꼭 눌러주세요.</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5 mt-2">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-display-name" className="block text-[16px] font-bold">
                성함 (직함 포함 가능) <span className="text-rose-500">*</span>
              </label>
              <SeniorTermTooltip termKey="대표자 성함 인쇄 위치" />
            </div>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
              placeholder="예: 홍길동 대표공인중개사"
              id="profile-display-name"
            />
            <p className="text-[13px] text-muted-foreground">
              제안서(IM) 표지 하단과 카카오톡 명함에 표시될 성함입니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-phone" className="block text-[16px] font-bold">
                휴대폰 또는 사무실 전화번호 <span className="text-rose-500">*</span>
              </label>
              <SeniorTermTooltip termKey="직통 연락처 인쇄 위치" />
            </div>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="예: 010-1234-5678 (숫자만 입력하셔도 자동 변환됩니다)"
              id="profile-phone"
            />
            <p className="text-[13px] text-muted-foreground">
              고객이 딜카드나 제안서에서 [전화 문의하기] 버튼을 누르면 이 번호로 바로 연결됩니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-company" className="block text-[16px] font-bold">
                중개사무소 상호 (회사명) <span className="text-rose-500">*</span>
              </label>
              <SeniorTermTooltip termKey="중개법인 상호 인쇄 위치" />
            </div>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputClass}
              placeholder="예: 양평 삼성 공인중개사사무소 / JS 부동산중개법인"
              id="profile-company"
            />
            <p className="text-[13px] text-muted-foreground">
              PPTX 투자설명서(IM) 첫 장 표지와 매수자용 웹 화면 상단에 인쇄됩니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-tagline" className="block text-[16px] font-bold">
              명함 한줄 소개 문구 (카카오톡 공유 제목)
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className={inputClass}
              placeholder="예: 영등포·당산·양평 꼬마빌딩·수익형 빌딩 20년 전문 중개"
              id="profile-tagline"
            />
            <p className="text-[13px] text-muted-foreground mt-1">
              카카오톡으로 명함이나 소식지를 보낼 때 성함 옆에 따라붙는 한줄 소개글입니다.
            </p>
          </div>
        </section>

        {/* ─── Section 2: 자격/등록 정보 ─── */}
        <section className={sectionClass}>
          <div className="space-y-1">
            <h2 className={sectionTitleClass}>② 공인중개사 자격 및 사무소 등록 정보</h2>
            <p className="text-[14px] text-muted-foreground">
              자격증 번호와 등록번호를 입력해 두시면 법인·자산가 고객이 제안서를 열람할 때 공식 등록 중개사무소로 표시되어 신뢰도가 높아집니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-license-number" className="block text-[16px] font-bold">공인중개사 자격증 번호</label>
              <SeniorTermTooltip termKey="공인중개사 자격증 번호" />
            </div>
            <input
              type="text"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className={inputClass}
              placeholder="예: 2008-11-05432"
              id="profile-license-number"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-office-reg-number" className="block text-[16px] font-bold">중개사무소 개설등록번호</label>
              <SeniorTermTooltip termKey="개설등록번호 인쇄 위치" />
            </div>
            <input
              type="text"
              value={officeRegNumber}
              onChange={(e) => setOfficeRegNumber(e.target.value)}
              className={inputClass}
              placeholder="예: 제 11560-2015-00123 호"
              id="profile-office-reg-number"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-association" className="block text-[16px] font-bold">소속 협회</label>
            <select
              value={association}
              onChange={(e) => setAssociation(e.target.value)}
              className={selectClass}
              id="profile-association"
            >
              <option value="">협회 선택 (선택사항)</option>
              {ASSOCIATIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-career-start-year" className="block text-[16px] font-bold">부동산 중개 시작 연도 (개업 연도)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={careerStartYear}
                onChange={(e) => setCareerStartYear(e.target.value ? Number(e.target.value) : '')}
                className={inputClass}
                placeholder="예: 2006 (숫자 4자리)"
                min={1970}
                max={new Date().getFullYear()}
                id="profile-career-start-year"
              />
              {careerYears !== null && (
                <span className="text-[16px] text-primary font-extrabold whitespace-nowrap px-3 py-2 rounded-xl bg-primary/10">
                  경력 {careerYears}년차
                </span>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground">
              시작 연도를 입력하시면 &apos;경력 O년차&apos;가 자동으로 계산되어 프로필에 표시됩니다.
            </p>
          </div>
        </section>

        {/* ─── Existing: 전문 지역 ─── */}
        <section className={sectionClass}>
          <div>
            <h2 className={sectionTitleClass}>③ 주로 활동하시는 전문 지역 (3곳 이상 선택 권장)</h2>
            <p className="text-[14px] text-muted-foreground mt-1">
              해당하는 지역 버튼을 마우스로 클릭해 주세요. 한 번 더 누르면 선택이 해제됩니다.
            </p>
          </div>
          {renderChips(SPECIALTY_REGIONS, selectedRegions, setSelectedRegions, 'region')}
        </section>

        {/* ─── Existing: 전문 자산 유형 ─── */}
        <section className={sectionClass}>
          <div>
            <h2 className={sectionTitleClass}>④ 주로 취급하시는 건물·자산 종류 (2개 이상 선택 권장)</h2>
            <p className="text-[14px] text-muted-foreground mt-1">
              꼬마빌딩, 근린상가, 오피스빌딩 등 주로 중개하시는 물건 종류를 눌러 선택해 주세요.
            </p>
          </div>
          {renderChips(SPECIALTY_ASSETS, selectedAssets, setSelectedAssets, 'asset')}
        </section>

        {/* ─── Section 3: 거래 실적 ─── */}
        <section className={sectionClass}>
          <div className="space-y-1">
            <h2 className={sectionTitleClass}>⑤ 누적 거래 경험 및 주요 고객층</h2>
            <p className="text-[14px] text-muted-foreground">
              대략적인 누적 중개 건수와 주요 금액대를 선택해 두시면 AI 자기소개 작성 시 큰 도움이 됩니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-total-deal-count" className="block text-[16px] font-bold">누적 매매·임대 중개 건수 (어림숫자 가능)</label>
            <input
              type="number"
              value={totalDealCount}
              onChange={(e) => setTotalDealCount(e.target.value ? Number(e.target.value) : '')}
              className={inputClass}
              placeholder="예: 120"
              min={0}
              id="profile-total-deal-count"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-deal-size-range" className="block text-[16px] font-bold">주로 중개하시는 매물 금액대</label>
            <select
              value={dealSizeRange}
              onChange={(e) => setDealSizeRange(e.target.value)}
              className={selectClass}
              id="profile-deal-size-range"
            >
              <option value="">금액대 선택</option>
              {DEAL_SIZE_RANGES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[16px] font-bold">주로 다루시는 거래 목적 (복수 선택 가능)</label>
            {renderChips(DEAL_SPECIALTIES, dealSpecialty, setDealSpecialty, 'deal-spec')}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[16px] font-bold">주로 상담하시는 매수 고객층 (복수 선택 가능)</label>
            {renderChips(BUYER_TYPES, buyerTypes, setBuyerTypes, 'buyer-type')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-preferred-price-range" className="block text-[16px] font-bold">가장 자신 있는 주력 매물 규모</label>
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
          <div className="space-y-1">
            <h2 className={sectionTitleClass}>⑥ 고객 상담 방식 및 수수료 안내</h2>
            <p className="text-[14px] text-muted-foreground">
              고객이 어떤 방법으로 연락하면 좋은지 안내하는 항목입니다.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-[16px] font-bold">중개보수(수수료) 안내 기준</label>
            <div className="flex flex-wrap gap-4">
              {(['법정수수료 준수', '별도 협의'] as const).map((option) => (
                <label key={option} className="flex items-center gap-2.5 cursor-pointer px-3.5 py-2.5 rounded-xl border border-border bg-background">
                  <input
                    type="radio"
                    name="fee-policy"
                    value={option}
                    checked={feePolicy === option}
                    onChange={(e) => setFeePolicy(e.target.value)}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="text-[15px] font-semibold">{option}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[16px] font-bold">선호하는 고객 상담 방식 (복수 선택 가능)</label>
            {renderChips(CONSULT_METHODS, consultMethods, setConsultMethods, 'consult')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-response-time" className="block text-[16px] font-bold">문의 접수 시 평균 연락(응답) 시간</label>
            <select
              value={responseTimeHours}
              onChange={(e) => setResponseTimeHours(e.target.value ? Number(e.target.value) : '')}
              className={selectClass}
              id="profile-response-time"
            >
              <option value="">선택하세요</option>
              {RESPONSE_TIME_OPTIONS.map((h) => (
                <option key={h} value={h}>{h}시간 이내 연락</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[16px] font-bold">상담 가능 언어</label>
            {renderChips(LANGUAGES, languages, setLanguages, 'lang')}
          </div>
        </section>

        {/* ─── Section 5: 소셜 링크 ─── */}
        <section className={sectionClass}>
          <div className="space-y-1">
            <h2 className={sectionTitleClass}>⑦ 블로그 · 유튜브 · 카카오톡 채널 (선택사항)</h2>
            <p className="text-[14px] text-muted-foreground">
              운영하시는 네이버 블로그나 유튜브가 있으실 때만 적어주시면 됩니다. 없으시면 비워두셔도 전혀 지장 없습니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-kakao-channel" className="block text-[16px] font-bold">카카오톡 채널 아이디 (있으실 경우)</label>
            <input
              type="text"
              value={kakaoChannel}
              onChange={(e) => setKakaoChannel(e.target.value)}
              className={inputClass}
              placeholder="예: @credeal (없으시면 비워두세요)"
              id="profile-kakao-channel"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-naver-blog" className="block text-[16px] font-bold">네이버 블로그 주소 (있으실 경우)</label>
            <input
              type="url"
              value={naverBlogUrl}
              onChange={(e) => setNaverBlogUrl(e.target.value)}
              className={inputClass}
              placeholder="예: https://blog.naver.com/내블로그아이디"
              id="profile-naver-blog"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-youtube" className="block text-[16px] font-bold">유튜브 채널 주소 (있으실 경우)</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className={inputClass}
              placeholder="예: https://youtube.com/@채널이름"
              id="profile-youtube"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-linkedin" className="block text-[16px] font-bold">기타 홈페이지 / 링크드인 주소 (선택)</label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className={inputClass}
              placeholder="https://..."
              id="profile-linkedin"
            />
          </div>
        </section>

        {/* ─── Section 6: 자기소개 ─── */}
        <section className={sectionClass}>
          <div className="space-y-1">
            <h2 className={sectionTitleClass}>⑧ 고객에게 전하는 인사말 (자기소개)</h2>
            <p className="text-[14px] text-muted-foreground">
              직접 쓰기 막막하시다면 위에서 선택하신 지역·경력을 바탕으로 아래 <strong>[✨ AI로 자기소개 자동 작성하기]</strong> 버튼을 눌러보세요!
            </p>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={5}
            maxLength={1000}
            className={`${inputClass} resize-none leading-relaxed`}
            placeholder="중개 경력, 전문 분야, 건물주·매수인 고객께 전하고 싶은 인사말을 적어주세요."
            id="profile-bio"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleGenerateBio}
              disabled={generatingBio}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-[14px] font-extrabold border border-primary/40 text-primary bg-primary/10 hover:bg-primary/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              id="generate-bio-btn"
            >
              {generatingBio ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  AI가 대표님의 경력과 지역에 맞춰 인사말을 작성 중입니다...
                </>
              ) : (
                '✨ AI로 자기소개 자동 작성하기 (추천)'
              )}
            </button>
            <p className="text-[13px] font-medium text-muted-foreground">{bio.length} / 1,000자</p>
          </div>
        </section>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold rounded-2xl px-5 py-4 min-h-[56px] text-[18px] shadow-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          id="save-profile-btn"
        >
          {saving ? '저장 중...' : '💾 내 프로필 · 사무소 정보 저장하기'}
        </button>

        {/* Logout */}
        <form action={logout}>
          <button
            type="submit"
            className="w-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-xl px-4 py-3.5 min-h-[48px] text-[15px] font-semibold transition-colors"
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
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  } catch {
    return '';
  }
}
