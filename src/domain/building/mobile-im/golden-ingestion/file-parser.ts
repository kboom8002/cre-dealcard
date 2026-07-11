// src/domain/building/mobile-im/golden-ingestion/file-parser.ts
// PDF/PPTX 파일 파서 — IM 문서를 텍스트로 변환
// Dynamic import로 pdf-parse / jszip 번들링 이슈 방지

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ParsedDocument {
  rawText: string;
  pages: PageContent[];
  metadata: {
    fileName: string;
    fileType: 'pdf' | 'pptx';
    pageCount: number;
    extractedAt: string;
  };
}

export interface PageContent {
  pageNumber: number;
  text: string;
  hasTable: boolean;
  hasImage: boolean;
}

// ─── PDF Parser ──────────────────────────────────────────────────────────────

/**
 * PDF 파일을 파싱하여 페이지별 텍스트를 추출합니다.
 */
export async function parsePDF(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedDocument> {
  try {
    // pdf-parse uses `export =` (CJS) — dynamic import interop may place it on .default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('pdf-parse') as any;
    const pdfParse: (buf: Buffer, opts?: Record<string, unknown>) => Promise<{ numpages: number; text: string }> =
      mod.default ?? mod;

    const result = await pdfParse(buffer, {
      // 페이지별 텍스트 수집을 위한 커스텀 렌더
      pagerender: undefined,
    });

    // pdf-parse는 전체 텍스트만 제공하므로, 페이지 구분을 폼피드(\f) 기준으로 분리
    const pageTexts = result.text.split('\f').filter((t: string) => t.trim().length > 0);

    const pages: PageContent[] = pageTexts.map((text: string, idx: number) => ({
      pageNumber: idx + 1,
      text: text.trim(),
      hasTable: false, // PDF 텍스트만으로는 테이블 감지 제한적
      hasImage: false,
    }));

    return {
      rawText: result.text,
      pages,
      metadata: {
        fileName,
        fileType: 'pdf',
        pageCount: result.numpages || pages.length,
        extractedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    console.error(`[file-parser] PDF 파싱 실패 (${fileName}):`, err);
    return {
      rawText: '',
      pages: [],
      metadata: {
        fileName,
        fileType: 'pdf',
        pageCount: 0,
        extractedAt: new Date().toISOString(),
      },
    };
  }
}

// ─── PPTX Parser ─────────────────────────────────────────────────────────────

/**
 * PPTX 파일(ZIP 아카이브)을 파싱하여 슬라이드별 텍스트를 추출합니다.
 * XML에서 <a:t> 태그의 텍스트를 추출하고, <a:tbl> 태그로 테이블 여부를 판단합니다.
 */
export async function parsePPTX(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedDocument> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);

    // ppt/slides/slide*.xml 파일을 번호순으로 정렬
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/i)?.[1] || '0', 10);
        const numB = parseInt(b.match(/slide(\d+)/i)?.[1] || '0', 10);
        return numA - numB;
      });

    const pages: PageContent[] = [];
    const allTexts: string[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const file = zip.files[slideFiles[i]];
      const xml = await file.async('text');

      // <a:t>...</a:t> 태그에서 텍스트 추출
      const textMatches = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [];
      const texts = textMatches.map((m: string) =>
        m.replace(/<\/?a:t[^>]*>/g, '').trim(),
      );
      const slideText = texts.join(' ');

      // 테이블 감지: <a:tbl> 태그 존재 여부
      const hasTable = /<a:tbl[\s>]/i.test(xml);

      // 이미지 감지: <a:blip> 태그 존재 여부
      const hasImage = /<a:blip[\s>]/i.test(xml);

      pages.push({
        pageNumber: i + 1,
        text: slideText,
        hasTable,
        hasImage,
      });

      if (slideText) allTexts.push(slideText);
    }

    return {
      rawText: allTexts.join('\n\n'),
      pages,
      metadata: {
        fileName,
        fileType: 'pptx',
        pageCount: pages.length,
        extractedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    console.error(`[file-parser] PPTX 파싱 실패 (${fileName}):`, err);
    return {
      rawText: '',
      pages: [],
      metadata: {
        fileName,
        fileType: 'pptx',
        pageCount: 0,
        extractedAt: new Date().toISOString(),
      },
    };
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * 파일 확장자에 따라 적절한 파서를 호출합니다.
 * 지원 형식: .pdf, .pptx
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedDocument> {
  const ext = fileName.toLowerCase().split('.').pop();

  switch (ext) {
    case 'pdf':
      return parsePDF(buffer, fileName);
    case 'pptx':
      return parsePPTX(buffer, fileName);
    default:
      throw new Error(`[file-parser] 지원하지 않는 파일 형식: .${ext} (${fileName})`);
  }
}
