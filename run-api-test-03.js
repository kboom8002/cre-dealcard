const { request } = require('playwright');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\26f684f7-f120-455a-96d6-662c12789f8d';
const TARGET_URL = 'http://localhost:3000';
const buildingId = 'd2acdd2c-d686-435a-9cba-606eafd0860b';

(async () => {
  const apiContext = await request.newContext({ baseURL: TARGET_URL });

  try {
    console.log('--- Fetching IM Lite Document Data ---');
    const docRes = await apiContext.get(`/api/public/im-lite/${buildingId}`);
    let docId = null;
    if (docRes.ok()) {
      const docJson = await docRes.json();
      docId = docJson.document?.id || docJson.data?.id; // depends on actual structure
      console.log(`Extracted doc_id: ${docId}`);
    } else {
      console.log(`IM Lite fetch failed: ${docRes.status()}`);
    }

    console.log('--- TC-PP01: Testing Basic PPTX Generation ---');
    const pptxUrl = `/api/public/im-lite/${buildingId}/pptx`;
    const pptxRes = await apiContext.get(pptxUrl, { timeout: 60000 });
    
    console.log(`Status: ${pptxRes.status()}`);
    if (pptxRes.ok()) {
      const headers = pptxRes.headers();
      console.log('Headers:', {
        'content-type': headers['content-type'],
        'x-slide-count': headers['x-slide-count'],
        'x-file-size': headers['x-file-size'],
        'x-warnings': decodeURIComponent(headers['x-warnings'] || '')
      });
      const body = await pptxRes.body();
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'test_income.pptx'), body);
      console.log(`Saved PPTX (${body.length} bytes)`);
    }

    console.log('--- TC-PP15: Testing Translate API ---');
    if (docId) {
      const transRes = await apiContext.post(`/api/public/im-lite/${buildingId}/translate`, {
        data: { language: 'en', doc_id: docId }
      });
      console.log(`Translate Status: ${transRes.status()}`);
      if (transRes.ok()) {
        const transJson = await transRes.json();
        console.log(`Translation success.`);
      } else {
        console.log(`Translation failed:`, await transRes.text());
      }
    }

    console.log('--- TC-PP16: Testing TTS API ---');
    const ttsRes = await apiContext.get(`/api/public/im-lite/${buildingId}/tts?language=ko`, { timeout: 60000 });
    console.log(`TTS Status: ${ttsRes.status()}`);
    if (ttsRes.ok()) {
       console.log(`TTS Headers: X-TTS-Source = ${ttsRes.headers()['x-tts-source']}`);
       const ttsBody = await ttsRes.body();
       fs.writeFileSync(path.join(ARTIFACT_DIR, 'briefing.mp3'), ttsBody);
       console.log(`Saved TTS to briefing.mp3 (${ttsBody.length} bytes)`);
    } else {
       console.log(`TTS failed:`, await ttsRes.text());
    }

    console.log('Success! Test script completed.');
  } catch (error) {
    console.error('Test failed:', error);
  }
})();
