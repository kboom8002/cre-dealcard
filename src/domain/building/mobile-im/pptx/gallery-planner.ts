/**
 * @file gallery-planner.ts
 * @description 모바일 IM 1~12장 사진을 분석하여 1~4개의 최적 PPTX 갤러리 슬라이드 명세를 기획하는 엔진 (v0.6.0)
 */

import type { InvestmentPosture } from '@/domain/ontology';
import type { PhotoMeta } from '../types';
import {
  CATEGORY_TO_GROUP,
  GALLERY_GROUP_TITLES,
  type GalleryGroup,
  type PhotoCategory,
  PHOTO_CATEGORY_LABELS,
} from '../photo-url-transformer';

/** 갤러리 슬라이드 레이아웃 유형 */
export type GalleryLayoutType =
  | 'FULL_WIDE'                // 1장: 12.1" x 5.0" 대형 풀뷰
  | 'DUAL_LANDSCAPE'          // 2장: 5.9" x 4.8" 좌우 50:50 분할
  | 'DUAL_PORTRAIT'           // 2장 (세로형 중심): 5.9" x 4.8" 세로 정렬
  | 'ONE_LARGE_TWO_SMALL_H'   // 3장: 좌측 대형 (7.4") + 우측 상하 2소형 (4.4")
  | 'ONE_LARGE_TWO_SMALL_V'   // 3장: 상단 대형 + 하단 2소형
  | 'GRID_2X2';               // 4장: 2열 x 2행 균등 그리드 (각 5.9" x 2.4")

/** 개별 갤러리 슬라이드 명세 */
export interface GallerySlideSpec {
  slideIndex: number;          // 0, 1, 2, ...
  kicker: string;              // e.g. "Exterior & Context", "Gallery I"
  title: string;               // e.g. "건물 외관 및 입지 전경"
  group?: GalleryGroup;        // 주 대상 그룹 (G1~G4)
  layout: GalleryLayoutType;   // 레이아웃 타입
  photos: PhotoMeta[];         // 해당 슬라이드에 배치될 사진 목록 (최대 4장)
  dataKey: string;             // e.g. "gallery_0", "gallery_1"
}

/** 포스처별 갤러리 그룹 우선순위 정렬 맵 */
const POSTURE_GROUP_PRIORITY: Record<InvestmentPosture, GalleryGroup[]> = {
  // income: 임대/전용부(G3) 우선 -> 외관(G1) -> 공용(G2) -> 설비(G4)
  income:         ['G1_exterior', 'G3_leasable', 'G2_common', 'G4_facility'],
  // owner_occupied: 공용/로비(G2) & 사옥전용(G3) 중요 -> 외관(G1) -> 설비(G4)
  owner_occupied: ['G1_exterior', 'G2_common', 'G3_leasable', 'G4_facility'],
  // development: 외관/입지(G1) & 토지/설비(G4) 중요
  development:    ['G1_exterior', 'G4_facility', 'G3_leasable', 'G2_common'],
  // trading: 외관(G1) & 전용부(G3) 가치 판단 중요
  trading:        ['G1_exterior', 'G3_leasable', 'G2_common', 'G4_facility'],
  // operating: 전용/시설(G3) & 공용(G2) 중요
  operating:      ['G1_exterior', 'G3_leasable', 'G2_common', 'G4_facility'],
};

/** 로마 숫자 변환 */
function toRoman(num: number): string {
  const map: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
  return map[num] || String(num);
}

/** 슬라이드당 사진들에 대한 최적 레이아웃 결정 */
function determineLayout(photos: PhotoMeta[]): GalleryLayoutType {
  const count = photos.length;
  if (count <= 1) return 'FULL_WIDE';
  if (count === 2) {
    const hasPortrait = photos.some(p => (p.aspectRatio ?? 1.33) < 0.9);
    return hasPortrait ? 'DUAL_PORTRAIT' : 'DUAL_LANDSCAPE';
  }
  if (count === 3) {
    return 'ONE_LARGE_TWO_SMALL_H';
  }
  return 'GRID_2X2';
}

/**
 * 갤러리 플래너 본체:
 * PhotoMeta[]와 posture를 받아 1~4개의 GallerySlideSpec[]을 생성합니다.
 */
