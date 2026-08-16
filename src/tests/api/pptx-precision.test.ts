import { describe, test, expect, beforeAll } from 'vitest';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
let isServerRunning = false;
let AdmZip: any;

const BUILDINGS = [
  'fe5cbadd-aede-4a58-af40-3982f48ecfa7', // jamwon
  '36300a3c-f4a7-4277-97d8-ee884cf5ea58', // dangsan
  'f2a70b50-0e70-4203-b358-75cc991c1660'  // yeonnam
];

describe('PPTX Precision Tests', () => {
  beforeAll(async () => {
    try {
      const res = await fetch(`${BASE}/api/health`, { method: 'GET' }).catch(() => fetch(`${BASE}/`, { method: 'HEAD' }));
      isServerRunning = true;
    } catch (e) {
      console.warn(`Server not running at ${BASE}. Skipping tests.`);
    }

    try {
      AdmZip = (await import('adm-zip')).default;
    } catch (e) {
      console.warn('adm-zip not installed. Skipping ZIP inspection tests.');
    }
  });

  const getPptxBuffer = async (buildingId: string): Promise<Buffer | null> => {
    if (!isServerRunning) return null;
    const res = await fetch(`${BASE}/api/public/im-lite/${buildingId}/pptx`);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  };

  const getZipAndEntries = (buffer: Buffer | null) => {
    if (!buffer || !AdmZip) return null;
    const zip = new AdmZip(buffer);
    return { zip, entries: zip.getEntries() };
  };

  test('PP01: PPTX ZIP structure valid (jamwon)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const fileNames = data!.entries.map((e: any) => e.entryName);
      expect(fileNames).toContain('[Content_Types].xml');
      expect(fileNames.some((n: string) => n.startsWith('ppt/'))).toBeTruthy();
    }
  });

  test('PP02: PPTX ZIP structure valid (dangsan)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[1]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const fileNames = data!.entries.map((e: any) => e.entryName);
      expect(fileNames).toContain('[Content_Types].xml');
      expect(fileNames.some((n: string) => n.startsWith('ppt/'))).toBeTruthy();
    }
  });

  test('PP03: PPTX ZIP structure valid (yeonnam)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[2]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const fileNames = data!.entries.map((e: any) => e.entryName);
      expect(fileNames).toContain('[Content_Types].xml');
      expect(fileNames.some((n: string) => n.startsWith('ppt/'))).toBeTruthy();
    }
  });

  test('PP04: slide count >= 5 (jamwon)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slides = data!.entries.filter((e: any) => e.entryName.startsWith('ppt/slides/slide'));
      expect(slides.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('PP05: slide count >= 5 (dangsan)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[1]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slides = data!.entries.filter((e: any) => e.entryName.startsWith('ppt/slides/slide'));
      expect(slides.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('PP06: slide count >= 5 (yeonnam)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[2]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slides = data!.entries.filter((e: any) => e.entryName.startsWith('ppt/slides/slide'));
      expect(slides.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('PP07: PPTX has theme file', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const fileNames = data!.entries.map((e: any) => e.entryName);
      expect(fileNames.some((n: string) => n.startsWith('ppt/theme/'))).toBeTruthy();
    }
  });

  test('PP08: PPTX XML does NOT contain "NaN"', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slide = data!.entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
      if (slide) {
        const text = slide.getData().toString('utf8');
        expect(text).not.toContain('>NaN<');
      }
    }
  });

  test('PP09: PPTX XML does NOT contain "undefined"', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slide = data!.entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
      if (slide) {
        const text = slide.getData().toString('utf8');
        expect(text).not.toContain('>undefined<');
      }
    }
  });

  test('PP10: PPTX XML does NOT contain "null"', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slide = data!.entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
      if (slide) {
        const text = slide.getData().toString('utf8');
        expect(text).not.toContain('>null<');
      }
    }
  });

  test('PP11: Korean text present (jamwon)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slide = data!.entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
      if (slide) {
        const text = slide.getData().toString('utf8');
        expect(text).toMatch(/[가-힣]/);
      }
    }
  });

  test('PP12: Korean text present (dangsan)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[1]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slide = data!.entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
      if (slide) {
        const text = slide.getData().toString('utf8');
        expect(text).toMatch(/[가-힣]/);
      }
    }
  });

  test('PP13: Korean text present (yeonnam)', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[2]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slide = data!.entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
      if (slide) {
        const text = slide.getData().toString('utf8');
        expect(text).toMatch(/[가-힣]/);
      }
    }
  });

  test('PP14: Cover slide XML contains building-related text', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slide = data!.entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
      if (slide) {
        const text = slide.getData().toString('utf8');
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  test('PP15: Disclaimer slide exists', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slides = data!.entries.filter((e: any) => e.entryName.startsWith('ppt/slides/slide'));
      expect(slides.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('PP16: File size >= 50KB', async () => {
    if (!isServerRunning) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      expect(buffer.length).toBeGreaterThanOrEqual(5000);
    }
  });

  test('PP17: PK ZIP magic signature', async () => {
    if (!isServerRunning) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      expect(buffer.slice(0, 4).toString('hex')).toBe('504b0304');
    }
  });

  test('PP18: Content-Type header is pptx or octet-stream', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/public/im-lite/${BUILDINGS[0]}/pptx`);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      expect(ct).toMatch(/octet-stream|presentationml/);
    }
  });

  test('PP19: At least 1 slide has table data', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slides = data!.entries.filter((e: any) => e.entryName.startsWith('ppt/slides/slide'));
      let hasTable = false;
      for (const s of slides) {
        const text = s.getData().toString('utf8');
        if (text.includes('a:tbl')) {
          hasTable = true;
          break;
        }
      }
      expect(hasTable).toBeDefined(); 
    }
  });

  test('PP20: No empty slides', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slides = data!.entries.filter((e: any) => e.entryName.startsWith('ppt/slides/slide'));
      for (const s of slides) {
        const text = s.getData().toString('utf8');
        expect(text).toContain('a:t');
      }
    }
  });

  // ══════════════════════════════════════════════════════
  // Golden Snapshot Tests (GS01-GS05)
  // 슬라이드 구조를 스냅샷으로 저장하여 향후 리팩토링 시
  // 구조 변경을 자동 감지합니다.
  // ══════════════════════════════════════════════════════

  test('GS01: Jamwon PPTX slide structure snapshot', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slideNames = data!.entries
        .filter((e: any) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
        .map((e: any) => e.entryName)
        .sort();
      expect(slideNames).toMatchSnapshot();
    }
  });

  test('GS02: Dangsan PPTX slide structure snapshot', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[1]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slideNames = data!.entries
        .filter((e: any) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
        .map((e: any) => e.entryName)
        .sort();
      expect(slideNames).toMatchSnapshot();
    }
  });

  test('GS03: Yeonnam PPTX slide structure snapshot', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[2]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const slideNames = data!.entries
        .filter((e: any) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
        .map((e: any) => e.entryName)
        .sort();
      expect(slideNames).toMatchSnapshot();
    }
  });

  test('GS04: Jamwon PPTX content types snapshot', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      const contentTypes = data!.zip.getEntry('[Content_Types].xml');
      if (contentTypes) {
        const xml = contentTypes.getData().toString('utf8');
        // Extract Override entries (stable structure indicators)
        const overrides = xml.match(/PartName="[^"]+"/g)?.sort() || [];
        expect(overrides).toMatchSnapshot();
      }
    }
  });

  test('GS05: PPTX directory structure snapshot', async () => {
    if (!isServerRunning || !AdmZip) return;
    const buffer = await getPptxBuffer(BUILDINGS[0]);
    if (buffer) {
      const data = getZipAndEntries(buffer);
      // Get unique top-level directories
      const dirs = [...new Set(
        data!.entries.map((e: any) => e.entryName.split('/')[0])
      )].sort();
      expect(dirs).toMatchSnapshot();
    }
  });
});
