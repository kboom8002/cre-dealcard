import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

const HTML_PATH = path.resolve(
  process.cwd(),
  "docs/tutorial/CREDEAL_60대_중개인_완전정복_튜토리얼.html"
);
const IMG_DIR = path.resolve(process.cwd(), "docs/tutorial/images");
const VID_DIR = path.resolve(process.cwd(), "docs/tutorial/videos");

/**
 * Step ID -> image filename mapping in CREDEAL_60대_중개인_완전정복_튜토리얼.html
 */
const STEP_IMAGE_MAP: Record<string, string> = {
  "ch3-s1": "step-03-dealcard-detail-top.png",
  "ch3-s2": "step-03-dealcard-editor-open.png",
  "ch3-s3": "step-03-dealcard-actions-bar.png",
  "ch3-s4": "step-03-dealcard-6tabs-comps.png",
  "ch3-s5": "step-03-public-dealcard-mobile.png",
  "ch7-s1": "step-07-magazine-simple-step1.png",
  "ch7-s2": "step-07-magazine-simple-step2-step3.png",
  "ch7-s3": "step-07-magazine-full-publish-analytics.png",
  "ch7-s4": "step-07-magazine-reader-mobile.png",
};

async function encodeWebpBase64(pngFileName: string): Promise<string> {
  const fullPath = path.join(IMG_DIR, pngFileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing image file: ${fullPath}`);
  }
  const webpBuf = await sharp(fullPath).webp({ quality: 86 }).toBuffer();
  return `data:image/webp;base64,${webpBuf.toString("base64")}`;
}

async function main() {
  let html = fs.readFileSync(HTML_PATH, "utf8");
  let replacedImages = 0;

  for (const [stepId, pngFile] of Object.entries(STEP_IMAGE_MAP)) {
    const dataUri = await encodeWebpBase64(pngFile);
    const marker = `<section class="step unit" id="${stepId}">`;
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) {
      console.warn(`⚠️ Step section not found: ${stepId}`);
      continue;
    }
    const endIdx = html.indexOf("</section>", startIdx);
    if (endIdx === -1) continue;

    const sectionHtml = html.slice(startIdx, endIdx);
    const updatedSectionHtml = sectionHtml.replace(
      /src="data:image\/webp;base64,[^"]+"/,
      `src="${dataUri}"`
    );

    if (updatedSectionHtml !== sectionHtml) {
      html = html.slice(0, startIdx) + updatedSectionHtml + html.slice(endIdx);
      replacedImages++;
      console.log(`✅ Updated inline WebP image for #${stepId} (${pngFile})`);
    } else {
      console.log(`ℹ️ #${stepId} (${pngFile}) was already up to date or had no img src`);
    }
  }

  // Also update ch3 video stage background-image poster
  const ch3PosterUri = await encodeWebpBase64("step-03-dealcard-detail-top.png");
  const ch3VideoMarker = `data-src="v-video-02-memo-to-dealcard"`;
  const ch3VidIdx = html.indexOf(ch3VideoMarker);
  if (ch3VidIdx !== -1) {
    const ch3VidEnd = html.indexOf("</div></div>", ch3VidIdx);
    if (ch3VidEnd !== -1) {
      const vidBlock = html.slice(ch3VidIdx, ch3VidEnd);
      const updatedVidBlock = vidBlock.replace(
        /background-image:url\('data:image\/webp;base64,[^']+'\)/,
        `background-image:url('${ch3PosterUri}')`
      );
      if (updatedVidBlock !== vidBlock) {
        html = html.slice(0, ch3VidIdx) + updatedVidBlock + html.slice(ch3VidEnd);
        console.log(`✅ Updated video poster for v-video-02-memo-to-dealcard`);
      }
    }
  }

  // Also update embedded base64 video for v-video-02-memo-to-dealcard if present
  const vid2Path = path.join(VID_DIR, "video-02-memo-to-dealcard.webm");
  if (fs.existsSync(vid2Path)) {
    const vidScriptStart = html.indexOf(`<script id="v-video-02-memo-to-dealcard"`);
    if (vidScriptStart !== -1) {
      const tagClose = html.indexOf(">", vidScriptStart);
      const scriptEnd = html.indexOf("</script>", tagClose);
      if (tagClose !== -1 && scriptEnd !== -1) {
        const vidB64 = fs.readFileSync(vid2Path).toString("base64");
        html = html.slice(0, tagClose + 1) + vidB64 + html.slice(scriptEnd);
        console.log(`✅ Updated embedded WebM video for v-video-02-memo-to-dealcard`);
      }
    }
  }

  // Update #ch3-s5 step text in HTML to mention /dc/[id] (and /d/[id] redirect) & sticky CTA bar
  const ch3s5Start = html.indexOf(`<section class="step unit" id="ch3-s5">`);
  if (ch3s5Start !== -1) {
    const ch3s5End = html.indexOf("</section>", ch3s5Start);
    if (ch3s5End !== -1) {
      let s5 = html.slice(ch3s5Start, ch3s5End);
      s5 = s5.replace(
        `<span class="ui">수신자 화면</span> 버튼을 눌러 매수 고객의 스마트폰에 딜카드가 어떻게 보이는지 확인하세요.`,
        `<span class="ui">수신자 화면</span> 버튼을 누르거나 카톡 공유 링크(<code>/dc/매물번호</code> — 구형 <code>/d/매물번호</code> 주소도 자동 연결됨)를 열어 매수 고객의 스마트폰에 딜카드가 어떻게 보이는지 확인하세요.`
      );
      s5 = s5.replace(
        `고객 화면에는 매물 핵심 제원과 투자 포인트가 나옵니다. 하단에는 대표님의 이름·소속·전화 걸기 버튼이 명함처럼 함께 표시됩니다.`,
        `고객 스마트폰 화면에는 권역·매각가·수익률 요약(상세 지번 비공개 블라인드 보호), ⭐ 핵심 투자 포인트 3선 및 수익 시뮬레이터가 나옵니다. 하단에는 대표님의 이름·소속·공인중개사 인증 명함과 <span class="ui">📞 전화 연결</span> · <span class="ui">📄 모바일 IM 보기</span>(또는 <span class="ui">🔑 상세 IM 신청</span>) 고정 버튼이 함께 표시됩니다.`
      );
      html = html.slice(0, ch3s5Start) + s5 + html.slice(ch3s5End);
      console.log(`✅ Updated #ch3-s5 text in HTML manual`);
    }
  }

  fs.writeFileSync(HTML_PATH, html, "utf8");
  console.log(`🎉 HTML manual sync complete (${replacedImages} step images updated): ${HTML_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
