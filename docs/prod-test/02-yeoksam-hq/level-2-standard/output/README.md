# L2 Standard 테스트 산출물 — 역삼동 642-1 사옥형

> **테스트 일시**: 2026-09-07 10:10 KST
> **포스처**: owner_occupied (사옥형), 매각가 120억
> **buildingId**: e8bc71d2-6caf-409e-90b3-f9c15aa161f1
> **docId**: 4c8c7754-a7ed-4c60-9f13-a3a3b834e50d

## 산출물 구조

```
output/
├── yeoksam-hq-l2.pptx          ← PPTX IM 원본 (410KB, 10매)
├── summary.json                ← 테스트 메타데이터
├── phase1-dealcard.json        ← 딜카드 생성 결과
├── phase2-im-result.json       ← IM 생성 결과
│
├── pptx-slides/                ← PPTX 슬라이드 육안 검사용 PNG
│   ├── slide-01.png ~ slide-10.png  (150 DPI)
│   └── slide-texts.json        ← 슬라이드별 추출 텍스트 (PPTX 카피)
│
└── mobile-im/                  ← 모바일 IM 뷰어 캡처
    ├── mobile-full.png          ← 390x844 풀페이지 스크린샷
    ├── desktop-full.png         ← 1440x900 데스크톱 뷰
    └── viewer-text.txt          ← 모바일 IM 뷰어 텍스트 (모바일 IM 카피)
```

## 검수 포인트

### 1. PPTX 슬라이드 육안 검사 (pptx-slides/slide-*.png)
- 마크다운 토큰 누출 없는지
- 면적 중복 / 텍스트 오버플로 없는지
- 좌우 분할 동일 텍스트 중복 없는지 (Rule 3)

### 2. 모바일 IM 뷰어 검사 (mobile-im/mobile-full.png)
- 히어로 카드, 투자 포인트, 위치 지도 정상
- 페르소나 격리 (Rule 1) 준수

### 3. 카피 교차 비교 (slide-texts.json vs viewer-text.txt)
- PPTX 카피와 모바일 IM 카피 수치/용어 일관성
- CRE 실무 용어 준수 (Rule 2)