// src/domain/building/mobile-im/photo-url-transformer.ts
// 브로커가 입력한 photo URL 배열 / PhotoMeta를 갤러리용 typed photos로 변환 및 그룹핑

import type { PhotoCategory, GalleryGroup } from '@/domain/ontology';
import type { PhotoMeta, MobileIMSupplementalInput } from './types';

export type { PhotoCategory, GalleryGroup };

/** 레거시 호환용 PhotoType 별칭 */
export type PhotoType = PhotoCategory;

export interface TransformedPhoto {
  url: string;
  type: PhotoCategory;
  label: string;
  caption?: string;
  order?: number;
  isHero?: boolean;
  role?: 'cover' | 'exterior' | 'general';  // 사용자 지정 역할 (PPTX 슬라이드 배치용)
}

/** 사진 카테고리별 공식 한글 명칭 */
export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  exterior: '건물 외관',
  aerial: '항공/드론뷰',
  entrance: '주 출입구',
  surroundings: '주변 도로/환경',
  signage: '건물 간판/사인',
  lobby: '1층 로비',
  corridor: '복도/공용부',
  elevator: '엘리베이터홀',
  interior: '실내 공간',
  tenant_space: '임차 전용부',
  floor_plan: '층별 도면',
  parking: '주차장',
  rooftop: '옥상/테라스',
  mechanical: '기계/전기설비',
  storage: '창고/부대시설',
  map: '위치 지도',
  hero: '대표 사진',
};

/** 카테고리 -> 갤러리 그룹 매핑 (4대 그룹) */
export const CATEGORY_TO_GROUP: Record<PhotoCategory, GalleryGroup | 'special'> = {
  exterior: 'G1_exterior',
  aerial: 'G1_exterior',
  entrance: 'G1_exterior',
  surroundings: 'G1_exterior',
  signage: 'G1_exterior',

  lobby: 'G2_common',
  corridor: 'G2_common',
  elevator: 'G2_common',

  interior: 'G3_leasable',
  tenant_space: 'G3_leasable',
  floor_plan: 'G3_leasable',

  parking: 'G4_facility',
  rooftop: 'G4_facility',
  mechanical: 'G4_facility',
  storage: 'G4_facility',

  map: 'special',
  hero: 'special',
};

/** 갤러리 그룹별 슬라이드 서브타이틀 맵 */
export const GALLERY_GROUP_TITLES: Record<GalleryGroup, { kicker: string; title: string }> = {
  G1_exterior: { kicker: 'Exterior & Context', title: '건물 외관 및 입지 전경' },
  G2_common:   { kicker: 'Common & Lobby',     title: '로비 및 공용부 시설' },
  G3_leasable: { kicker: 'Leasable Space',     title: '층별 전용 임대공간' },
  G4_facility: { kicker: 'Facilities',         title: '주차·설비·부대시설' },
};

/** URL/파일명 패턴으로 사진 타입 자동 추론 */
const TYPE_PATTERNS: Array<[RegExp, PhotoCategory, string]> = [
  [/외관|exterior|facade|front/i,      'exterior',      '건물 외관'],
  [/항공|aerial|drone|bird/i,          'aerial',        '항공/드론뷰'],
  [/로비|lobby|entrance.*hall/i,       'lobby',         '1층 로비'],
  [/입구|entrance|gate/i,              'entrance',      '주 출입구'],
  [/주차|parking|garage/i,             'parking',       '주차장'],
  [/옥상|rooftop|roof|terrace/i,       'rooftop',       '옥상/테라스'],
  [/복도|corridor|hallway/i,           'corridor',      '복도/공용부'],
  [/승강기|엘리베이터|elevator/i,      'elevator',      '엘리베이터홀'],
  [/기계|mechanical|electric|설비/i,   'mechanical',    '기계/전기설비'],
  [/창고|storage/i,                    'storage',       '창고/부대시설'],
  [/간판|signage|sign/i,               'signage',       '건물 간판/사인'],
  [/주변|surround|street|환경|도로/i,  'surroundings',  '주변 도로/환경'],
  [/도면|floor.*plan|blueprint/i,      'floor_plan',    '층별 도면'],
  [/임차|tenant|office.*room/i,        'tenant_space',  '임차 전용부'],
  [/내부|interior|inside|실내/i,       'interior',      '실내 공간'],
];

/** 기본 할당 순서 (패턴 미매칭 시) */
const DEFAULT_SEQUENCE: Array<[PhotoCategory, string]> = [
  ['exterior',     '건물 외관'],
  ['interior',     '실내 공간 1'],
  ['interior',     '실내 공간 2'],
  ['lobby',        '로비/공용'],
  ['parking',      '주차장'],
  ['rooftop',      '옥상/테라스'],
  ['entrance',     '주 출입구'],
  ['corridor',     '복도/계단'],
  ['surroundings', '주변 도로/환경'],
  ['mechanical',   '기계/설비'],
  ['signage',      '건물 간판'],
  ['tenant_space', '임차 공간'],
];

