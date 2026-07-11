// src/domain/building/mobile-im/photo-url-transformer.ts
// 브로커가 입력한 photo URL 배열을 갤러리용 typed photos로 변환

/** 사진 타입 */
export type PhotoType =
  | 'exterior' | 'aerial' | 'interior' | 'lobby' | 'floor_plan' | 'map'
  | 'rooftop' | 'parking' | 'entrance' | 'corridor' | 'mechanical'
  | 'signage' | 'surroundings' | 'tenant_space';

export interface TransformedPhoto {
  url: string;
  type: PhotoType;
  label: string;
  caption?: string;
  order?: number;
}

/** URL/파일명 패턴으로 사진 타입 자동 추론 */
const TYPE_PATTERNS: Array<[RegExp, PhotoType, string]> = [
  [/외관|exterior|facade|front/i,      'exterior',      '건물 외관'],
  [/항공|aerial|drone|bird/i,          'aerial',        '항공뷰'],
  [/로비|lobby|entrance.*hall/i,       'lobby',         '로비'],
  [/입구|entrance|gate/i,              'entrance',      '건물 입구'],
  [/주차|parking|garage/i,             'parking',       '주차장'],
  [/옥상|rooftop|roof/i,               'rooftop',       '옥상'],
  [/복도|corridor|hallway/i,           'corridor',      '복도'],
  [/기계|mechanical|electric|설비/i,   'mechanical',    '기계실/설비'],
  [/간판|signage|sign/i,               'signage',       '간판/사인'],
  [/주변|surround|street|환경/i,       'surroundings',  '주변 환경'],
  [/도면|floor.*plan|blueprint/i,      'floor_plan',    '도면'],
  [/임차|tenant|office.*room/i,        'tenant_space',  '임차 공간'],
  [/내부|interior|inside/i,            'interior',      '건물 내부'],
];

/** 기본 할당 순서 (패턴 미매칭 시) */
const DEFAULT_SEQUENCE: Array<[PhotoType, string]> = [
  ['exterior',     '건물 외관'],
  ['interior',     '건물 내부 1'],
  ['interior',     '건물 내부 2'],
  ['lobby',        '로비/공용'],
  ['parking',      '주차장'],
  ['rooftop',      '옥상/전경'],
  ['entrance',     '건물 입구'],
  ['corridor',     '복도/계단'],
  ['surroundings', '주변 환경'],
  ['mechanical',   '설비'],
  ['signage',      '간판'],
  ['tenant_space', '임차 공간'],
];

/**
 * 브로커가 입력한 URL 배열을 갤러리용 typed photos로 변환합니다.
 * @param urls - 사진 URL 배열 (최대 12장까지 처리)
 * @param captions - 인덱스별 캡션 맵 (선택)
 * @returns TransformedPhoto 배열
 */
export function transformPhotoUrls(
  urls: string[],
  captions?: Record<number, string>,
): TransformedPhoto[] {
  return urls.slice(0, 12).map((url, i) => {
    // URL 경로에서 파일명 추출
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
    const matched = TYPE_PATTERNS.find(([regex]) => regex.test(filename) || regex.test(url));
    const type = matched?.[1] ?? DEFAULT_SEQUENCE[i]?.[0] ?? 'interior';
    const label = matched?.[2] ?? DEFAULT_SEQUENCE[i]?.[1] ?? `건물 사진 ${i + 1}`;

    return {
      url,
      type,
      label,
      caption: captions?.[i],
      order: i,
    };
  });
}
