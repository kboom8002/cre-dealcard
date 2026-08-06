import React, { useState } from 'react';
import { PptxThemeTokens } from '@/domain/building/mobile-im/pptx/pptx-theme';

interface SlidePreviewSVGProps {
  tokens: PptxThemeTokens;
  width?: number; // CSS width in px, default 720
}

const W = 1280;
const H = 720;
const M = 60;
const CW = W - M * 2; // 1160
const IN = 96;

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
    { label: '공실', value: '3.2%', unit: '' },
  ],
  leadSentence:
    '서초대로 제일선에 위치한 코너 상가, 안정적 임대수익을 쮤하는 프라임 자산.',
};

type Archetype = 'A01' | 'A02' | 'A03' | 'A04' | 'A07' | 'A10';

export function SlidePreviewSVG({ tokens, width = 720 }: SlidePreviewSVGProps) {
  const [activeArchetype, setActiveArchetype] = useState<Archetype>('A01');

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
            <text x={M} y={H / 2 - 50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.kicker}</text>
            <text x={M} y={H / 2} fill={tokens.ink} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.title}</text>
            <text x={M} y={H / 2 + 50} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily}>{SAMPLE.subtitle}</text>
            <rect x={M} y={H / 2 + 100} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={M + 80} y={H / 2 + 126} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE.price}</text>
          </>
        );
      case 'split':
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
            <polygon points={`${W / 2},0 ${W},0 ${W},${H} ${W / 2 - 200},${H}`} fill={tokens.darkCard} />
            <text x={M} y={H / 2 - 50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.kicker}</text>
            <text x={M} y={H / 2} fill={tokens.ink} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.title}</text>
            <text x={M} y={H / 2 + 50} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily}>{SAMPLE.subtitle}</text>
            <rect x={M} y={H / 2 + 100} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={M + 80} y={H / 2 + 126} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE.price}</text>
          </>
        );
      case 'hero_dark':
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.darkCard} />
            <text x={W / 2} y={H / 2 - 80} fill={tokens.accent} fontSize={pt(24)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">{SAMPLE.kicker}</text>
            <text x={W / 2} y={H / 2} fill={tokens.darkBody} fontSize={pt(54)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">{SAMPLE.title}</text>
            <text x={W / 2} y={H / 2 + 60} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily} textAnchor="middle">{SAMPLE.subtitle}</text>
            <rect x={W / 2 - 80} y={H / 2 + 120} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={W / 2} y={H / 2 + 146} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE.price}</text>
          </>
        );
      case 'corporate_card':
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.tint} />
            <rect x={M} y={M} width={CW} height={H - M * 2} fill={tokens.bg} rx={24} />
            <text x={M * 2} y={H / 2 - 50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.kicker}</text>
            <text x={M * 2} y={H / 2} fill={tokens.ink} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.title}</text>
            <text x={M * 2} y={H / 2 + 50} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily}>{SAMPLE.subtitle}</text>
            <rect x={M * 2} y={H / 2 + 100} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={M * 2 + 80} y={H / 2 + 126} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE.price}</text>
          </>
        );
      case 'obsidian_glow':
      default:
        return (
          <>
            <rect x="0" y="0" width={W} height={H} fill={tokens.darkCard} />
            <ellipse cx={W - 200} cy={200} rx={300} ry={300} fill={tokens.accent} opacity="0.1" />
            <text x={M} y={H / 2 - 50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.kicker}</text>
            <text x={M} y={H / 2} fill={tokens.darkBody} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.title}</text>
            <text x={M} y={H / 2 + 50} fill={tokens.mute} fontSize={pt(24)} fontFamily={fontFamily}>{SAMPLE.subtitle}</text>
            <rect x={M} y={H / 2 + 100} width={160} height={40} fill={tokens.accent} rx={4} />
            <text x={M + 80} y={H / 2 + 126} fill={tokens.bg} fontSize={pt(18)} fontFamily={fontFamily} textAnchor="middle" fontWeight="bold">{SAMPLE.price}</text>
          </>
        );
    }
  };

  const renderHeaderBlock = () => {
    return (
      <g>
        {tokens.layoutStyle === 'classic' || tokens.layoutStyle === 'executive' ? (
          <>
            <rect x={M} y={M} width={12} height={40} fill={tokens.accent} />
            <text x={M + 24} y={M + 30} fill={tokens.ink} fontSize={pt(24)} fontFamily={titleFontFamily} fontWeight="bold">아키타입 제목</text>
          </>
        ) : tokens.layoutStyle === 'modern' || tokens.layoutStyle === 'dramatic' ? (
          <>
            <rect x={0} y={0} width={W} height={100} fill={tokens.darkBlock} />
            <text x={M} y={60} fill={tokens.darkBody} fontSize={pt(24)} fontFamily={titleFontFamily} fontWeight="bold">아키타입 제목</text>
          </>
        ) : (
          <>
            <text x={W/2} y={M + 30} fill={tokens.ink} fontSize={pt(24)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">아키타입 제목</text>
            <rect x={W/2 - 40} y={M + 50} width={80} height={4} fill={tokens.accent} />
          </>
        )}
      </g>
    );
  };

  const renderA02StatGrid = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.bg} />
      {renderHeaderBlock()}
      <text x={M} y={150} fill={tokens.ink} fontSize={pt(20)} fontFamily={fontFamily}>{SAMPLE.leadSentence}</text>
      <line x1={M} y1={180} x2={W - M} y2={180} stroke={tokens.accent} strokeWidth="2" />
      <g transform={`translate(${M}, 220)`}>
        {SAMPLE.metrics.map((m, i) => (
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
        <text x={CW/5/2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">구분</text>
        <text x={CW/5 + CW/5/2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">사용</text>
        <text x={CW/5*2 + CW/5/2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">전용면적</text>
        <text x={CW/5*3 + CW/5/2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">보증금</text>
        <text x={CW/5*4 + CW/5/2} y={32} fill={tokens.darkBody} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">월세</text>
        
        {[1, 2, 3].map((row) => (
          <g key={row} transform={`translate(0, ${row * 50})`}>
            <rect x={0} y={0} width={CW} height={50} fill={row % 2 === 0 ? tokens.tint : tokens.bg} />
            <text x={CW/5/2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">지상 {row}층</text>
            <text x={CW/5 + CW/5/2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">업무시설</text>
            <text x={CW/5*2 + CW/5/2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">100평</text>
            <text x={CW/5*3 + CW/5/2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">1억</text>
            <text x={CW/5*4 + CW/5/2} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">1천만</text>
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
          {SAMPLE.metrics.map((m, i) => (
            <g key={i} transform={`translate(0, ${i * 60})`}>
              <rect x={0} y={0} width={CW * (7/13) - 20} height={50} fill={tokens.tint} rx={4} />
              <text x={20} y={32} fill={tokens.mute} fontSize={pt(16)} fontFamily={fontFamily}>{m.label}</text>
              <text x={CW * (7/13) - 40} y={32} fill={tokens.ink} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="end" fontWeight="bold">{m.value}</text>
            </g>
          ))}
        </g>
        <line x1={CW * (7/13) + 10} y1={0} x2={CW * (7/13) + 10} y2={400} stroke={tokens.accent} strokeWidth="2" opacity="0.5" />
        {/* Right panel 5/13 */}
        <g transform={`translate(${CW * (7/13) + 40}, 0)`}>
          <rect x={0} y={0} width={CW * (5/13)} height={200} fill={tokens.darkBlock} rx={8} />
          <text x={30} y={50} fill={tokens.accent} fontSize={pt(20)} fontFamily={titleFontFamily} fontWeight="bold">Key Highlight</text>
          {wrapText(SAMPLE.leadSentence, 25, 30, 30, 100, tokens.darkBody, pt(16), 'normal', fontFamily)}
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
            <text x={30} y={60} fill={tokens.mute} fontSize={pt(16)} fontFamily={fontFamily}>{SAMPLE.metrics[i].label}</text>
            <text x={30} y={120} fill={tokens.accent} fontSize={pt(36)} fontFamily={titleFontFamily} fontWeight="bold">{SAMPLE.metrics[i].value}</text>
            {wrapText('이 항목에 대한 상세한 설명이 여기에 들어갑니다.', 15, 24, 30, 180, tokens.ink, pt(14), 'normal', fontFamily)}
          </g>
        ))}
      </g>
    </>
  );

  const renderA10Closing = () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill={tokens.darkBlock} />
      <text x={W / 2} y={H / 2 - 50} fill={tokens.darkBody} fontSize={pt(48)} fontFamily={titleFontFamily} fontWeight="bold" textAnchor="middle">Thank You</text>
      <text x={W / 2} y={H / 2 + 20} fill={tokens.accent} fontSize={pt(24)} fontFamily={fontFamily} textAnchor="middle">CRE Deal 부동산 중개법인</text>
      <text x={W / 2} y={H / 2 + 80} fill={tokens.mute} fontSize={pt(16)} fontFamily={fontFamily} textAnchor="middle">담당자: 홍길동 | 010-1234-5678</text>
      <line x1={M} y1={H - M - 20} x2={W - M} y2={H - M - 20} stroke={tokens.mute} strokeWidth="1" opacity="0.3" />
      <text x={W / 2} y={H - M} fill={tokens.mute} fontSize={pt(12)} fontFamily={fontFamily} textAnchor="middle">본 문서는 기밀 유지 의무가 있으며 무단 배포를 금합니다.</text>
    </>
  );

  const renderCurrent = () => {
    switch (activeArchetype) {
      case 'A01': return renderA01Cover();
      case 'A02': return renderA02StatGrid();
      case 'A03': return renderA03Table();
      case 'A04': return renderA04Asymmetric();
      case 'A07': return renderA07ThreeBlock();
      case 'A10': return renderA10Closing();
    }
  };

  const scale = width / W;

  return (
    <div className="flex flex-col gap-4 items-center w-full h-full justify-center">
      <div
        className="relative shadow-xl overflow-hidden rounded border border-gray-700 bg-black flex-shrink-0"
        style={{ width: `${width}px`, height: `${H * scale}px` }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {renderCurrent()}
        </svg>
      </div>

      <div className="flex gap-2">
        {(['A01', 'A02', 'A03', 'A04', 'A07', 'A10'] as Archetype[]).map((arc) => (
          <button
            key={arc}
            onClick={() => setActiveArchetype(arc)}
            className={`px-3 py-1 rounded text-sm ${
              activeArchetype === arc
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {arc}
          </button>
        ))}
      </div>
    </div>
  );
}
