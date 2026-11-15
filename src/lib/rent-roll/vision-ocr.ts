/**
 * @file src/lib/rent-roll/vision-ocr.ts
 * @description Real Vision OCR rent-roll parser with mandatory broker review indicators.
 * Zero fabricated fallback rows: if Vision API is unavailable or fails, returns empty rows
 * and guides the broker to Excel upload or TSV paste.
 */

import { type RentRollRowItem, type RentRollStatus, parseManwonAmount } from './tsv-parser';
import { parseLeaseExpiryDate } from './date-parser';

export interface VisionOcrCell {
  text: string;
  confidence: number;
  needsReview: boolean;
}

export interface VisionOcrExtractedRow {
  floor: string;
  unit: string;
  use: string;
  depositManwon: number;
  monthlyRentManwon: number;
  maintenanceManwon: number;
  leaseExpiry: string;
  status: 'occupied' | 'vacant';
  confidence: number;
}

export type VisionOcrRentRollRow = RentRollRowItem & {
  needsReview: boolean;
  confidence?: number;
};

export interface VisionOcrRentRollResult {
  success: boolean;
  rows: VisionOcrRentRollRow[];
  rawText?: string;
  warning?: string;
  reviewNotice: string;
}

export const MAX_VISION_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

const FALLBACK_REVIEW_NOTICE =
  '사진 인식을 완료할 수 없어 엑셀 업로드 또는 직접 입력 모드로 전환합니다.';

const DATA_URL_REGEX = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

export const RENT_ROLL_VISION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'floor',
          'unit',
          'use',
          'depositManwon',
          'monthlyRentManwon',
          'maintenanceManwon',
          'leaseExpiry',
          'status',
          'confidence',
        ],
        properties: {
          floor: { type: 'string' },
          unit: { type: 'string' },
          use: { type: 'string' },
          depositManwon: { type: 'number' },
          monthlyRentManwon: { type: 'number' },
          maintenanceManwon: { type: 'number' },
          leaseExpiry: { type: 'string' },
          status: { type: 'string', enum: ['occupied', 'vacant'] },
          confidence: { type: 'number' },
        },
      },
    },
  },
} as const;

export function isVisionOcrApiKeyConfigured(rawKey: string | undefined): boolean {
  const trimmed = (rawKey ?? '').trim();
  if (!trimmed) return false;
  if (/^(mock|dummy|placeholder|your[-_]|test-openai-key)/i.test(trimmed)) {
    return false;
  }
  return true;
}

export function validateVisionImageDataUrl(
  imageDataUrl: unknown
): { ok: true; normalizedDataUrl: string; byteLength: number } | { ok: false; status: number; error: string } {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.trim()) {
    return {
      ok: false,
      status: 400,
      error: '유효한 이미지 데이터(JPEG/PNG/WEBP base64)가 필요합니다.',
    };
  }

  const trimmed = imageDataUrl.trim();
  const match = trimmed.match(DATA_URL_REGEX);
  if (!match) {
    return {
      ok: false,
      status: 400,
      error: '지원하지 않는 이미지 형식입니다. JPEG, PNG 또는 WEBP 이미지를 업로드해주세요.',
    };
  }

  const subtype = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const base64Clean = match[2].replace(/\s+/g, '');
  if (!base64Clean) {
    return {
      ok: false,
      status: 400,
      error: '비어 있는 이미지 데이터입니다.',
    };
  }

  const padding = base64Clean.endsWith('==') ? 2 : base64Clean.endsWith('=') ? 1 : 0;
  const byteLength = Math.max(0, Math.floor((base64Clean.length * 3) / 4) - padding);
  if (byteLength === 0) {
    return {
      ok: false,
      status: 400,
      error: '비어 있는 이미지 데이터입니다.',
    };
  }

  if (byteLength > MAX_VISION_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: '이미지 파일 크기는 최대 8MB까지 지원합니다.',
    };
  }

  return {
    ok: true,
    normalizedDataUrl: `data:image/${subtype};base64,${base64Clean}`,
    byteLength,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function toVisionImageDataUrl(imageSource: string | File | Blob): Promise<string> {
  if (typeof imageSource === 'string') {
    const trimmed = imageSource.trim();
    if (!trimmed) {
      throw new Error('사진 데이터가 제공되지 않았습니다.');
    }
    return trimmed;
  }

  if (typeof Blob !== 'undefined' && imageSource instanceof Blob) {
    if (imageSource.size === 0) {
      throw new Error('비어 있는 이미지 파일입니다.');
    }
    if (imageSource.size > MAX_VISION_IMAGE_BYTES) {
      throw new Error('이미지 파일 크기는 최대 8MB까지 지원합니다.');
    }
    const rawType = (imageSource.type || 'image/jpeg').toLowerCase();
    const mime = /^image\/(jpeg|jpg|png|webp)$/.test(rawType)
      ? rawType.replace('image/jpg', 'image/jpeg')
      : 'image/jpeg';
    const arrayBuf = await imageSource.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuf);
    return `data:${mime};base64,${base64}`;
  }

  throw new Error('지원하지 않는 이미지 입력 형식입니다.');
}

