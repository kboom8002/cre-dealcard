import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export const FORBIDDEN_PERSONA_PATTERN = /(?:70대|60대|50대|40대|30대|20대|MZ|초보|고액|고자산|법인|개인|VIP|기관|리츠|시행사|디벨로퍼)\s*(?:자산가|투자자|대표|고객|매수자|운용사|가족)/;
export const FORBIDDEN_LEXICON_PATTERN = /(?:캡레이트|(?<!실질\s*영업이익\s*\(?)GOP|네이밍\s*라이츠|브랜딩\s*라이츠)/;
export const FORBIDDEN_LEGAL_RISK_PATTERN = /(?:수익(?:률)?|원금|현금흐름|배당)\s*(?:보장|확정)|(?:보장|확정)\s*(?:수익(?:률)?|원금|현금흐름|배당)|(?:매수|투자)\s*(?:추천|강력\s*추천)|(?:대출|LTV)\s*(?:확정|승인)/;
export const FORBIDDEN_DEFECT_EXCUSE_PATTERN = /(?:필지별\s*내역\s*미확보|유효\s*(?:대지|용적률)을?\s*산출하지\s*않았습니다|비워\s*둡니다|없는\s*사진을?\s*다른\s*물건\s*사진으로\s*대체하지\s*않습니다|인근\s*비교사례는?\s*확보하지\s*않았습니다|비교사례\s*\d+건\s*이상을?\s*확보한\s*뒤|원장\s*합계\s*차이)/;
export const FORBIDDEN_PREACHY_PATTERN = /(?:표면\s*수익률만으로\s*매입\s*판단을?\s*하지\s*마십시오|오해를\s*만듭니다|시세\s*대비\s*고저를\s*말하지\s*않습니다|자료를?\s*받으면\s*무엇이\s*좋아지는가)/;
export const FORBIDDEN_INTERNAL_RULE_PATTERN = /(?:사진\s*운용\s*원칙|EXIF|승인\s*이력\s*없는\s*사진|본\s*면\s*승인\s*—?\s*\d+개\s*영역|자료\s*등급\s*:\s*현행\s*등급|자료\s*R\d+\s*×\s*공부\s*P\d+)/;

export interface PptxPhysicalInspectionResult {
  textOverflowCount: number;
  overlapMaxInches: number;
  bleedCount: number;
  minEffectiveDpi: number;
  maxCropRatio: number;
  placeholderResidueCount: number;
  fontMissingCount: number;
  slideCount: number;
  brokenImageCount: number;
  personaViolationCount: number;
  lexiconViolationCount: number;
  legalRiskViolationCount: number;
  defectExcuseViolationCount: number;
  preachyViolationCount: number;
  internalRuleViolationCount: number;
  isPass: boolean;
  issues: string[];
}

// 16:9 Standard dimensions in EMU (13.333333" x 7.5")
const CANVAS_W_EMU = 12192000;
const CANVAS_H_EMU = 6858000;
const BLEED_TOLERANCE_EMU = 10000; // ~0.01 inch rounding tolerance

function readPngDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50) return null; // not PNG signature
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

function readJpegDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4) return null;
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null; // not JPEG SOI
  let offset = 2;
  while (offset < buf.length - 8) {
    if (buf[offset] !== 0xFF) { offset++; continue; }
    const marker = buf[offset + 1];
    if (marker === 0xC0 || marker === 0xC2) {
      const h = buf.readUInt16BE(offset + 5);
      const w = buf.readUInt16BE(offset + 7);
      return { w, h };
    }
    const segLen = buf.readUInt16BE(offset + 2);
    offset += 2 + segLen;
  }
  return null;
}

function getImageDimensions(buf: Buffer): { w: number; h: number } | null {
  return readPngDimensions(buf) ?? readJpegDimensions(buf);
}

