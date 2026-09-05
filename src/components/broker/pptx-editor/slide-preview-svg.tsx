import React, { useState, useEffect } from 'react';
import { PptxThemeTokens } from '@/domain/building/mobile-im/pptx/pptx-theme';
import type { PptxSlide } from '@/domain/building/pptx-studio/studio-service';

export interface BuildingPreviewData {
  title?: string;
  subtitle?: string;
  price?: string;
  yield?: string;
  area?: string;
  vacancy?: string;
  leadSentence?: string;
}

interface SlidePreviewSVGProps {
  tokens: PptxThemeTokens;
  width?: number; // CSS width in px, default 720
  buildingData?: BuildingPreviewData;
  activeSlide?: PptxSlide;
  onOverrideChange?: (overrides: Record<string, unknown>) => void;
  isInlineEditable?: boolean;
}

const W = 1280;
const H = 720;
const M = 60;
const CW = W - M * 2; // 1160

function pt(pptxPt: number): number {
  return pptxPt * 1.33;
}

function mapFont(pptxFont: string): string {
  const map: Record<string, string> = {
    '맑은 고딕': 'Malgun Gothic, 맑은 고딕, sans-serif',
    'Noto Sans KR': '"Noto Sans KR", sans-serif',
    'Noto Serif KR': '"Noto Serif KR", serif',
    '나눔스퀘어': '"나눔스퀘어", sans-serif',
    '나눔고딕': '"나눔고딕", sans-serif',
  };
  return map[pptxFont] ?? 'sans-serif';
}

function wrapText(
  text: string,
  maxChars: number,
  lineH: number,
  x: number,
  y: number,
  fill: string,
  fontSize: number,
  fontWeight: string,
  fontFamily: string,
  align: 'start' | 'middle' | 'end' = 'start'
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.map((line, i) => (
    <text
      key={i}
      x={x}
      y={y + i * lineH}
      fill={fill}
      fontSize={fontSize}
      fontWeight={fontWeight}
      fontFamily={fontFamily}
      textAnchor={align}
    >
      {line}
    </text>
  ));
}

const SAMPLE = {
  title: '서초대로 프라임 상업부동산',
  subtitle: '서초구 | 기준수익률 4.8% | 연면적 2,850평',
  kicker: 'INVESTMENT MEMORANDUM',
  price: '185억 대',
  yield: '4.8%',
  area: '2,850평',
  vacancy: '3.2%',
  metrics: [
    { label: '매각 희망가', value: '185억 대', unit: '' },
    { label: '수익률', value: '4.8%', unit: '' },
    { label: '연면적', value: '2,850평', unit: '' },
    { label: '공실률', value: '3.2%', unit: '' },
  ],
  leadSentence:
    '서초대로 제일선에 위치한 코너 상가, 안정적 임대수익을 기대할 수 있는 프라임 자산.',
};

type Archetype = 'A01' | 'A02' | 'A03' | 'A04' | 'A05' | 'A06' | 'A07' | 'A08' | 'A09' | 'A10' | 'A11' | 'A14';

