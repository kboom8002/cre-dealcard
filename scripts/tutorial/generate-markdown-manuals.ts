import * as fs from "fs";
import * as path from "path";
import {
  BROKER_TUTORIAL_MODULES,
  BROKER_FAQ_LIST,
  BROKER_GLOSSARY_LIST,
  POSTURE_GUIDE_ROWS,
  BROKER_MESSAGE_TEMPLATES,
  type TutorialModule,
} from "../../src/lib/tutorial/broker-tutorial-data";

const OUT_DIR = path.resolve(process.cwd(), "docs/tutorial");

const FILE_NAMES: Record<string, string> = {
  "module-00": "00-시작하기-화면조절.md",
  "module-01": "01-홈화면-100퍼센트-활용.md",
  "module-02": "02-메모로-1분-딜카드-등록.md",
  "module-03": "03-딜카드-다듬기-카톡공유.md",
  "module-04": "04-기본IM-맞춤형-PPTX-만들기.md",
  "module-05": "05-IM완성확인-PPTX받기-웹화면.md",
  "module-06": "06-내물건-보관함-관리.md",
  "module-07": "07-주간-고객소식지-5분발행.md",
  "module-08": "08-고객명단-문의함-열람알림.md",
  "module-09": "09-내프로필-명함설정-완전정복.md",
  "module-10": "10-문제해결-FAQ15-용어사전.md",
};