export function planGallerySlides(
  photos: PhotoMeta[],
  posture: InvestmentPosture = 'income',
): GallerySlideSpec[] {
  // 1. 지도(map)는 입지 슬라이드용이므로 갤러리 슬라이드 대상에서 제외
  const validPhotos = photos.filter(p => p.category !== 'map' && p.url);

  if (validPhotos.length === 0) {
    return [];
  }

  // 2. 사진이 1~2장뿐인 경우: 단일 슬라이드 단순 분배
  if (validPhotos.length <= 2) {
    const layout = determineLayout(validPhotos);
    const firstGroup = CATEGORY_TO_GROUP[validPhotos[0].category];
    const info = (firstGroup !== 'special' && GALLERY_GROUP_TITLES[firstGroup])
      ? GALLERY_GROUP_TITLES[firstGroup]
      : { kicker: 'Gallery', title: '건물 사진 전경' };

    return [{
      slideIndex: 0,
      kicker: info.kicker,
      title: info.title,
      group: firstGroup !== 'special' ? firstGroup : undefined,
      layout,
      photos: validPhotos,
      dataKey: 'gallery_0',
    }];
  }

  // 3. 그룹별 분류 (G1~G4)
  const priority = POSTURE_GROUP_PRIORITY[posture] || POSTURE_GROUP_PRIORITY.income;
  const groupBuckets: Record<GalleryGroup, PhotoMeta[]> = {
    G1_exterior: [],
    G2_common:   [],
    G3_leasable: [],
    G4_facility: [],
  };

  validPhotos.forEach((p) => {
    const g = CATEGORY_TO_GROUP[p.category];
    if (g && g !== 'special') {
      groupBuckets[g].push(p);
    } else {
      // 카테고리 미지정이거나 special인 경우 기본 G3(실내) 또는 G1(외관)으로 할당
      groupBuckets.G3_leasable.push(p);
    }
  });

  // 4. 활성 그룹만 우선순위 순서대로 추출
  const activeGroups = priority
    .map(g => ({ group: g, photos: groupBuckets[g] }))
    .filter(item => item.photos.length > 0);

  // 5. 사진 분배 전략 결정:
  // 슬라이드당 최대 4장으로 제한하여 실사 품질 보장 (총 슬라이드 수 최대 4장)
  const slideBatches: Array<{
    group?: GalleryGroup;
    photos: PhotoMeta[];
    titleHint?: { kicker: string; title: string };
  }> = [];

  if (activeGroups.length === 1) {
    // 단일 그룹에 모든 사진이 몰려 있는 경우: 3~4장씩 균등 분할
    const all = activeGroups[0].photos;
    const g = activeGroups[0].group;
    const gTitle = GALLERY_GROUP_TITLES[g];

    if (all.length <= 4) {
      slideBatches.push({ group: g, photos: all, titleHint: gTitle });
    } else if (all.length <= 8) {
      const mid = Math.ceil(all.length / 2);
      slideBatches.push({ group: g, photos: all.slice(0, mid), titleHint: gTitle });
      slideBatches.push({ group: g, photos: all.slice(mid), titleHint: gTitle });
    } else {
      // 9~12장: 3 또는 4슬라이드 분할 (최대 4슬라이드)
      const numSlides = Math.min(4, Math.ceil(all.length / 3));
      const perSlide = Math.ceil(all.length / numSlides);
      for (let i = 0; i < numSlides; i++) {
        const chunk = all.slice(i * perSlide, (i + 1) * perSlide);
        if (chunk.length > 0) {
          slideBatches.push({ group: g, photos: chunk, titleHint: gTitle });
        }
      }
    }
  } else {
    // 다중 그룹: 그룹 단위를 존중하여 분할
    let currentBatch: PhotoMeta[] = [];
    let currentGroup: GalleryGroup | undefined = undefined;

    for (const item of activeGroups) {
      const gTitle = GALLERY_GROUP_TITLES[item.group];

      // 그룹 사진 수가 1~4장인 경우
      if (item.photos.length <= 4) {
        // 이전 배치와 병합할지, 독립 슬라이드로 둘지 판단
        // (현재 배치가 비어있거나, 합쳤을 때 4장 이하면 병합 가능)
        if (currentBatch.length === 0) {
          currentBatch = [...item.photos];
          currentGroup = item.group;
        } else if (currentBatch.length + item.photos.length <= 4) {
          currentBatch.push(...item.photos);
          // 다중 그룹 병합 시 그룹은 undefined로 처리
          currentGroup = undefined;
        } else {
          // 이전 배치 슬라이드로 확정
          slideBatches.push({
            group: currentGroup,
            photos: currentBatch,
            titleHint: currentGroup ? GALLERY_GROUP_TITLES[currentGroup] : undefined,
          });
          currentBatch = [...item.photos];
          currentGroup = item.group;
        }
      } else {
        // 한 그룹에 5장 이상 있는 경우: 이전 배치 비우고 해당 그룹을 2분할
        if (currentBatch.length > 0) {
          slideBatches.push({
            group: currentGroup,
            photos: currentBatch,
            titleHint: currentGroup ? GALLERY_GROUP_TITLES[currentGroup] : undefined,
          });
          currentBatch = [];
          currentGroup = undefined;
        }

        const mid = Math.ceil(item.photos.length / 2);
        slideBatches.push({ group: item.group, photos: item.photos.slice(0, mid), titleHint: gTitle });
        slideBatches.push({ group: item.group, photos: item.photos.slice(mid), titleHint: gTitle });
      }
    }

    // 잔여 배치 추가
    if (currentBatch.length > 0) {
      slideBatches.push({
        group: currentGroup,
        photos: currentBatch,
        titleHint: currentGroup ? GALLERY_GROUP_TITLES[currentGroup] : undefined,
      });
    }
  }

  // 6. 최대 4슬라이드로 안전 제한
  const finalBatches = slideBatches.slice(0, 4);
  const totalSlides = finalBatches.length;

  return finalBatches.map((batch, idx) => {
    const layout = determineLayout(batch.photos);
    const roman = totalSlides > 1 ? ` ${toRoman(idx + 1)}` : '';

    let kicker = `Gallery${roman}`;
    let title = batch.titleHint?.title || '건물 주요 전경';

    if (batch.group && GALLERY_GROUP_TITLES[batch.group]) {
      const gInfo = GALLERY_GROUP_TITLES[batch.group];
      kicker = totalSlides > 1 ? `Gallery${roman} · ${gInfo.kicker}` : gInfo.kicker;
      title = gInfo.title;
    }

    return {
      slideIndex: idx,
      kicker,
      title,
      group: batch.group,
      layout,
      photos: batch.photos,
      dataKey: `gallery_${idx}`,
    };
  });
}
