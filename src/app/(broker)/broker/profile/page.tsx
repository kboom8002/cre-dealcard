'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import type { Metadata } from 'next';

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

interface ProfileData {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  phone: string | null;
  company: string | null;
  broker?: {
    specialty_regions: string[] | null;
    specialty_assets: string[] | null;
    bio: string | null;
    is_verified: boolean;
  } | null;
}

export default function BrokerProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [bio, setBio] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);

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
      setDisplayName(data.display_name ?? '');
      setPhone(data.phone ?? '');
      setCompany(data.company ?? '');
      setBio(data.broker?.bio ?? '');
      setSelectedRegions(data.broker?.specialty_regions ?? []);
      setSelectedAssets(data.broker?.specialty_assets ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

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
          display_name: displayName,
          phone,
          company,
          bio,
          specialty_regions: selectedRegions,
          specialty_assets: selectedAssets,
        }),
      });
      if (!res.ok) throw new Error('저장에 실패했습니다.');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  if (loading) {
    return (
      <main className="flex flex-col items-center min-h-screen px-4 py-8">
        <div className="w-full max-w-md mx-auto space-y-4 pt-4">
          <div className="h-8 bg-muted rounded-lg animate-pulse w-48" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-1 pt-4">
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

        {/* Basic Info */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">기본 정보</h2>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">이름</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
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
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
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
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
              placeholder="JS 부동산 중개법인"
              id="profile-company"
            />
          </div>
        </section>

        {/* Specialty Regions */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">전문 지역</h2>
            <p className="text-xs text-muted-foreground mt-0.5">주로 활동하는 지역을 선택하세요 (복수 선택 가능)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SPECIALTY_REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => toggleTag(selectedRegions, setSelectedRegions, region)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selectedRegions.includes(region)
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/30'
                }`}
                id={`region-${region}`}
              >
                {region}
              </button>
            ))}
          </div>
        </section>

        {/* Specialty Assets */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">전문 자산 유형</h2>
            <p className="text-xs text-muted-foreground mt-0.5">주로 다루는 자산 유형을 선택하세요</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SPECIALTY_ASSETS.map((asset) => (
              <button
                key={asset}
                type="button"
                onClick={() => toggleTag(selectedAssets, setSelectedAssets, asset)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selectedAssets.includes(asset)
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/30'
                }`}
                id={`asset-${asset}`}
              >
                {asset}
              </button>
            ))}
          </div>
        </section>

        {/* Bio */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">자기소개</h2>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={500}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors resize-none"
            placeholder="중개 경력, 전문 분야, 고객에게 전하고 싶은 메시지를 작성해주세요."
            id="profile-bio"
          />
          <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
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
  );
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