export function SlidePreviewSVG({
  tokens,
  width = 720,
  buildingData,
  activeSlide,
  onOverrideChange,
  isInlineEditable = true,
}: SlidePreviewSVGProps) {
  const [activeArchetype, setActiveArchetype] = useState<Archetype>('A01');
  const [localOverrides, setLocalOverrides] = useState<Record<string, any>>({});
  const [showInlineEditor, setShowInlineEditor] = useState<boolean>(true);

  // Sync activeArchetype and overrides when activeSlide changes
  useEffect(() => {
    if (activeSlide) {
      const match = activeSlide.layoutType.match(/^A(0[1-9]|1[0-4])/);
      if (match) {
        setActiveArchetype(match[0] as Archetype);
      }
      setLocalOverrides(activeSlide.slideOverrides || {});
    }
  }, [activeSlide?.id, activeSlide?.layoutType]);

  const handleFieldChange = (field: string, value: any) => {
    const updated = {
      ...localOverrides,
      [field]: value,
    };
    setLocalOverrides(updated);
    if (onOverrideChange) {
      onOverrideChange(updated);
    }
  };

  const currentTitle = localOverrides.title || activeSlide?.title || buildingData?.title || SAMPLE.title;
  const currentSubtitle = localOverrides.subtitle || buildingData?.subtitle || SAMPLE.subtitle;
  const currentKicker = localOverrides.kicker || activeSlide?.kicker || SAMPLE.kicker;
  const currentPrice = localOverrides.price || buildingData?.price || SAMPLE.price;
  const currentYield = localOverrides.yield || buildingData?.yield || SAMPLE.yield;
  const currentArea = localOverrides.area || buildingData?.area || SAMPLE.area;
  const currentVacancy = localOverrides.vacancy || buildingData?.vacancy || SAMPLE.vacancy;
  const currentLeadSentence = localOverrides.leadSentence || buildingData?.leadSentence || SAMPLE.leadSentence;

  const SAMPLE_DATA = {
    title: currentTitle,
    subtitle: currentSubtitle,
    kicker: currentKicker,
    price: currentPrice,
    yield: currentYield,
    area: currentArea,
    vacancy: currentVacancy,
    metrics: [
      { label: '매각 희망가', value: currentPrice, unit: '' },
      { label: '수익률', value: currentYield, unit: '' },
      { label: '연면적', value: currentArea, unit: '' },
      { label: '공실률', value: currentVacancy, unit: '' },
    ],
    leadSentence: currentLeadSentence,
  };

  const fontFamily = mapFont(tokens.bodyFont);
  const titleFontFamily = mapFont(tokens.titleFont);

  const renderA01Cover = () => {
    switch (tokens.coverStyle) {
      case 'institutional_masses':
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
            <rect x={W / 2} y={0} width={W / 2} height={H} fill={tokens.darkCard} />
            <rect x={W / 2 + 50} y={100} width={300} height={150} fill={tokens.accent} opacity="0.8" />
            <rect x={W / 2 + 50} y={280} width={400} height={200} fill={tokens.darkCard} opacity="0.9" />
            <text x={M} y={H / 2 - 50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.kicker}</text>
            <text x={M} y={H / 2} fill={tokens.ink} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.title}</text>
            <text x={M} y={H / 2 + 50} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily}>{SAMPLE_DATA.subtitle}</text>
            <rect x={M} y={H / 2 + 100} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={M + 80} y={H / 2 + 126} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE_DATA.price}</text>
          </>
        );
      case 'split':
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
            <polygon points={`${W / 2},0 ${W},0 ${W},${H} ${W / 2 - 200},${H}`} fill={tokens.darkCard} />
            <text x={M} y={H / 2 - 50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.kicker}</text>
            <text x={M} y={H / 2} fill={tokens.ink} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.title}</text>
            <text x={M} y={H / 2 + 50} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily}>{SAMPLE_DATA.subtitle}</text>
            <rect x={M} y={H / 2 + 100} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={M + 80} y={H / 2 + 126} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE_DATA.price}</text>
          </>
        );
      case 'hero_dark':
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.darkCard} />
            <text x={W / 2} y={H / 2 - 80} fill={tokens.accent} fontSize={pt(24)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">{SAMPLE_DATA.kicker}</text>
            <text x={W / 2} y={H / 2} fill={tokens.darkBody} fontSize={pt(54)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">{SAMPLE_DATA.title}</text>
            <text x={W / 2} y={H / 2 + 60} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily} textAnchor="middle">{SAMPLE_DATA.subtitle}</text>
            <rect x={W / 2 - 80} y={H / 2 + 120} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={W / 2} y={H / 2 + 146} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE_DATA.price}</text>
          </>
        );
      case 'corporate_card':
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.tint} />
            <rect x={M} y={M} width={CW} height={H - M * 2} fill={tokens.bg} rx={24} />
            <text x={M * 2} y={H / 2 - 50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.kicker}</text>
            <text x={M * 2} y={H / 2} fill={tokens.ink} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.title}</text>
            <text x={M * 2} y={H / 2 + 50} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily}>{SAMPLE_DATA.subtitle}</text>
            <rect x={M * 2} y={H / 2 + 100} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={M * 2 + 80} y={H / 2 + 126} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE_DATA.price}</text>
          </>
        );
      case 'obsidian_glow':
      default:
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.darkCard} />
            <ellipse cx={W - 200} cy={200} rx={300} ry={300} fill={tokens.accent} opacity="0.1" />
            <text x={M} y={H / 2 - 50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.kicker}</text>
            <text x={M} y={H / 2} fill={tokens.darkBody} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.title}</text>
            <text x={M} y={H / 2 + 50} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily}>{SAMPLE_DATA.subtitle}</text>
            <rect x={M} y={H / 2 + 100} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={M + 80} y={H / 2 + 126} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE_DATA.price}</text>
          </>
        );
    }
  };

  const renderHeaderBlock = () => {
    const headerTitle = SAMPLE_DATA.title;
    return (
      <g>
        {tokens.layoutStyle === 'classic' || tokens.layoutStyle === 'executive' ? (
          <>
            <rect x={M} y={M} width={12} height={40} fill={tokens.accent} />
            <text x={M + 24} y={M + 30} fill={tokens.ink} fontSize={pt(24)} fontFamily={titleFontFamily} fontWeight="bold">{headerTitle}</text>
          </>
        ) : tokens.layoutStyle === 'modern' || tokens.layoutStyle === 'dramatic' ? (
          <>
            <rect x={0} y={0} width={W} height={100} fill={tokens.darkBlock} />
            <text x={M} y={60} fill={tokens.darkBody} fontSize={pt(24)} fontFamily={titleFontFamily} fontWeight="bold">{headerTitle}</text>
          </>
        ) : (
          <>
            <text x={W / 2} y={M + 30} fill={tokens.ink} fontSize={pt(24)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">{headerTitle}</text>
            <rect x={W / 2 - 40} y={M + 50} width={80} height={4} fill={tokens.accent} />
          </>
        )}
      </g>
    );
  };

  const renderA02StatGrid = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <text x={M} y={150} fill={tokens.ink} fontSize={pt(20)} fontFamily={fontFamily}>{SAMPLE_DATA.leadSentence}</text>
      <line x1={M} y1={180} x2={W - M} y2={180} stroke={tokens.accent} strokeWidth="2" />
      <g transform={`translate(${M}, 220)`}>
        {SAMPLE_DATA.metrics.map((m, i) => (
          <g key={i} transform={`translate(${(i % 2) * (CW / 2 + 20)}, ${Math.floor(i / 2) * 200})`}>
            <rect x={0} y={0} width={CW / 2 - 20} height={180} fill={tokens.tint} rx={8} />
            <text x={30} y={50} fill={tokens.mute} fontSize={pt(16)} fontFamily={fontFamily}>{m.label}</text>
            <text x={30} y={120} fill={tokens.accent} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{m.value}</text>
          </g>
        ))}
      </g>
    </>
  );

  const renderA03Table = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${M}, 150)`}>
        <rect x={0} y={0} width={CW} height={50} fill={tokens.darkBlock} />
        <text x={CW / 5 / 2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">구분</text>
        <text x={CW / 5 + CW / 5 / 2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">용도</text>
        <text x={CW / 5 * 2 + CW / 5 / 2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">전용면적</text>
        <text x={CW / 5 * 3 + CW / 5 / 2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">보증금</text>
        <text x={CW / 5 * 4 + CW / 5 / 2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">월임대료</text>

        {[1, 2, 3].map((row) => (
          <g key={row} transform={`translate(0, ${row * 50})`}>
            <rect x={0} y={0} width={CW} height={50} fill={row % 2 === 0 ? tokens.tint : tokens.bg} />
            <text x={CW / 5 / 2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">지상 {row}층</text>
            <text x={CW / 5 + CW / 5 / 2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">업무시설</text>
            <text x={CW / 5 * 2 + CW / 5 / 2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">100평</text>
            <text x={CW / 5 * 3 + CW / 5 / 2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">1억</text>
            <text x={CW / 5 * 4 + CW / 5 / 2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">1천만</text>
          </g>
        ))}
      </g>
    </>
  );

  const renderA04Asymmetric = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${M}, 150)`}>
        {/* Left panel 7/13 */}
        <g>
          {SAMPLE_DATA.metrics.map((m, i) => (
            <g key={i} transform={`translate(0, ${i * 60})`}>
              <rect x={0} y={0} width={CW * (7 / 13) - 20} height={50} fill={tokens.tint} rx={4} />
              <text x={20} y={32} fill={tokens.mute} fontSize={pt(16)} fontFamily={fontFamily}>{m.label}</text>
              <text x={CW * (7 / 13) - 40} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="end" fontWeight="bold">{m.value}</text>
            </g>
          ))}
        </g>
        <line x1={CW * (7 / 13) + 10} y1={0} x2={CW * (7 / 13) + 10} y2={400} stroke={tokens.accent} strokeWidth="2" opacity="0.5" />
        {/* Right panel 5/13 */}
        <g transform={`translate(${CW * (7 / 13) + 40}, 0)`}>
          <rect x={0} y={0} width={CW * (5 / 13)} height={220} fill={tokens.darkBlock} rx={8} />
          <text x={30} y={50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">Key Highlight</text>
          {wrapText(SAMPLE_DATA.leadSentence, 22, 30, 30, 95, tokens.darkBody, pt(16), 'normal', fontFamily)}
        </g>
      </g>
    </>
  );

  const renderA07ThreeBlock = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${M}, 150)`}>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${i * (CW / 3 + 20)}, 0)`}>
            <rect x={0} y={0} width={CW / 3 - 20} height={400} fill={tokens.tint} rx={8} />
            <rect x={0} y={0} width={CW / 3 - 20} height={8} fill={tokens.accent} rx={4} />
            <text x={30} y={60} fill={tokens.mute} fontSize={pt(16)} fontFamily={fontFamily}>{SAMPLE_DATA.metrics[i].label}</text>
            <text x={30} y={120} fill={tokens.accent} fontSize={pt(36)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE_DATA.metrics[i].value}</text>
            {wrapText('입지 및 시장 환경 분석 결과 우수한 접근성과 임차 수요를 보유하고 있습니다.', 15, 24, 30, 180, tokens.ink, pt(14), 'normal', fontFamily)}
          </g>
        ))}
      </g>
    </>
  );

  const renderA05AsymmetricAlt = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${M}, 150)`}>
        <g>
          <rect x={0} y={0} width={CW * (7 / 13) - 20} height={400} fill={tokens.tint} rx={8} />
          <text x={30} y={50} fill={tokens.ink} fontSize={pt(22)} fontFamily={titleFontFamily} fontWeight="bold">투자 배경 및 가치 제안</text>
          {wrapText(SAMPLE_DATA.leadSentence, 28, 30, 30, 100, tokens.mute, pt(16), 'normal', fontFamily)}
        </g>
        <g transform={`translate(${CW * (7 / 13) + 20}, 0)`}>
          {SAMPLE_DATA.metrics.map((m, i) => (
            <g key={i} transform={`translate(0, ${i * 100})`}>
              <rect x={0} y={0} width={CW * (6 / 13) - 20} height={80} fill={tokens.darkBlock} rx={8} />
              <text x={20} y={45} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily}>{m.label}</text>
              <text x={CW * (6 / 13) - 40} y={45} fill={tokens.accent} fontSize={pt(24)} fontFamily={titleFontFamily} textAnchor="end" fontWeight="bold">{m.value}</text>
            </g>
          ))}
        </g>
      </g>
    </>
  );

  const renderA06Diagram = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${W / 2}, ${H / 2 + 40})`}>
        <circle cx={0} cy={0} r={90} fill={tokens.accent} />
        <text x={0} y={10} fill={tokens.bg} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">Core Asset</text>
        {[0, 1, 2, 3].map((angle, i) => {
          const rad = (angle * 90 * Math.PI) / 180;
          const x = Math.cos(rad) * 220;
          const y = Math.sin(rad) * 160;
          return (
            <g key={i}>
              <line x1={0} y1={0} x2={x} y2={y} stroke={tokens.mute} strokeWidth="2" strokeDasharray="5,5" />
              <rect x={x - 80} y={y - 40} width={160} height={80} fill={tokens.tint} rx={8} />
              <text x={x} y={y - 5} fill={tokens.mute} fontSize={pt(14)} fontFamily={fontFamily} textAnchor="middle">{SAMPLE_DATA.metrics[i].label}</text>
              <text x={x} y={y + 25} fill={tokens.ink} fontSize={pt(18)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">{SAMPLE_DATA.metrics[i].value}</text>
            </g>
          );
        })}
      </g>
    </>
  );

  const renderA08DualTable = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${M}, 150)`}>
        <g>
          <rect x={0} y={0} width={CW / 2 - 20} height={40} fill={tokens.darkBlock} />
          <text x={20} y={26} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={titleFontFamily} fontWeight="bold">운영 수익</text>
          {[1, 2, 3].map((r) => (
            <g key={r} transform={`translate(0, ${r * 45})`}>
              <rect x={0} y={0} width={CW / 2 - 20} height={40} fill={tokens.tint} />
              <text x={20} y={26} fill={tokens.ink} fontSize={pt(14)} fontFamily={fontFamily}>항목 {r}</text>
              <text x={CW / 2 - 40} y={26} fill={tokens.ink} fontSize={pt(14)} fontFamily={fontFamily} textAnchor="end">{r * 1500} 만원</text>
            </g>
          ))}
        </g>
        <g transform={`translate(${CW / 2 + 20}, 0)`}>
          <rect x={0} y={0} width={CW / 2 - 20} height={40} fill={tokens.accent} />
          <text x={20} y={26} fill={tokens.bg} fontSize={pt(16)} fontFamily={titleFontFamily} fontWeight="bold">관리 비용</text>
          {[1, 2, 3].map((r) => (
            <g key={r} transform={`translate(0, ${r * 45})`}>
              <rect x={0} y={0} width={CW / 2 - 20} height={40} fill={tokens.tint} />
              <text x={20} y={26} fill={tokens.ink} fontSize={pt(14)} fontFamily={fontFamily}>비용 {r}</text>
              <text x={CW / 2 - 40} y={26} fill={tokens.ink} fontSize={pt(14)} fontFamily={fontFamily} textAnchor="end">{r * 400} 만원</text>
            </g>
          ))}
        </g>
      </g>
    </>
  );

  const renderA09Process = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${M}, 250)`}>
        {[0, 1, 2, 3, 4].map((step, i) => (
          <g key={i} transform={`translate(${i * 230}, 0)`}>
            <rect x={0} y={0} width={200} height={120} fill={tokens.tint} rx={8} />
            <circle cx={30} cy={30} r={16} fill={tokens.accent} />
            <text x={30} y={35} fill={tokens.bg} fontSize={pt(14)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">{i + 1}</text>
            <text x={60} y={35} fill={tokens.ink} fontSize={pt(16)} fontFamily={titleFontFamily} fontWeight="bold">Step {i + 1}</text>
            <text x={20} y={80} fill={tokens.mute} fontSize={pt(13)} fontFamily={fontFamily}>프로세스 단계 {i + 1}</text>
            {i < 4 && (
              <text x={212} y={65} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">→</text>
            )}
          </g>
        ))}
      </g>
    </>
  );

  const renderA11RoomSpec = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${M}, 150)`}>
        {[0, 1, 2, 3].map((r, i) => (
          <g key={i} transform={`translate(${(i % 2) * (CW / 2 + 20)}, ${Math.floor(i / 2) * 200})`}>
            <rect x={0} y={0} width={CW / 2 - 20} height={180} fill={tokens.tint} rx={8} />
            <text x={20} y={40} fill={tokens.ink} fontSize={pt(18)} fontFamily={titleFontFamily} fontWeight="bold">구역 {i + 1} 스펙</text>
            <text x={20} y={80} fill={tokens.mute} fontSize={pt(14)} fontFamily={fontFamily}>전용면적: {100 + i * 20}평</text>
            <text x={20} y={110} fill={tokens.mute} fontSize={pt(14)} fontFamily={fontFamily}>보증금: {5000 + i * 1000}만원</text>
            <text x={20} y={140} fill={tokens.accent} fontSize={pt(14)} fontFamily={fontFamily} fontWeight="bold">월임대료: {400 + i * 50}만원</text>
          </g>
        ))}
      </g>
    </>
  );

  const renderA14Gallery = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <g transform={`translate(${M}, 150)`}>
        {[0, 1, 2, 3, 4, 5].map((item, i) => (
          <g key={i} transform={`translate(${(i % 3) * (CW / 3 + 15)}, ${Math.floor(i / 3) * 220})`}>
            <rect x={0} y={0} width={CW / 3 - 20} height={180} fill={tokens.darkBlock} rx={6} />
            <text x={(CW / 3 - 20) / 2} y={90} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">
              사진 {i + 1}
            </text>
            <rect x={0} y={140} width={CW / 3 - 20} height={40} fill={tokens.darkCard} opacity="0.8" />
            <text x={15} y={165} fill={tokens.darkBody} fontSize={pt(13)} fontFamily={fontFamily}>
              {i === 0 ? '전면 로드뷰' : i === 1 ? '지상 로비' : '기준층 업무공간'}
            </text>
          </g>
        ))}
      </g>
    </>
  );

  const renderA10Closing = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.darkCard} />
      <text x={W / 2} y={H / 2 - 80} fill={tokens.accent} fontSize={pt(36)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">Thank You</text>
      <text x={W / 2} y={H / 2 - 20} fill={tokens.darkBody} fontSize={pt(20)} fontFamily={fontFamily} textAnchor="middle">매각 자문 및 문의</text>
      <line x1={W / 2 - 100} y1={H / 2} x2={W / 2 + 100} y2={H / 2} stroke={tokens.accent} strokeWidth="2" />
      <text x={W / 2} y={H / 2 + 40} fill={tokens.mute} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">CREDEAL Commercial Real Estate Advisory</text>
      <text x={W / 2} y={H / 2 + 70} fill={tokens.mute} fontSize={pt(14)} fontFamily={fontFamily} textAnchor="middle">본 자료는 내부 검토용으로 비밀유지 의무가 적용됩니다.</text>
    </>
  );

  const renderCurrent = () => {
    switch (activeArchetype) {
      case 'A01': return renderA01Cover();
      case 'A02': return renderA02StatGrid();
      case 'A03': return renderA03Table();
      case 'A04': return renderA04Asymmetric();
      case 'A05': return renderA05AsymmetricAlt();
      case 'A06': return renderA06Diagram();
      case 'A07': return renderA07ThreeBlock();
      case 'A08': return renderA08DualTable();
      case 'A09': return renderA09Process();
      case 'A10': return renderA10Closing();
      case 'A11': return renderA11RoomSpec();
      case 'A14': return renderA14Gallery();
    }
  };

  const scale = width / W;

  return (
    <div className="flex flex-col gap-4 items-center w-full justify-center">
      {/* Real-Time SVG Vector Canvas */}
      <div
        className="relative shadow-2xl overflow-hidden rounded-xl border border-slate-700/80 bg-black flex-shrink-0 transition-all"
        style={{ width: `${width}px`, height: `${H * scale}px` }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {renderCurrent()}
        </svg>

        {/* Sync Latency Indicator */}
        <div className="absolute bottom-2 right-3 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-emerald-400 font-mono border border-emerald-500/30 flex items-center gap-1.5 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>실시간 렌더 동기화 &lt;10ms</span>
        </div>
      </div>

      {/* Archetype Quick Switcher */}
      <div className="flex flex-wrap gap-1.5 justify-center max-w-[960px]">
        {(['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A14'] as Archetype[]).map((arc) => (
          <button
            key={arc}
            type="button"
            onClick={() => setActiveArchetype(arc)}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              activeArchetype === arc
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
          >
            {arc}
          </button>
        ))}
      </div>

      {/* Inline Text & Values Quick Editor */}
      {isInlineEditable && (
        <div className="w-full max-w-[960px] bg-slate-800/80 rounded-xl p-4 border border-slate-700/70 shadow-lg text-slate-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-amber-400">✏️ 슬라이드 인라인 미세 편집</span>
              <span className="text-xs text-slate-400">
                수정 즉시 SVG 프리뷰 화면에 100ms 이내 실시간 반영됩니다.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowInlineEditor(!showInlineEditor)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {showInlineEditor ? '접기 ▲' : '펼치기 ▼'}
            </button>
          </div>

          {showInlineEditor && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">슬라이드 제목 (Title)</label>
                <input
                  type="text"
                  value={currentTitle}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">상단 키커 / 카테고리 (Kicker)</label>
                <input
                  type="text"
                  value={currentKicker}
                  onChange={(e) => handleFieldChange('kicker', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-400 font-semibold mb-1">가치 제안 리드문 (Lead Narrative)</label>
                <textarea
                  rows={2}
                  value={currentLeadSentence}
                  onChange={(e) => handleFieldChange('leadSentence', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 md:col-span-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">매각 희망가</label>
                  <input
                    type="text"
                    value={currentPrice}
                    onChange={(e) => handleFieldChange('price', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">연 순수익률 (Cap Rate)</label>
                  <input
                    type="text"
                    value={currentYield}
                    onChange={(e) => handleFieldChange('yield', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">연면적</label>
                  <input
                    type="text"
                    value={currentArea}
                    onChange={(e) => handleFieldChange('area', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">공실률</label>
                  <input
                    type="text"
                    value={currentVacancy}
                    onChange={(e) => handleFieldChange('vacancy', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