/** 비표준 미디어(.wdp 등) 자동 여과 가드 */
export const isSupportedMedia = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return !cleanUrl.endsWith('.wdp');
};

/**
 * supplemental 입력에서 구조화된 PhotoMeta[]를 완전하게 도출합니다.
 * (v2 photos_v2 우선 -> v1 photo_urls 폴백)
 * D32 BL-1: buildingId가 주어지면, 사진의 buildingId와 일치하는 것만 반환합니다.
 */
export function resolvePhotos(supplemental?: MobileIMSupplementalInput | null, buildingId?: string): PhotoMeta[] {
  if (!supplemental) return [];

  let photos: PhotoMeta[] = [];

  // 1. v2 구조화 데이터(photos_v2) 또는 photos 배열이 있으면 우선 사용
  const rawPhotos = (Array.isArray(supplemental.photos_v2) && supplemental.photos_v2.length > 0)
    ? supplemental.photos_v2
    : (Array.isArray((supplemental as any).photos) && (supplemental as any).photos.length > 0)
      ? (supplemental as any).photos
      : null;

  if (rawPhotos) {
    const validRaw = rawPhotos.filter((p: any) => isSupportedMedia(typeof p === 'string' ? p : p?.url));
    photos = validRaw.slice(0, 12).map((p: any, idx: number) => ({
      ...p,
      isHero: p.isHero ?? (idx === 0),
      order: p.order ?? idx,
      caption: p.caption ?? supplemental.photo_captions?.[idx],
      role: p.role ?? (p.isHero ? 'cover' : undefined),
      buildingId: p.buildingId ?? p.building_id ?? buildingId,
    }));
  }
  // 2. v1 photo_urls + photo_captions 폴백
  else if (Array.isArray(supplemental.photo_urls) && supplemental.photo_urls.length > 0) {
    const validUrls = supplemental.photo_urls.filter(isSupportedMedia);
    photos = validUrls.slice(0, 12).map((url, i) => {
      const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
      const matched = TYPE_PATTERNS.find(([regex]) => regex.test(filename) || regex.test(url));
      const category = matched?.[1] ?? DEFAULT_SEQUENCE[i]?.[0] ?? 'interior';
      const caption = supplemental.photo_captions?.[i];

      return {
        url,
        category,
        caption,
        isHero: i === 0,
        autoClassified: true,
        order: i,
        buildingId,
      };
    });
  }

  // D33 BL-B: buildingId 필수 결속 — .buildingId가 없거나 불일치하면 제외
  // D32에서는 .buildingId가 없는 사진은 통과시켰으나, 이제 제외합니다.
  if (buildingId && photos.length > 0) {
    const ownPhotos = photos.filter(p => (p as any).buildingId === buildingId);
    if (ownPhotos.length < photos.length) {
      const excluded = photos.length - ownPhotos.length;
      console.warn(`[resolvePhotos] D33 BL-B: ${excluded}장 제외 — buildingId 미일치/미설정 (대상: ${buildingId})`);
    }
    // D33 BL-B: 사진 0장이면 빈 배열 반환 → 갤러리 면 미개방
    if (ownPhotos.length === 0) {
      console.warn(`[resolvePhotos] D33 BL-B: 유효 사진 0장 — 갤러리 면 미개방, 체크리스트 이관 필요`);
    }
    photos = ownPhotos;
  }

  // D33 BL-B: 캡션이 없거나 분류와 불일치 시, 분류 라벨로 캡션 자동 연결
  for (const p of photos) {
    if (p.category && (!p.caption || p.caption.trim().length === 0)) {
      p.caption = PHOTO_CATEGORY_LABELS[p.category as keyof typeof PHOTO_CATEGORY_LABELS] ?? p.category;
    }
  }

  return photos;
}

/**
 * 브로커가 입력한 URL 배열을 갤러리용 typed photos로 변환합니다. (하위 호환)
 */
export function transformPhotoUrls(
  urls: string[],
  captions?: Record<number, string>,
): TransformedPhoto[] {
  const validUrls = urls.filter(isSupportedMedia);
  return validUrls.slice(0, 12).map((url, i) => {
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
    const matched = TYPE_PATTERNS.find(([regex]) => regex.test(filename) || regex.test(url));
    const type = matched?.[1] ?? DEFAULT_SEQUENCE[i]?.[0] ?? 'interior';
    const label = PHOTO_CATEGORY_LABELS[type] || matched?.[2] || `건물 사진 ${i + 1}`;

    return {
      url,
      type,
      label,
      caption: captions?.[i],
      order: i,
      isHero: i === 0,
    };
  });
}