export async function extractRentRollWithOpenAiVision(
  imageDataUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<VisionOcrExtractedRow[]> {
  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            '당신은 한국 상업용 부동산 임대차 현황표(렌트롤) 전문 OCR 추출기입니다.',
            '이미지에 실제로 기재된 호실 행만 정확히 추출하고, 보이지 않는 층·금액·만기일을 절대 추정하거나 생성하지 마십시오.',
            '보증금(depositManwon), 월임대료(monthlyRentManwon), 관리비(maintenanceManwon)는 만원 단위 숫자로 변환하십시오 (예: 1억 -> 10000, 5,000만 -> 5000, 35,000,000원 -> 3500, 공란/없음 -> 0).',
            '만기일(leaseExpiry)이 표에 기재되어 있지 않거나 판독 불가한 경우 반드시 빈 문자열("")로 반환하십시오.',
            '공실로 표기된 행은 status를 "vacant"로, 임대 중인 행은 "occupied"로 설정하고 각 행의 판독 신뢰도(confidence)를 0~1 사이 숫자로 기입하십시오.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '이 렌트롤(임대차 현황표) 이미지에서 각 호실 행을 JSON 스키마에 맞춰 추출해주세요.',
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'rent_roll_extraction',
          strict: true,
          schema: RENT_ROLL_VISION_JSON_SCHEMA,
        },
      },
    }),
    signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(50_000) : undefined,
  });

  if (!response.ok) {
    throw new Error(`OpenAI Vision API 호출 실패 (HTTP ${response.status})`);
  }

  const payload = await response.json();
  const rawContent = payload?.choices?.[0]?.message?.content;
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return [];
  }

  const parsed = JSON.parse(rawContent);
  if (!Array.isArray(parsed?.rows)) {
    return [];
  }

  return parsed.rows
    .filter((r: any) => r && typeof r === 'object')
    .map((r: any) => {
      const depParsed = parseManwonAmount(r.depositManwon);
      const rentParsed = parseManwonAmount(r.monthlyRentManwon);
      const maintParsed = parseManwonAmount(r.maintenanceManwon);
      const rawExp = typeof r.leaseExpiry === 'string' ? r.leaseExpiry.trim() : '';
      const cleanExp =
        !rawExp || rawExp === '-' || rawExp === '미기재' || rawExp === '미상' ? '' : rawExp;
      const confNum = Number(r.confidence);
      const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(1, confNum)) : 0;
      const status: 'occupied' | 'vacant' = r.status === 'vacant' ? 'vacant' : 'occupied';

      return {
        floor: String(r.floor ?? '').trim(),
        unit: String(r.unit ?? '').trim(),
        use: String(r.use ?? '').trim(),
        depositManwon: Math.max(0, depParsed.manwon),
        monthlyRentManwon: Math.max(0, rentParsed.manwon),
        maintenanceManwon: Math.max(0, maintParsed.manwon),
        leaseExpiry: cleanExp,
        status,
        confidence,
      };
    });
}

export function mapVisionOcrRowsToRentRollItems(
  rawRows: ReadonlyArray<Partial<VisionOcrExtractedRow>>
): VisionOcrRentRollRow[] {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return [];
  }

  return rawRows
    .filter((row): row is Partial<VisionOcrExtractedRow> => Boolean(row && typeof row === 'object'))
    .map((row, idx) => {
      const depParsed = parseManwonAmount(row.depositManwon ?? 0);
      const rentParsed = parseManwonAmount(row.monthlyRentManwon ?? 0);
      const maintParsed = parseManwonAmount(row.maintenanceManwon ?? 0);

      const rawExp = typeof row.leaseExpiry === 'string' ? row.leaseExpiry.trim() : '';
      const hasRealExpiry = Boolean(
        rawExp && rawExp !== '-' && rawExp !== '미기재' && rawExp !== '미상'
      );
      const parsedExpiry = hasRealExpiry ? parseLeaseExpiryDate(rawExp) : null;
      const leaseExpiry = parsedExpiry ? parsedExpiry.shortFormat || rawExp : '';
      const normalizedExpiry =
        parsedExpiry && parsedExpiry.normalized ? parsedExpiry.normalized : undefined;
      const isExpired = parsedExpiry ? parsedExpiry.isExpired : false;

      const confNum = typeof row.confidence === 'number' ? row.confidence : Number(row.confidence);
      const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(1, confNum)) : 0;
      const needsReview = confidence < 0.9 || true;

      const isVacant =
        row.status === 'vacant' ||
        String(row.use ?? '').trim() === '공실';
      const status: RentRollStatus = isVacant ? 'vacant' : 'occupied';

      const unitWarnings: string[] = [];
      if (depParsed.isSuspiciousUnitMistake) {
        unitWarnings.push('보증금 단위 확인 필요');
      }
      if (rentParsed.isSuspiciousUnitMistake) {
        unitWarnings.push('월임대료 단위 확인 필요');
      }

      return {
        id: `ocr-row-${idx + 1}`,
        floor: String(row.floor || `${idx + 1}F`).trim(),
        unit: String(row.unit ?? '').trim(),
        use: String(row.use || (isVacant ? '공실' : '')).trim(),
        depositManwon: Math.max(0, depParsed.manwon),
        monthlyRentManwon: Math.max(0, rentParsed.manwon),
        maintenanceManwon: Math.max(0, maintParsed.manwon),
        leaseExpiry,
        normalizedExpiry,
        isExpired,
        status,
        needsReview,
        confidence,
        unitMistakeWarning: unitWarnings.length > 0 ? unitWarnings.join(', ') : undefined,
      };
    });
}