export async function inspectPptxBinary(pptxBuffer: Buffer): Promise<PptxPhysicalInspectionResult> {
  const issues: string[] = [];
  let textOverflowCount = 0;
  let overlapMaxInches = 0;
  let bleedCount = 0;
  let minEffectiveDpi = 300;
  let maxCropRatio = 0;
  let placeholderResidueCount = 0;
  let fontMissingCount = 0;
  let slideCount = 0;
  let brokenImageCount = 0;
  let personaViolationCount = 0;
  let lexiconViolationCount = 0;
  let legalRiskViolationCount = 0;
  let defectExcuseViolationCount = 0;
  let preachyViolationCount = 0;
  let internalRuleViolationCount = 0;

  try {
    const zip = await JSZip.loadAsync(pptxBuffer);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['p:sp', 'p:pic', 'p:graphicFrame', 'p:grpSp', 'Relationship'].includes(name),
    });

    // 1. Collect media files and verify image binary integrity
    const mediaFiles = new Map<string, Buffer>();
    for (const [path, file] of Object.entries(zip.files)) {
      if (path.startsWith('ppt/media/') && !file.dir) {
        const buf = await file.async('nodebuffer');
        mediaFiles.set(path, buf);

        if (buf.length === 0) {
          brokenImageCount += 1;
          issues.push(`${path}: 0바이트 손상된 이미지 파일`);
        } else {
          const dims = getImageDimensions(buf);
          if (!dims || dims.w <= 0 || dims.h <= 0) {
            brokenImageCount += 1;
            issues.push(`${path}: 이미지 헤더 손상 또는 지원되지 않는 포맷`);
          }
        }
      }
    }

    // 2. Map slide relationships (rId -> media path)
    const relFiles = Object.keys(zip.files).filter((f) =>
      /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(f)
    );
    const slideMediaMap = new Map<string, Map<string, string>>();

    for (const relPath of relFiles) {
      const slideRelXml = await zip.files[relPath].async('string');
      const relParsed = parser.parse(slideRelXml);
      const rels = relParsed?.['Relationships']?.['Relationship'] ?? [];
      const relArray = Array.isArray(rels) ? rels : [rels];
      const rMap = new Map<string, string>();

      const slideNumMatch = relPath.match(/slide(\d+)\.xml\.rels$/);
      const slideXmlPath = slideNumMatch ? `ppt/slides/slide${slideNumMatch[1]}.xml` : '';

      for (const rel of relArray) {
        const rId = rel?.['@_Id'];
        const target = rel?.['@_Target'];
        const type = rel?.['@_Type'] ?? '';
        if (type.includes('/image') && target) {
          const normalizedPath = target.startsWith('../') ? `ppt/${target.slice(3)}` : `ppt/slides/${target}`;
          rMap.set(rId, normalizedPath);
          if (!mediaFiles.has(normalizedPath) && !zip.files[normalizedPath]) {
            brokenImageCount += 1;
            issues.push(`${slideXmlPath}: 참조된 이미지 파일 부재 (${normalizedPath})`);
          }
        }
      }
      if (slideXmlPath) {
        slideMediaMap.set(slideXmlPath, rMap);
      }
    }

    // 3. Find and inspect all slides: ppt/slides/slide*.xml
    const slideFiles = Object.keys(zip.files).filter((f) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(f)
    );
    slideCount = slideFiles.length;

    let totalImagesEvaluated = 0;

    for (const slidePath of slideFiles) {
      const xmlContent = await zip.files[slidePath].async('string');

      // Check placeholder residues & corruption strings
      if (/\{\{[^{}]+\}\}/.test(xmlContent) || />NaN</.test(xmlContent) || />undefined</.test(xmlContent) || />null</.test(xmlContent) || />\[object Object\]</.test(xmlContent)) {
        placeholderResidueCount += 1;
        issues.push(`${slidePath}: 미치환 자리표시자({{...}}, NaN, undefined, null) 검출`);
      }

      // Check text for Rule 1 (Persona), Rule 2 (Lexicon), P0 Legal Safety
      const allTextMatches = xmlContent.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? [];
      const slideText = allTextMatches.map((m) => m.replace(/<[^>]+>/g, '').trim()).join(' ');

      if (FORBIDDEN_PERSONA_PATTERN.test(slideText)) {
        personaViolationCount += 1;
        const matched = slideText.match(FORBIDDEN_PERSONA_PATTERN)?.[0];
        issues.push(`${slidePath}: [Rule 1 페르소나 위반] "${matched}" 검출`);
      }

      if (FORBIDDEN_LEXICON_PATTERN.test(slideText)) {
        lexiconViolationCount += 1;
        const matched = slideText.match(FORBIDDEN_LEXICON_PATTERN)?.[0];
        issues.push(`${slidePath}: [Rule 2 CRE 표준용어 위반] "${matched}" 검출`);
      }

      if (FORBIDDEN_LEGAL_RISK_PATTERN.test(slideText)) {
        legalRiskViolationCount += 1;
        const matched = slideText.match(FORBIDDEN_LEGAL_RISK_PATTERN)?.[0];
        issues.push(`${slidePath}: [P0 법적 금지어 위반] "${matched}" 검출`);
      }

      if (FORBIDDEN_DEFECT_EXCUSE_PATTERN.test(slideText)) {
        defectExcuseViolationCount += 1;
        const matched = slideText.match(FORBIDDEN_DEFECT_EXCUSE_PATTERN)?.[0];
        issues.push(`${slidePath}: [G54 결손변명 위반] "${matched}" 검출`);
      }

      if (FORBIDDEN_PREACHY_PATTERN.test(slideText)) {
        preachyViolationCount += 1;
        const matched = slideText.match(FORBIDDEN_PREACHY_PATTERN)?.[0];
        issues.push(`${slidePath}: [G55 AI훈계조 위반] "${matched}" 검출`);
      }

      if (FORBIDDEN_INTERNAL_RULE_PATTERN.test(slideText)) {
        internalRuleViolationCount += 1;
        const matched = slideText.match(FORBIDDEN_INTERNAL_RULE_PATTERN)?.[0];
        issues.push(`${slidePath}: [G56 내부규칙노출 위반] "${matched}" 검출`);
      }

      // Parse slide XML structure
      const parsed = parser.parse(xmlContent);
      const spTree = parsed?.['p:sld']?.['p:cSld']?.['p:spTree'];
      if (!spTree) continue;

      const checkBounds = (xfrm: any, elType: string) => {
        if (!xfrm) return;
        const offX = parseInt(xfrm?.['a:off']?.['@_x'] ?? '0', 10);
        const offY = parseInt(xfrm?.['a:off']?.['@_y'] ?? '0', 10);
        const extCx = parseInt(xfrm?.['a:ext']?.['@_cx'] ?? '0', 10);
        const extCy = parseInt(xfrm?.['a:ext']?.['@_cy'] ?? '0', 10);

        if (extCx === 0 && extCy === 0) return;

        // Exact 16:9 bounds in EMU: width 12,192,000 EMU, height 6,858,000 EMU
        if (
          offX < -BLEED_TOLERANCE_EMU ||
          offY < -BLEED_TOLERANCE_EMU ||
          offX + extCx > CANVAS_W_EMU + BLEED_TOLERANCE_EMU ||
          offY + extCy > CANVAS_H_EMU + BLEED_TOLERANCE_EMU
        ) {
          bleedCount += 1;
          issues.push(`${slidePath}: ${elType} 지면(16:9) 이탈 객체 검출 (x:${offX}, y:${offY}, w:${extCx}, h:${extCy})`);
        }
      };

      // p:sp (shapes and text boxes)
      const shapes = spTree['p:sp'] ?? [];
      const shapeArray = Array.isArray(shapes) ? shapes : [shapes];
      for (const sp of shapeArray) {
        checkBounds(sp?.['p:spPr']?.['a:xfrm'], '도형/텍스트');
      }

      // p:pic (images)
      const pics = spTree['p:pic'] ?? [];
      const picArray = Array.isArray(pics) ? pics : [pics];
      for (const pic of picArray) {
        const xfrm = pic?.['p:spPr']?.['a:xfrm'];
        checkBounds(xfrm, '이미지');

        // Check DPI
        if (xfrm) {
          const extCx = parseInt(xfrm?.['a:ext']?.['@_cx'] ?? '0', 10);
          const rEmbed = pic?.['p:blipFill']?.['a:blip']?.['@_r:embed'];
          if (rEmbed && extCx > 0) {
            const relMap = slideMediaMap.get(slidePath);
            const mediaPath = relMap?.get(rEmbed);
            if (mediaPath && mediaFiles.has(mediaPath)) {
              const imgBuf = mediaFiles.get(mediaPath)!;
              const dims = getImageDimensions(imgBuf);
              if (dims && dims.w > 0) {
                const boxWInches = extCx / 914400;
                if (boxWInches > 0) {
                  const effectiveDpi = Math.round(dims.w / boxWInches);
                  if (totalImagesEvaluated === 0) {
                    minEffectiveDpi = effectiveDpi;
                  } else {
                    minEffectiveDpi = Math.min(minEffectiveDpi, effectiveDpi);
                  }
                  totalImagesEvaluated += 1;

                  if (effectiveDpi < 150) {
                    issues.push(`${slidePath}: 이미지(${mediaPath}) 실효 DPI 부족 (${effectiveDpi} DPI < 150 DPI)`);
                  }
                }
              }
            }
          }
        }
      }

      // p:graphicFrame (tables and charts)
      const gfs = spTree['p:graphicFrame'] ?? [];
      const gfArray = Array.isArray(gfs) ? gfs : [gfs];
      for (const gf of gfArray) {
        checkBounds(gf?.['p:xfrm'], '테이블/프레임');
      }

      // p:grpSp (groups)
      const grps = spTree['p:grpSp'] ?? [];
      const grpArray = Array.isArray(grps) ? grps : [grps];
      for (const grp of grpArray) {
        checkBounds(grp?.['p:grpSpPr']?.['a:xfrm'], '그룹도형');
      }
    }
  } catch (err: any) {
    issues.push(`ZIP_CORRUPT: PPTX 파일 파싱 실패 - ${err.message}`);
  }

  const isPass =
    issues.length === 0 &&
    placeholderResidueCount === 0 &&
    bleedCount === 0 &&
    brokenImageCount === 0 &&
    personaViolationCount === 0 &&
    lexiconViolationCount === 0 &&
    legalRiskViolationCount === 0 &&
    defectExcuseViolationCount === 0 &&
    preachyViolationCount === 0 &&
    internalRuleViolationCount === 0 &&
    minEffectiveDpi >= 150;

  return {
    textOverflowCount,
    overlapMaxInches,
    bleedCount,
    minEffectiveDpi,
    maxCropRatio,
    placeholderResidueCount,
    fontMissingCount,
    slideCount,
    brokenImageCount,
    personaViolationCount,
    lexiconViolationCount,
    legalRiskViolationCount,
    defectExcuseViolationCount,
    preachyViolationCount,
    internalRuleViolationCount,
    isPass,
    issues,
  };
}
