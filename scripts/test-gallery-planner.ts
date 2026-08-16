/**
 * @file test-gallery-planner.ts
 * @description 갤러리 플래너 v0.6.0 1~12장 사진 분할 및 레이아웃 검증 스크립트
 */

import { planGallerySlides } from '../src/domain/building/mobile-im/pptx/gallery-planner';
import { resolvePhotos } from '../src/domain/building/mobile-im/photo-url-transformer';
import type { PhotoMeta, MobileIMSupplementalInput } from '../src/domain/building/mobile-im/types';

console.log('================================================================================');
console.log('🌟 갤러리 플래너 v0.6.0 종합 검증 테스트');
console.log('================================================================================\n');

// ── Case 1: 사진 0장 ──
const case1 = planGallerySlides([], 'income');
console.log(`[Case 1] 사진 0장: 슬라이드 ${case1.length}개 생성 (기대: 0개) -> ${case1.length === 0 ? '✅ PASS' : '❌ FAIL'}`);

// ── Case 2: 사진 1장 (외관) ──
const case2Photos: PhotoMeta[] = [
  { url: 'https://example.com/front.jpg', category: 'exterior', caption: '건물 전경', isHero: true },
];
const case2 = planGallerySlides(case2Photos, 'income');
console.log(`[Case 2] 사진 1장: 슬라이드 ${case2.length}개 | 레이아웃: ${case2[0]?.layout} | Kicker: ${case2[0]?.kicker} -> ${case2.length === 1 && case2[0]?.layout === 'FULL_WIDE' ? '✅ PASS' : '❌ FAIL'}`);

// ── Case 3: 사진 2장 (외관 + 로비) ──
const case3Photos: PhotoMeta[] = [
  { url: 'https://example.com/front.jpg', category: 'exterior', caption: '건물 전경' },
  { url: 'https://example.com/lobby.jpg', category: 'lobby', caption: '1층 로비' },
];
const case3 = planGallerySlides(case3Photos, 'income');
console.log(`[Case 3] 사진 2장: 슬라이드 ${case3.length}개 | 레이아웃: ${case3[0]?.layout} -> ${case3.length === 1 ? '✅ PASS' : '❌ FAIL'}`);

// ── Case 4: 사진 4장 (외관 2장 + 실내 2장) ──
const case4Photos: PhotoMeta[] = [
  { url: 'https://example.com/ext1.jpg', category: 'exterior', caption: '전면 외관' },
  { url: 'https://example.com/ext2.jpg', category: 'entrance', caption: '주 출입구' },
  { url: 'https://example.com/int1.jpg', category: 'interior', caption: '3층 오피스 전용부' },
  { url: 'https://example.com/int2.jpg', category: 'tenant_space', caption: '4층 병원 인테리어' },
];
const case4 = planGallerySlides(case4Photos, 'income');
console.log(`[Case 4] 사진 4장(2그룹): 슬라이드 ${case4.length}개 (기대: 2개)`);
case4.forEach((s, idx) => {
  console.log(`  └ Slide ${idx + 1}: ${s.kicker} | ${s.title} | ${s.photos.length}장 | ${s.layout}`);
});

// ── Case 5: 사진 8장 (외관 2 + 로비 2 + 내부 2 + 주차/옥상 2) ──
const case5Photos: PhotoMeta[] = [
  { url: 'https://example.com/ext1.jpg', category: 'exterior', caption: '전면 외관' },
  { url: 'https://example.com/ext2.jpg', category: 'surroundings', caption: '접면 도로' },
  { url: 'https://example.com/lobby1.jpg', category: 'lobby', caption: '1층 로비 안내데스크' },
  { url: 'https://example.com/lobby2.jpg', category: 'elevator', caption: '승강기홀' },
  { url: 'https://example.com/int1.jpg', category: 'interior', caption: '기준층 업무공간' },
  { url: 'https://example.com/int2.jpg', category: 'floor_plan', caption: '기준층 도면' },
  { url: 'https://example.com/park.jpg', category: 'parking', caption: '지하 자주식 주차장' },
  { url: 'https://example.com/roof.jpg', category: 'rooftop', caption: '옥상 정원 테라스' },
];
const case5 = planGallerySlides(case5Photos, 'income');
console.log(`\n[Case 5] 사진 8장(4그룹): 슬라이드 ${case5.length}개`);
case5.forEach((s, idx) => {
  console.log(`  └ Slide ${idx + 1}: ${s.kicker} | ${s.title} | ${s.photos.length}장 | ${s.layout}`);
});

// ── Case 6: 사진 12장 풀세트 (development 포스처) ──
const case6Photos: PhotoMeta[] = [
  { url: 'https://example.com/ext1.jpg', category: 'exterior', caption: '사업부지 전경' },
  { url: 'https://example.com/ext2.jpg', category: 'aerial', caption: '항공 드론뷰' },
  { url: 'https://example.com/ext3.jpg', category: 'surroundings', caption: '대로변 상권 현황' },
  { url: 'https://example.com/fac1.jpg', category: 'parking', caption: '부지 내 주차 진입로' },
  { url: 'https://example.com/fac2.jpg', category: 'mechanical', caption: '인입 설비 현황' },
  { url: 'https://example.com/fac3.jpg', category: 'storage', caption: '현존 지상 창고' },
  { url: 'https://example.com/int1.jpg', category: 'interior', caption: '지상 1층 철거 예정 내부' },
  { url: 'https://example.com/int2.jpg', category: 'floor_plan', caption: '신축 가설계안' },
  { url: 'https://example.com/int3.jpg', category: 'tenant_space', caption: '명도 완료 공간' },
  { url: 'https://example.com/com1.jpg', category: 'lobby', caption: '기존 로비' },
  { url: 'https://example.com/com2.jpg', category: 'corridor', caption: '기존 복도' },
  { url: 'https://example.com/com3.jpg', category: 'elevator', caption: '기존 승강기' },
];
const case6 = planGallerySlides(case6Photos, 'development');
console.log(`\n[Case 6] 사진 12장(development 포스처): 슬라이드 ${case6.length}개 (최대 4슬라이드)`);
case6.forEach((s, idx) => {
  console.log(`  └ Slide ${idx + 1}: ${s.kicker} | ${s.title} | ${s.photos.length}장 | ${s.layout}`);
});

// ── Case 7: 하위 호환 폴백 (v1 photo_urls + captions -> resolvePhotos) ──
const legacyInput: MobileIMSupplementalInput = {
  photo_urls: [
    'https://example.com/facade_exterior.jpg',
    'https://example.com/building_lobby.jpg',
    'https://example.com/parking_lot.jpg',
  ],
  photo_captions: {
    0: '수려한 외관',
    1: '고급 대리석 로비',
    2: '넓은 자주식 주차장',
  },
};
const resolved = resolvePhotos(legacyInput);
const case7 = planGallerySlides(resolved, 'owner_occupied');
console.log(`\n[Case 7] 레거시 v1 입력 폴백: 사진 ${resolved.length}장 -> 슬라이드 ${case7.length}개`);
case7.forEach((s, idx) => {
  console.log(`  └ Slide ${idx + 1}: ${s.kicker} | ${s.title} | ${s.photos.length}장 | ${s.layout}`);
});

console.log('\n================================================================================');
console.log('🎯 모든 갤러리 플래너 테스트 시나리오 검증 완료!');
console.log('================================================================================');