function renderModuleMarkdown(mod: TutorialModule, isMaster: boolean): string {
  const lines: string[] = [];
  const headingPrefix = isMaster ? "##" : "#";
  const subHeadingPrefix = isMaster ? "###" : "##";

  lines.push(`${headingPrefix} ${mod.title}`);
  lines.push("");
  lines.push(`> **소요 시간**: ${mod.duration} | **관련 화면**: \`${mod.targetHref}\` (${mod.targetLabel})`);
  lines.push(`> ${mod.subtitle}`);
  lines.push("");

  lines.push(`${subHeadingPrefix} 🎯 이 장에서 꼭 기억하실 핵심 포인트`);
  lines.push("");
  for (const pt of mod.summaryPoints) {
    lines.push(`- **${pt}**`);
  }
  lines.push("");

  const relVideo = mod.videoUrl.replace("/tutorials/videos/", "./videos/");
  lines.push(`> 🎬 **따라하기 동영상**: [${mod.videoTitle}](${relVideo})`);
  lines.push("");

  if (mod.steps.length > 0) {
    for (const step of mod.steps) {
      const relImg = step.imageUrl.replace("/tutorials/images/", "./images/");
      lines.push(`---`);
      lines.push("");
      lines.push(`${subHeadingPrefix} [${step.stepNumber}] ${step.title}`);
      lines.push("");
      lines.push(`![${step.imageCaption}](${relImg})`);
      lines.push(`*▲ [화면 안내] ${step.imageCaption}*`);
      lines.push("");
      lines.push(`1. **👆 어디를 누르거나 입력하나요?**`);
      lines.push(`   ${step.whereToClick.replace(/\n/g, "\n   ")}`);
      lines.push("");
      lines.push(`2. **✅ 화면에서 무엇이 바뀌나요?**`);
      lines.push(`   ${step.whatChanges.replace(/\n/g, "\n   ")}`);
      lines.push("");
      lines.push(`3. **💡 왜 이 기능이 중요한가요? (중개 실무 포인트)**`);
      lines.push(`   ${step.whyItMatters.replace(/\n/g, "\n   ")}`);
      if (step.tip) {
        lines.push("");
        lines.push(`   > 📌 **따라하기 꿀팁**: ${step.tip}`);
      }
      if (step.commonMistake) {
        lines.push("");
        lines.push(`4. **⚠️ 자주 하시는 실수 & 안심 예방법**`);
        lines.push(`   ${step.commonMistake.replace(/\n/g, "\n   ")}`);
      }
      if (step.copySample) {
        lines.push("");
        lines.push(`5. **📋 바로 복사해서 따라 해보는 실전 문구 예시 (${step.copySample.label})**`);
        lines.push("   ```text");
        for (const l of step.copySample.text.split("\n")) {
          lines.push(`   ${l}`);
        }
        lines.push("   ```");
      }
      lines.push("");
    }
  }

  if (mod.id === "module-10") {
    lines.push(`---`);
    lines.push("");
    lines.push(`${subHeadingPrefix} 🛠️ 자주 묻는 질문과 즉시 해결법 (FAQ 20선)`);
    lines.push("");
    for (const faq of BROKER_FAQ_LIST) {
      lines.push(`#### [${faq.qNumber} · ${faq.category}] ${faq.question}`);
      lines.push(`- **해결 방법**: ${faq.answer}`);
      lines.push(`- **👉 바로 해보기**: ${faq.actionTip}`);
      lines.push("");
    }

    lines.push(`---`);
    lines.push("");
    lines.push(`${subHeadingPrefix} 📖 60대 중개인을 위한 쉬운 부동산 디지털 용어 사전 (15선)`);
    lines.push("");
    lines.push(`| 화면 용어 | 쉬운 우리말 뜻 | 어디에 나오나요? |`);
    lines.push(`|:---|:---|:---|`);
    for (const g of BROKER_GLOSSARY_LIST) {
      lines.push(`| **${g.term}** | ${g.easyMeaning} | ${g.whereUsed} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderAppendixAMarkdown(isMaster: boolean): string {
  const h = isMaster ? "##" : "#";
  const lines: string[] = [
    `${h} 부록 A. 5대 투자 목적(포스처)별 추천 매물 · 필수 입력값 · 자동 생성 슬라이드 비교표`,
    "",
    `> \`[⚡ 기본 IM 만들기]\` 맨 위 ①번 단계에서 투자 목적을 선택하시면, 각 매물의 성격에 꼭 맞는 입력칸과 슬라이드 구성이 자동으로 준비됩니다.`,
    "",
    `| 투자 목적 | 어떤 매물에 쓰나요? | 주요 입력 항목 | 자동 생성되는 PPTX 슬라이드 구성 |`,
    `|:---|:---|:---|:---|`,
  ];
  for (const row of POSTURE_GUIDE_ROWS) {
    lines.push(
      `| **${row.postureName}** | ${row.recommendedFor} | ${row.keyInputs} | ${row.generatedSlides} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderAppendixBMarkdown(isMaster: boolean): string {
  const h = isMaster ? "##" : "#";
  return [
    `${h} 부록 B. 모니터 옆에 붙여두는 A4 1장 큰글씨 요약표 (Cheat Sheet)`,
    "",
    `> 💡 **이 페이지만 인쇄하셔서 사무실 모니터 옆에 붙여두시면 언제든 10초 만에 따라 하실 수 있습니다.**`,
    "",
    `### ① 1분 딜카드 만들기 (소요시간 1분)`,
    `1. 상단 메뉴바 **\`[➕ 새 물건 등록]\`** 클릭`,
    `2. 카톡 매물 메모 복사(**\`Ctrl + C\`**) 후 입력창에 붙여넣기(**\`Ctrl + V\`**)`,
    `3. 우측 하단 파란색 **\`[1분 딜카드 만들기]\`** 클릭`,
    `4. **\`[✏️ 딜카드 제목 · 카톡 공유 문구 직접 다듬기]\`** 확인 후 **\`[카톡 공유]\`** 또는 **\`[링크 복사]\`**`,
    "",
    `### ② PPTX 제안서 · 기본 IM 만들기 (소요시간 3분)`,
    `1. 딜카드 화면 맨 아래 노란색 **\`[⚡ 기본 IM 만들기]\`** 클릭`,
    `2. **① 투자 목적**(임대수익 / 자가사용 / 신축·리모델링) 선택 → **② 주소 검색**(다필지 지번·면적 자동 합산)`,
    `3. **③ 매각 희망가**(\`+100억\` / \`+10억\` 버튼) · 층별 임대현황(또는 엑셀 업로드) · 사진 등록(\`★ 대표\` / \`🏢 외관\`) 후 **\`[⚡ IM 생성]\`** 클릭`,
    `4. 완성 화면에서 4대 점검(✅) 확인 후 **\`[📥 PPTX 제안서 파일 받기]\`** 또는 **\`[🔗 카톡용 링크 복사]\`** 클릭`,
    "",
    `### ③ 주간 고객 소식지 5분 발행 (매주 월·화요일 아침 추천)`,
    `1. 상단 메뉴바 **\`[📰 고객 소식지]\`** 클릭 (5분 간단 모드 자동 실행)`,
    `2. **① 이번 주 한마디**: 시작 문장 추천 버튼 클릭 후 1~2문장 작성 (제목·3줄 요약·뉴스·계산기 자동 포함)`,
    `3. **② 소개할 매물**: 이번 주 추천할 내 물건(최대 3건) 클릭해 체크(✓)`,
    `4. 하단 파란색 **\`[🚀 이번 주 매거진 발행하기]\`** 클릭 후 카카오톡·이메일 전송`,
    "",
    `### ④ 평생 써먹는 컴퓨터 단축키 & 안심 조작법 4가지`,
    `- **글씨 크게 확대**: 키보드 **\`[Ctrl]\`** 누른 채 **마우스 바퀴(휠) 위로 굴리기** (원래 크기는 \`Ctrl + 0\`)`,
    `- **복사 / 붙여넣기**: **\`[Ctrl + C]\`** (복사) → **\`[Ctrl + V]\`** (붙여넣기)`,
    `- **눈이 편한 밝은 화면**: 상단 우측 **\`[☀️ 큰글씨 밝은 화면 (켜짐)]\`** 버튼 확인`,
    `- **길을 잃었을 때**: 어느 화면에서든 상단 왼쪽 첫 번째 **\`[🏠 홈 화면]\`** 클릭`,
    "",
  ].join("\n");
}

function renderAppendixCMarkdown(isMaster: boolean): string {
  const h = isMaster ? "##" : "#";
  const sub = isMaster ? "###" : "##";
  const lines: string[] = [
    `${h} 부록 C. 상황별 카카오톡 매물 브리핑 & 주간 소식지 발송 인사말 템플릿 6선`,
    "",
    `> 💬 고객에게 딜카드 링크, PPTX 제안서, 또는 주간 소식지를 보내실 때 그대로 복사해서 쓰실 수 있는 품격 있는 실전 인사말 모음입니다.`,
    "",
  ];
  for (const tpl of BROKER_MESSAGE_TEMPLATES) {
    lines.push(`${sub} [${tpl.situation}] ${tpl.title}`);
    lines.push(`- **추천 발송 대상**: ${tpl.targetAudience}`);
    lines.push("```text");
    lines.push(tpl.body);
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "images"), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "videos"), { recursive: true });

  // 1. 단원별 개별 파일 생성
  for (const mod of BROKER_TUTORIAL_MODULES) {
    const fileName = FILE_NAMES[mod.id];
    if (!fileName) continue;
    const content = renderModuleMarkdown(mod, false);
    fs.writeFileSync(path.join(OUT_DIR, fileName), content, "utf8");
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "부록A-5대투자목적별-맞춤가이드.md"),
    renderAppendixAMarkdown(false),
    "utf8"
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "부록B-A4-한장-큰글씨-요약표.md"),
    renderAppendixBMarkdown(false),
    "utf8"
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "부록C-카톡발송멘트-인사말-템플릿6선.md"),
    renderAppendixCMarkdown(false),
    "utf8"
  );

  // 2. 통합 마스터 매뉴얼 생성
  const masterLines: string[] = [
    `# 📖 60대 대표공인중개사를 위한 크리딜(CRE DealCard) 전 기능 완전정복 큰글씨 매뉴얼`,
    "",
    `> **버전**: 2026.10 SOTA 골든 에디션 (4-Tier 따뜻한 종이 주간 모드 · WCAG AAA 고대비 · 큰글씨 표준 적용)`,
    `> **실전 따라하기 예시 매물**:`,
    `> - **예시 A (다필지 수익형)**: 서울특별시 영등포구 양평동4가 117, 134, 125-2번지 (더레드빌딩 · 매각가 250억 · 3필지 대지 157평 / 연면적 753.5평 · B1~10F · 1층 스타벅스 입점)`,
    `> - **예시 B (일반 수익형·통합계약)**: 서울특별시 영등포구 당산동5가 11-47 (호산당빌딩 · 매각가 115억 · 대지 153.3평 / 연면적 307.9평 · B1~5F · 1층 약국 및 1~2층 내과 통합계약)`,
    `> - **웹 내장 대화형 안내서 주소**: 프로그램 상단 바 **\`[📖 쉬운 사용법 안내]\`** 버튼 (\`/broker/tutorial\`)`,
    `> - **인쇄용 큰글씨 PDF 매뉴얼**: [\`CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf\`](./CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf)`,
    "",
    `---`,
    "",
    `## 📚 목차 (단원별 바로가기)`,
    "",
    `- [제0장. 시작하기 — 상단 메뉴바와 눈이 편안한 '큰글씨 밝은 화면' 사용법](./00-시작하기-화면조절.md)`,
    `- [제1장. 홈 화면(대시보드) 100% 활용하기](./01-홈화면-100퍼센트-활용.md)`,
    `- [제2장. 메모로 새 물건 등록 — 1분 딜카드 만들기 (다필지 & 통합계약 실전 예시)](./02-메모로-1분-딜카드-등록.md)`,
    `- [제3장. 딜카드 확인 · 문구 직접 다듬기 · 6대 상세 탭 · 카카오톡 공유](./03-딜카드-다듬기-카톡공유.md)`,
    `- [제4장. 기본 IM(맞춤형 PPTX 투자설명서) 만들기 — 다필지·수익률·렌트롤 완벽 지원](./04-기본IM-맞춤형-PPTX-만들기.md)`,
    `- [제5장. IM 완성 확인 · 문구/사진 다듬기 · PPTX 제안서 파일 받기](./05-IM완성확인-PPTX받기-웹화면.md)`,
    `- [제6장. 내 물건 목록(딜카드 & IM 보관함) 검색 · 다시 열기 · 삭제하기](./06-내물건-보관함-관리.md)`,
    `- [제7장. 주간 고객 소식지(모바일 매거진) — 5분 간단 모드 & 8단계 상세 편집 완전정복](./07-주간-고객소식지-5분발행.md)`,
    `- [제8장. 고객 · 구독자 명단 등록 및 고객 문의함(열람 알림) 확인하기](./08-고객명단-문의함-열람알림.md)`,
    `- [제9장. 내 프로필 · 중개사무소 설정 완전 정복 (어디에 어떻게 인쇄되나요?)](./09-내프로필-명함설정-완전정복.md)`,
    `- [제10장. 당황하지 않는 문제 해결(FAQ 20선) & 쉬운 부동산 디지털 용어 사전(15선)](./10-문제해결-FAQ15-용어사전.md)`,
    `- [부록 A. 5대 투자 목적(포스처)별 추천 매물 · 필수 입력값 · 자동 생성 슬라이드 비교표](./부록A-5대투자목적별-맞춤가이드.md)`,
    `- [부록 B. 모니터 옆에 붙여두는 A4 1장 큰글씨 요약표 (Cheat Sheet)](./부록B-A4-한장-큰글씨-요약표.md)`,
    `- [부록 C. 상황별 카카오톡 매물 브리핑 & 주간 소식지 발송 인사말 템플릿 6선](./부록C-카톡발송멘트-인사말-템플릿6선.md)`,
    "",
  ];

  for (const mod of BROKER_TUTORIAL_MODULES) {
    masterLines.push(`---`);
    masterLines.push("");
    masterLines.push(renderModuleMarkdown(mod, true));
    masterLines.push("");
  }

  masterLines.push(`---`);
  masterLines.push("");
  masterLines.push(renderAppendixAMarkdown(true));
  masterLines.push("");
  masterLines.push(`---`);
  masterLines.push("");
  masterLines.push(renderAppendixBMarkdown(true));
  masterLines.push("");
  masterLines.push(`---`);
  masterLines.push("");
  masterLines.push(renderAppendixCMarkdown(true));

  fs.writeFileSync(
    path.join(OUT_DIR, "CREDEAL_60대_중개인_완전정복_튜토리얼.md"),
    masterLines.join("\n"),
    "utf8"
  );

  console.log("✅ Generated 14 modular markdown guides + 1 master guide in docs/tutorial/");
}

main();
