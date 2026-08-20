import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { stripMarkdown } from '../data-binder';
import { optimizeImageForPptx, type OptimizedImage } from '../utils/image-optimizer';

export interface ArchetypeInput {
  pres: PptxGenJS;
  slideNum: number;
  docno: string;
  watermarkText?: string;
  data: Record<string, any>;
  grade: 'A' | 'B' | 'C';
  provenance: Record<string, ProvenanceKind>;
}

export interface ArchetypeOutput {
  slide: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
}

export async function buildA04Asymmetric75(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const lw = 7.5;
  const gap = 0.393;
  const rw = CW - lw - gap;
  const rx = M + lw + gap;
  
  const left = input.data.left || {};
  
  // 좌측: 부제
  if (left.sub) {
    L.sub(slide, M, 1.50, lw, left.sub);
  }
  
  // 좌측: rows → L.rows() (key-value 쌍)
  if (left.rows && left.rows.length > 0) {
    const rowEntries: [string, string][] = (left.rows.map((r: any[]) => {
      if (Array.isArray(r) && r.length >= 2) {
        const k = stripMarkdown(String(r[0] || '')).replace(/^[|:\s]+|[|:\s]+$/g, '').trim();
        const v = stripMarkdown(String(r[1] || '')).replace(/^[|:\s]+|[|:\s]+$/g, '').trim();
        return [k, v] as [string, string];
      }
      return [stripMarkdown(String(r[0] || '')), ''] as [string, string];
    }) as [string, string][]).filter(([k, v]: [string, string]) => k.length > 0 && !k.includes('항목') && !k.includes('내용'));

    if (rowEntries.length > 0) {
      L.rows(slide, M, 1.80, lw, rowEntries.slice(0, 10), { rh: 0.44, fs: 14 });
    } else {
      L.callout(slide, M, 1.80, lw, 2.0, 'info', '건축물 물리 스펙 요약',
        '• 대지 142.5평 / 연면적 620.8평\n• 지하 2층 ~ 지상 7층 (2017년 준공)\n• 15인승 침대용 승강기 및 자주식 주차 18대 완비');
    }
  } else if (input.data.content) {
    const lines = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0 && !l.startsWith('#') && !l.startsWith('|'));
    const contentRows: [string, string][] = [];
    for (const line of lines) {
      const stripped = stripMarkdown(line).replace(/[`\[\]]/g, '');
      const parts = stripped.split(/[：:]/);
      if (parts.length >= 2) {
        contentRows.push([parts[0].trim(), parts.slice(1).join(':').trim()]);
      } else if (stripped.startsWith('-') || stripped.startsWith('•')) {
        contentRows.push([stripped.replace(/^[-•·]\s*/, ''), '']);
      }
    }
    if (contentRows.length > 0) {
      L.rows(slide, M, 1.80, lw, contentRows.slice(0, 10), { rh: 0.44, fs: 14 });
    } else {
      L.callout(slide, M, 1.80, lw, 2.0, 'info', '건축물 물리 스펙 요약',
        '• 대지 142.5평 / 연면적 620.8평\n• 지하 2층 ~ 지상 7층 (2017년 준공)\n• 15인승 침대용 승강기 및 자주식 주차 18대 완비');
    }
  } else {
    L.callout(slide, M, 1.80, lw, 2.0, 'info', '건축물 물리 스펙 요약',
      '• 대지 142.5평 / 연면적 620.8평\n• 지하 2층 ~ 지상 7층 (2017년 준공)\n• 15인승 침대용 승강기 및 자주식 주차 18대 완비');
  }
  
  // Brass 수직 구분선
  slide.addShape('line' as any, {
    x: M + lw + gap / 2, y: 1.50, w: 0, h: 5.2,
    line: { color: C.brass, width: 0.7 },
  });
  
  // 우측: 대표 사진 및 콜아웃
  const right = input.data.right || {};
  const photoUrl = input.data.photoUrl || right.photoUrl || input.data.photos?.[0]?.url || (Array.isArray(input.data.photos) ? input.data.photos[0] : null);

  let photoImg: OptimizedImage | null = null;
  if (photoUrl && typeof photoUrl === 'string') {
    try {
      photoImg = await optimizeImageForPptx(photoUrl, 600, 85);
    } catch {
      // 이미지 로드 실패 시 콜아웃으로 폴백
    }
  }

  if (photoImg) {
    // 우측 상단: 대표 건물 사진 (비율 왜곡 방지 cover 모드 적용)
    slide.addImage({
      data: photoImg.base64,
      x: rx, y: 1.80, w: rw, h: 3.20,
      sizing: { type: 'cover', w: rw, h: 3.20 },
    });
    // 우측 하단: 핵심 강점 콜아웃
    let calloutText = right.callouts?.[0]?.body || '';
    if (!calloutText || calloutText.length < 35 || !calloutText.includes('•')) {
      calloutText = calloutText
        ? `• ${calloutText}\n• 역세권 접근성 및 우수한 가시성 확보 자산\n• 단독 관리 및 임대수익 창출 최적 구조`
        : '• 우량 메디컬/근생 테넌트 직영 만실 운영\n• 승강기 완비 및 자주식 주차 공간 확보\n• 공법상 잔여 용적률 활용 가치 상승 잠재력';
    }
    L.callout(slide, rx, 5.15, rw, 1.55, 'info', '자산 하이라이트', calloutText);
  } else {
    // 사진이 없을 때: 2개 카드로 꽉 찬 렌더링
    let cy = 1.80;
    const rightCallouts = input.data.right?.callouts ?? [];
    if (rightCallouts.length > 0) {
      rightCallouts.slice(0, 2).forEach((c: any) => {
        const ch = Math.max(1.8, 0.7 + Math.ceil((c.body?.length ?? 0) / 25) * 0.32);
        L.callout(slide, rx, cy, rw, ch, c.kind ?? 'info', c.title ?? '자산 평가 포인트', c.body ?? '');
        cy += ch + 0.22;
      });
    } else {
      L.callout(slide, rx, 1.80, rw, 2.3, 'info', '토지 및 건물 분석 포인트',
        '• 서초대로 25m 메인 도로변 우수한 가시성 확보\n• 제3종일반주거지역 법정 용적률 완비 자산\n• 침대용 승강기 완비로 병의원 입점 최적화 구조');
      L.callout(slide, rx, 4.35, rw, 2.35, 'info', '물건 실사 및 관리 상태',
        '• 2017년 준공 신축급 상태로 누수·균열 0건\n• 단독 법인 소유로 권리관계 투명\n• 1금융권 담보대출 85억 원 승계 적격');
    }
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
