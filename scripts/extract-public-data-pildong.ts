/**
 * 중구 필동3가 44-5 공공데이터 추출 스크립트 (V-World 통합 v2)
 * Usage: npx tsx scripts/extract-public-data-pildong.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DATA_KEY = process.env.DATA_GO_KR_API_KEY!;
const JUSO_KEY = process.env.JUSO_CONFIRM_KEY!;
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY!;
const VWORLD_KEY = process.env.VWORLD_API_KEY!;
const SEMAS_KEY = process.env.SEMAS_API_KEY || DATA_KEY;

const RAW_ADDRESS = '서울특별시 중구 필동3가 44-5';

async function fetchJSON(url: string, label: string, headers?: Record<string, string>) {
  console.log(`[${label}] Fetching...`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers });
    const text = await res.text();
    try { return JSON.parse(text); } catch { console.log(`[${label}] Non-JSON (${text.substring(0, 300)})`); return null; }
  } catch (e: any) { console.error(`[${label}] Error:`, e.message); return null; }
}

// 1. 도로명주소 API → PNU
async function resolveAddress() {
  return fetchJSON(`https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${JUSO_KEY}&currentPage=1&countPerPage=5&keyword=${encodeURIComponent('중구 필동3가 44-5')}&resultType=json`, '주소검색');
}

// 2. 건축물대장 표제부
async function fetchBuildingRegister(s: string, b: string, bn: string, ji: string) {
  return fetchJSON(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?ServiceKey=${DATA_KEY}&sigunguCd=${s}&bjdongCd=${b}&platGbCd=0&bun=${bn}&ji=${ji}&numOfRows=30&pageNo=1&_type=json`, '건축물대장_표제부');
}

// 3. 건축물대장 총괄표제부
async function fetchBuildingRecap(s: string, b: string, bn: string, ji: string) {
  return fetchJSON(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo?ServiceKey=${DATA_KEY}&sigunguCd=${s}&bjdongCd=${b}&platGbCd=0&bun=${bn}&ji=${ji}&numOfRows=30&pageNo=1&_type=json`, '건축물대장_총괄표제부');
}

// 4. V-World 토지특성속성조회 (토지이용계획 + 공시지가 통합)
async function fetchVWorldLandCharacteristics(pnu: string) {
  const stdrYear = new Date().getFullYear().toString();
  return fetchJSON(
    `https://api.vworld.kr/ned/data/getLandCharacteristics?key=${VWORLD_KEY}&pnu=${pnu}&format=json&stdrYear=${stdrYear}&numOfRows=1&pageNo=1`,
    'V-World_토지특성',
    { 'Referer': 'http://localhost:3000' }
  );
}

// 5. 실거래가 (최근 6개월)
async function fetchRealTransactions(sigunguCd: string) {
  const now = new Date();
  const results: any[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const data = await fetchJSON(`https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade?ServiceKey=${DATA_KEY}&LAWD_CD=${sigunguCd}&DEAL_YMD=${ym}&numOfRows=30&pageNo=1&_type=json`, `실거래가_${ym}`);
    results.push({ yearMonth: ym, data });
  }
  return results;
}

// 6. 카카오 주소 Geocoding
async function geocodeAddress(address: string) {
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`, {
      headers: { 'Authorization': `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(10000)
    });
    return await res.json();
  } catch (e: any) { console.error('[카카오_지오코딩] Error:', e.message); return null; }
}

// 7. 카카오 POI 검색
async function fetchNearbyPOI(lat: number, lng: number) {
  const categories = [
    { code: 'SW8', name: '지하철역', radius: 1000 },
    { code: 'BK9', name: '은행', radius: 500 },
    { code: 'MT1', name: '대형마트', radius: 1000 },
    { code: 'HP8', name: '병원', radius: 1000 },
    { code: 'SC4', name: '학교', radius: 1000 },
    { code: 'CE7', name: '카페', radius: 500 },
    { code: 'PK6', name: '주차장', radius: 500 },
    { code: 'FD6', name: '음식점', radius: 500 },
    { code: 'CS2', name: '편의점', radius: 500 },
    { code: 'BZ2', name: '버스정류장', radius: 500 },
  ];
  const results: any[] = [];
  for (const cat of categories) {
    try {
      const res = await fetch(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${cat.code}&x=${lng}&y=${lat}&radius=${cat.radius}&sort=distance&size=5`, {
        headers: { 'Authorization': `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();
      results.push({
        category: cat.name, code: cat.code, radius: cat.radius,
        totalCount: data.meta?.total_count || 0,
        nearest: data.documents?.[0] ? { name: data.documents[0].place_name, distance: data.documents[0].distance, address: data.documents[0].road_address_name || data.documents[0].address_name } : null,
      });
    } catch (e: any) { results.push({ category: cat.name, code: cat.code, error: e.message }); }
  }
  return results;
}

// 8. 소상공인 상권분석
async function fetchCommercialDistrict(legalDongCode10: string) {
  return fetchJSON(`https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong?serviceKey=${SEMAS_KEY}&divId=ldongCd&key=${legalDongCode10}&pageIndex=1&pageSize=10&type=json`, '상권분석');
}

// ===== MAIN =====
async function main() {
  console.log('='.repeat(60));
  console.log('중구 필동3가 44-5 공공데이터 추출 (V-World 통합 v2)');
  console.log('='.repeat(60));

  // Step 1: 주소 → PNU
  const jusoResult = await resolveAddress();
  const jusoItem = jusoResult?.results?.juso?.[0];
  let pnu = '', sigunguCd = '', bjdongCd = '', bun = '', ji = '', legalDongCode10 = '';

  if (jusoItem?.bdMgtSn) {
    pnu = jusoItem.bdMgtSn.substring(0, 19);
    sigunguCd = pnu.substring(0, 5); bjdongCd = pnu.substring(5, 10);
    bun = pnu.substring(11, 15); ji = pnu.substring(15, 19);
    legalDongCode10 = pnu.substring(0, 10);
  } else {
    sigunguCd = '11140'; bjdongCd = '13900'; bun = '0044'; ji = '0005';
    pnu = `${sigunguCd}${bjdongCd}1${bun}${ji}`; legalDongCode10 = `${sigunguCd}${bjdongCd}`;
  }

  console.log(`\n[PNU] ${pnu}\n[시군구] ${sigunguCd} [법정동] ${bjdongCd} [본번] ${bun} [부번] ${ji}`);

  // Step 2: Geocoding
  const geoResult = await geocodeAddress(RAW_ADDRESS);
  const lat = parseFloat(geoResult?.documents?.[0]?.y || '37.5615');
  const lng = parseFloat(geoResult?.documents?.[0]?.x || '126.9948');
  console.log(`[좌표] lat=${lat}, lng=${lng}`);

  // Step 3: 병렬 API 호출
  const [buildingReg, buildingRecap, vworldLand, realTx, poi, commercial] = await Promise.all([
    fetchBuildingRegister(sigunguCd, bjdongCd, bun, ji),
    fetchBuildingRecap(sigunguCd, bjdongCd, bun, ji),
    fetchVWorldLandCharacteristics(pnu),
    fetchRealTransactions(sigunguCd),
    fetchNearbyPOI(lat, lng),
    fetchCommercialDistrict(legalDongCode10),
  ]);

  // V-World 결과 파싱
  const vwItem = vworldLand?.landCharacteristicss?.field?.[0] || null;

  const output = {
    meta: { address: RAW_ADDRESS, pnu, sigunguCd, bjdongCd, bun, ji, legalDongCode10, lat, lng, extractedAt: new Date().toISOString() },
    jusoResult: jusoItem,
    geoResult: geoResult?.documents?.[0] || null,
    buildingRegister: buildingReg?.response?.body?.items?.item || buildingReg,
    buildingRecap: buildingRecap?.response?.body?.items?.item || buildingRecap,
    vworldLandCharacteristics: vwItem,
    realTransactions: realTx,
    nearbyPOI: poi,
    commercialDistrict: commercial,
  };

  const fs = await import('fs');
  const path = await import('path');
  const outDir = path.join(process.cwd(), 'docs', 'test0826');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'raw_api_response.json'), JSON.stringify(output, null, 2), 'utf-8');
  console.log('\n[완료] docs/test0826/raw_api_response.json 저장됨');

  // 요약 출력
  if (vwItem) {
    console.log('\n=== V-World 토지특성 ===');
    console.log(`용도지역: ${vwItem.prposArea1Nm}`);
    console.log(`공시지가: ${Number(vwItem.pblntfPclnd).toLocaleString()}원/㎡`);
    console.log(`지목: ${vwItem.lndcgrCodeNm} | 면적: ${vwItem.lndpclAr}㎡`);
    console.log(`형상: ${vwItem.tpgrphFrmCodeNm} | 지형: ${vwItem.tpgrphHgCodeNm} | 도로: ${vwItem.roadSideCodeNm}`);
  }
}

main().catch(console.error);
