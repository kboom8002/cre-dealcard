/**
 * Shock & Awe Onboarding v2 — TypeScript Type Definitions
 */

import type { Vibe7D, VtiMeta } from '@/lib/vibe/vibe-vector';
import type { CompositeScores } from '@/lib/vibe/vibe-complement';

// ── Core Enum Types ──────────────────────────────────────────────────────────

export type UserRole = 'expert' | 'owner';

export type OnboardingStage =
  | 'role_select'
  | 'photo_upload'
  | 'analyzing'
  | 'reveal'
  | 'login'
  | 'profile_complete'
  | 'radar'
  | 'dealcard'
  | 'agora'
  | 'complete';

export type ExpertSpecialty =
  | 'small_building'    // 꼬마빌딩 매매
  | 'office_lease'      // 오피스 임대
  | 'retail'            // 상가 매매/임대
  | 'industrial'        // 지산/물류
  | 'attorney'          // 변호사
  | 'tax_accountant'    // 세무사/회계사
  | 'legal_scrivener'   // 법무사
  | 'other';

export type Region =
  | 'seongsu_seongdong'  // 성수/성동
  | 'gangnam_seocho'     // 강남/서초
  | 'yeouido_mapo'       // 여의도/마포
  | 'cbd'                // CBD 광화문/종로
  | 'pangyo'             // 판교/분당
  | 'other';

// ── Vibe Analysis Result ─────────────────────────────────────────────────────

export interface VibeAnalysisResult {
  photoVibe: Vibe7D;
  complementVibe: Vibe7D;
  vtiResult: { meta: VtiMeta; confidence: number };
  matchedTemplateId: string;
  beforeScores: { trust: number; valence: number };
  afterScores: CompositeScores;
  description: string;
}

// ── Main Onboarding Data Shape ───────────────────────────────────────────────

export interface OnboardingData {
  role: UserRole | null;
  photoFile: File | null;
  photoPreviewUrl: string | null;
  photoUploadedUrl: string | null;
  vibeResult: VibeAnalysisResult | null;
  userName: string | null;
  userPhone: string | null;
  specialty: ExpertSpecialty | null;
  region: Region | null;
  radarAddress: string | null;
  firstDealCardId: string | null;
  sessionToken: string | null;
}

// ── Display Labels ───────────────────────────────────────────────────────────

export const SPECIALTY_LABELS: Record<ExpertSpecialty, string> = {
  small_building: '꼬마빌딩 매매',
  office_lease: '오피스 임대',
  retail: '상가 매매/임대',
  industrial: '지산/물류',
  attorney: '변호사',
  tax_accountant: '세무사/회계사',
  legal_scrivener: '법무사',
  other: '기타',
};

export const REGION_LABELS: Record<Region, string> = {
  seongsu_seongdong: '성수/성동',
  gangnam_seocho: '강남/서초',
  yeouido_mapo: '여의도/마포',
  cbd: 'CBD 광화문/종로',
  pangyo: '판교/분당',
  other: '기타',
};

export const STAGE_ORDER: OnboardingStage[] = [
  'role_select',
  'photo_upload',
  'analyzing',
  'reveal',
  'login',
  'profile_complete',
  'radar',
  'dealcard',
  'agora',
  'complete',
];
