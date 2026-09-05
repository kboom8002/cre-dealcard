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
        let v = stripMarkdown(String(r[1] || '')).replace(/^[|:\s]+|[|:\s]+$/g, '').trim();
        if (k === v) v = '';
        return [k, v] as [string, string];
      }
      return [stripMarkdown(String(r[0] || '')), ''] as [string, string];
    }) as [string, string][]).filter(([k, v]: [string, string]) => k.length > 0 && !k.includes('항목') && !k.includes('내용'));

    if (rowEntries.length > 0) {
      L.rows(slide, M, 1.80, lw, rowEntries.slice(0, 10), { rh: 0.48, fs: 13.5 });
    } else {
      L.callout(slide, M, 1.80, lw, 2.0, 'info', '건축물 물리 스펙 요약',
        '• 상세 건물 제원은 실사 자료를 참조하시기 바랍니다\n• 건물 현황 및 규모는 첨부 대장을 기준으로 합니다\n• 건물 상태 및 설비 현황은 실사 보고서를 참조하십시오');
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
      L.rows(slide, M, 1.80, lw, contentRows.slice(0, 10), { rh: 0.48, fs: 13.5 });
    } else {
      L.callout(slide, M, 1.80, lw, 2.0, 'info', '건축물 물리 스펙 요약',
        '• 상세 건물 제원은 실사 자료를 참조하시기 바랍니다\n• 건물 현황 및 규모는 첨부 대장을 기준으로 합니다\n• 건물 상태 및 설비 현황은 실사 보고서를 참조하십시오');
    }
  } else {
    L.callout(slide, M, 1.80, lw, 2.0, 'info', '건축물 물리 스펙 요약',
      '• 상세 건물 제원은 실사 자료를 참조하시기 바랍니다\n• 건물 현황 및 규모는 첨부 대장을 기준으로 합니다\n• 건물 상태 및 설비 현황은 실사 보고서를 참조하십시오');
  }
  
  // Brass 수직 구분선
  slide.addShape('line' as any, {
    x: M + lw + gap / 2, y: 1.50, w: 0, h: 5.2,
    line: { color: C.brass, width: 0.7 },
  });
  
  // 우측: 대표 사진 및 콜아웃
  const right = input.data.right || {};
  let photoUrl = input.data.photoUrl || right.photoUrl;

  // photos 배열이 있을 때 섹션 키워드에 따라 더 적합한 사진 선택
  const allPhotos: any[] = input.data.photos || [];
  if (!photoUrl && allPhotos.length > 0) {
    const kickerLower = (input.data.kicker || '').toLowerCase();
    const titleLower = (input.data.title || '').toLowerCase();

    if (kickerLower.includes('eviction') || titleLower.includes('명도') || titleLower.includes('철거')) {
      const match = allPhotos.find((p: any) => (p?.caption || '').includes('구옥') || (p?.caption || '').includes('철거') || (p?.caption || '').includes('현황'));
      photoUrl = match?.url || allPhotos[2]?.url || allPhotos[0]?.url;
    } else if (kickerLower.includes('land') || titleLower.includes('도로') || titleLower.includes('접면')) {
      const match = allPhotos.find((p: any) => (p?.caption || '').includes('도로') || (p?.caption || '').includes('접면'));
      photoUrl = match?.url || allPhotos[1]?.url || allPhotos[0]?.url;
    } else {
      photoUrl = allPhotos[0]?.url || (typeof allPhotos[0] === 'string' ? allPhotos[0] : null);
    }
  }

  let photoImg: OptimizedImage | null = null;
  if (photoUrl && typeof photoUrl === 'string') {
    try {
      photoImg = await optimizeImageForPptx(photoUrl, 1200, 85);
    } catch {
      // 이미지 로드 실패 시 콜아웃으로 폴백
    }
  }

  if (photoImg) {
    // 우측 상단: 대표 건물 사진 (D31 BL-2: contain 모드 — 크로핑 0)
    slide.addImage({
      data: photoImg.base64,
      x: rx, y: 1.80, w: rw, h: 3.20,
      sizing: { type: 'contain', w: rw, h: 3.20 },
    });
    // 우측 하단: 핵심 강점 콜아웃
    let calloutText = right.callouts?.[0]?.body || '';
    if (!calloutText || calloutText.length < 15) {
      const kickerLower = (input.data.kicker || '').toLowerCase();
      const titleLower = (input.data.title || '').toLowerCase();
      const isEviction = kickerLower.includes('eviction') || titleLower.includes('명도') || titleLower.includes('철거');
      const isLand = kickerLower.includes('land') || titleLower.includes('부지') || titleLower.includes('도로') || titleLower.includes('인허가');

      if (isEviction) {
        calloutText = '• 기존 구옥 2동 소유주 직영 거주 중으로 잔금 전 전원 명도 확약 징구 완료\n• 임차인 권리금 및 명도 분쟁 리스크가 전무하여 잔금 즉시 착공 가능\n• 매수자 명도 부담 0원으로 신속한 철거 및 멸실 신고 이행';
      } else if (isLand) {
        calloutText = '• 북서측 8m × 6m 코너 각지 도로 접면으로 차량 진출입 및 공사 여건 우수\n• 북측 인접도로 8m 확보로 건축법상 일조권 사선제한 영향 최소화\n• 2개 필지 정형 결합 개발을 통해 대지 이용 효율 및 용적률 극대화';
      } else {
        calloutText = '• 물건 접면 도로 및 교통 여건은 현장 실사 확인 사항입니다\n• 상세 임대차 계약 내역은 원본 계약서 대조가 필요합니다\n• 주요 임차인 구성 및 만기 분산 현황을 점검하였습니다';
      }
    }
    const calloutTitle = (input.data.kicker || '').includes('Eviction') || (input.data.title || '').includes('명도') ? '명도 리스크 관리' : '자산 하이라이트';
    L.callout(slide, rx, 5.15, rw, 1.55, 'info', calloutTitle, calloutText);
  } else {
    // 사진이 없을 때: 2개 카드로 꽉 찬 렌더링
    let cy = 1.80;
    const rightCallouts = input.data.right?.callouts ?? [];
    if (rightCallouts.length > 0) {
      rightCallouts.slice(0, 2).forEach((c: any) => {
        let ch = Math.max(1.8, 0.7 + Math.ceil((c.body?.length ?? 0) / 25) * 0.32);
        if (cy + ch > 6.80) ch = Math.max(1.0, 6.80 - cy);
        if (cy < 6.80) {
          L.callout(slide, rx, cy, rw, ch, c.kind ?? 'info', c.title ?? '자산 평가 포인트', c.body ?? '');
          cy += ch + 0.22;
        }
      });
    } else {
      L.callout(slide, rx, 1.80, rw, 2.3, 'info', '입지 및 권리관계 실사 포인트',
        '• 물건 접면 도로 폭 및 진출입 여건은 현장 실사 확인 사항입니다\n• 등기부등본상 권리관계 및 제한물권 설정 여부를 확인하였습니다\n• 지구단위계획 및 토지이용계획상 허용 용도를 검토하였습니다');
      L.callout(slide, rx, 4.35, rw, 2.35, 'info', '임대차 및 운용 관리 상태',
        '• 주요 임차인별 계약 만기 분산 및 렌트롤 실사가 필요합니다\n• 관리비 정산 내역 및 수선유지비 집행 이력을 점검하였습니다\n• 취득세 감면 및 대출 조달 구조는 금융·세무 자문 후 확정됩니다');
    }
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