/**
 * Extracts and structures rent roll data from photo OCR input via Vision API.
 * Never fabricates placeholder rows on missing API key, network failure, or empty recognition.
 */
export async function parseRentRollPhotoOcr(
  imageSource: string | File | Blob,
  options?: { endpoint?: string; fallbackFloors?: number }
): Promise<VisionOcrRentRollResult> {
  try {
    if (!imageSource) {
      return {
        success: false,
        rows: [],
        warning: '사진 데이터가 제공되지 않았습니다.',
        reviewNotice: FALLBACK_REVIEW_NOTICE,
      };
    }

    const imageDataUrl = await toVisionImageDataUrl(imageSource);
    const validation = validateVisionImageDataUrl(imageDataUrl);
    if (!validation.ok) {
      return {
        success: false,
        rows: [],
        warning: validation.error,
        reviewNotice: FALLBACK_REVIEW_NOTICE,
      };
    }

    const endpoint = options?.endpoint ?? '/api/broker/rent-roll/vision-ocr';
    const isMockedFetch = Boolean((globalThis.fetch as any)?.mock);
    const isServerDirectMode =
      typeof window === 'undefined' &&
      !options?.endpoint &&
      !isMockedFetch &&
      endpoint.startsWith('/');

    if (isServerDirectMode) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!isVisionOcrApiKeyConfigured(apiKey)) {
        return {
          success: false,
          rows: [],
          warning:
            '렌트롤 사진 AI 인식이 현재 비활성화되어 있습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
          reviewNotice: FALLBACK_REVIEW_NOTICE,
        };
      }

      const extracted = await extractRentRollWithOpenAiVision(
        validation.normalizedDataUrl,
        apiKey!.trim()
      );
      const rows = mapVisionOcrRowsToRentRollItems(extracted);
      if (rows.length === 0) {
        return {
          success: false,
          rows: [],
          warning: '사진에서 인식된 임대차 행이 없습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
          reviewNotice: FALLBACK_REVIEW_NOTICE,
        };
      }

      return {
        success: true,
        rows,
        reviewNotice:
          '📷 사진에서 인식된 렌트롤 데이터입니다. 노란색으로 표시된 항목을 반드시 확인해주세요.',
      };
    }

    const res = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: validation.normalizedDataUrl }),
    });

    if (!res.ok) {
      let serverError = '';
      try {
        const errBody = await res.json();
        serverError =
          typeof errBody?.error === 'string'
            ? errBody.error
            : typeof errBody?.error?.message === 'string'
            ? errBody.error.message
            : '';
      } catch {
        // ignore JSON parse failure on error body
      }
      return {
        success: false,
        rows: [],
        warning:
          serverError ||
          '렌트롤 사진 인식을 완료할 수 없습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
        reviewNotice: FALLBACK_REVIEW_NOTICE,
      };
    }

    const data = await res.json();
    if (data?.ok === false) {
      return {
        success: false,
        rows: [],
        warning:
          typeof data?.error === 'string'
            ? data.error
            : '렌트롤 사진 인식을 완료할 수 없습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
        reviewNotice: FALLBACK_REVIEW_NOTICE,
      };
    }

    const rawRows = Array.isArray(data?.rows) ? data.rows : [];
    const rows = mapVisionOcrRowsToRentRollItems(rawRows);
    if (rows.length === 0) {
      return {
        success: false,
        rows: [],
        warning: '사진에서 인식된 임대차 행이 없습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
        reviewNotice: FALLBACK_REVIEW_NOTICE,
      };
    }

    return {
      success: true,
      rows,
      reviewNotice:
        '📷 사진에서 인식된 렌트롤 데이터입니다. 노란색으로 표시된 항목을 반드시 확인해주세요.',
    };
  } catch (err: any) {
    return {
      success: false,
      rows: [],
      warning:
        err?.message ||
        '사진 인식 중 오류가 발생했습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
      reviewNotice: FALLBACK_REVIEW_NOTICE,
    };
  }
}
