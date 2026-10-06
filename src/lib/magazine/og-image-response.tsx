/**
 * 매거진 이미지 응답 오케스트레이터 (C-04)
 * `/api/og/magazine` 와 `/api/magazine/[brokerId]/[date]/image` 가 공유한다.
 *
 * 정책
 *  - 정확한 날짜의 발행본이 있으면 그 내용으로, 없으면 **중립 브랜드 이미지**(가짜 브로커/수치 없음).
 *  - 조회 오류 → 중립 이미지 + no-store + 서버 로그 (실패를 숨기지 않되 이미지는 항상 반환).
 *  - Cache-Control: 발행본 `max-age=300, s-maxage=3600, swr=86400` (함정 #14; 1년 immutable 금지).
 *  - 크기 고정: og 1200×630 / story 1080×1920 / card 1080×1080.
 */
import React from 'react';
import { ImageResponse } from 'next/og';
import { createModuleLogger } from '@/lib/logger';
import {
  IMAGE_CACHE_CONTROL,
  IMAGE_SIZES,
  NEUTRAL_CACHE_CONTROL,
  NO_STORE_CACHE_CONTROL,
  loadImageModel,
  type ImageFormat,
  type ImageModel,
} from '@/lib/magazine/og-image-data';
import { loadOgFonts } from '@/lib/magazine/og-fonts';
import {
  CardImage,
  NeutralImage,
  OgImage,
  StoryImage,
  makeTranslate,
} from '@/lib/magazine/og-image-render';

const log = createModuleLogger('magazine-image');

export type ModelLoader = (brokerId: string, date: string) => Promise<ImageModel | null>;

const defaultLoader: ModelLoader = async (brokerId, date) => {
  const { createServiceClient } = await import('@/lib/supabase/service');
  return loadImageModel(createServiceClient(), brokerId, date);
};

async function respond(
  element: React.ReactElement,
  format: ImageFormat,
  cacheControl: string,
  status = 200,
): Promise<Response> {
  const size = IMAGE_SIZES[format];
  const { fonts } = await loadOgFonts();
  return new ImageResponse(element, {
    width: size.width,
    height: size.height,
    status,
    ...(fonts.length ? { fonts } : {}),
    headers: { 'Cache-Control': cacheControl },
  });
}

/** 중립 브랜드 이미지 (숫자·전화·가짜 지표 없음) */
export function renderNeutralImage(
  format: ImageFormat,
  opts: { cacheControl?: string; status?: number } = {},
): Promise<Response> {
  const size = IMAGE_SIZES[format];
  return respond(
    <NeutralImage width={size.width} height={size.height} />,
    format,
    opts.cacheControl ?? NEUTRAL_CACHE_CONTROL,
    opts.status ?? 200,
  );
}

export async function renderMagazineImage(opts: {
  format: ImageFormat;
  brokerId: string;
  date: string;
  /** 테스트/교체용 주입점 (기본: 서비스 클라이언트로 공개 뷰어와 같은 소스 조회) */
  loadModel?: ModelLoader;
}): Promise<Response> {
  const { format, brokerId, date } = opts;

  let model: ImageModel | null;
  try {
    model = await (opts.loadModel ?? defaultLoader)(brokerId, date);
  } catch (err) {
    log.error('[MagazineImage] 발행본 조회 실패 — 중립 이미지로 대체', err);
    return renderNeutralImage(format, { cacheControl: NO_STORE_CACHE_CONTROL });
  }

  if (!model) return renderNeutralImage(format);

  const { hasKorean, glyphs } = await loadOgFonts();
  const t = makeTranslate(hasKorean, glyphs);
  const { width, height } = IMAGE_SIZES[format];
  const props = { m: model, t, width, height };
  const element =
    format === 'story' ? (
      <StoryImage {...props} />
    ) : format === 'card' ? (
      <CardImage {...props} />
    ) : (
      <OgImage {...props} />
    );
  return respond(element, format, IMAGE_CACHE_CONTROL);
}
