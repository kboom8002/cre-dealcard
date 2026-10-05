/* P0 점검: 실지번 PNU 해소 + 건축물대장(표제부/층별개요) 조회 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import fs from 'node:fs';
import { searchAddress } from '../../src/domain/verification/address-resolver';

const TARGETS = [
  { id: 'ig1', kw: '당산동5가 11-47' },
  { id: 'ig2', kw: '쌍림동 114' },
  { id: 'ig3', kw: '창신동 464-6' },
  { id: 'ig4a', kw: '양평동4가 117' },
  { id: 'ig4b', kw: '양평동4가 134' },
  { id: 'ig4c', kw: '양평동4가 125-2' },
];

async function brCall(op: string, pnu: string) {
  const key = process.env.DATA_GO_KR_API_KEY!;
  const sig = pnu.slice(0, 5), bjd = pnu.slice(5, 10), plat = pnu[10] === '2' ? '1' : '0';
  const bun = pnu.slice(11, 15), ji = pnu.slice(15, 19);
  const url = `https://apis.data.go.kr/1613000/BldRgstHubService/${op}?serviceKey=${encodeURIComponent(key)}&sigunguCd=${sig}&bjdongCd=${bjd}&platGbCd=${plat}&bun=${bun}&ji=${ji}&numOfRows=100&pageNo=1&_type=json`;
  const r = await fetch(url);
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    const it = j?.response?.body?.items?.item;
    return Array.isArray(it) ? it : it ? [it] : [];
  } catch { return { error: t.slice(0, 200) }; }
}

(async () => {
  const out: any = {};
  for (const t of TARGETS) {
    const res: any = await searchAddress(t.kw).catch((e: any) => ({ error: String(e) }));
    const list = Array.isArray(res) ? res : (res?.results ?? res?.items ?? []);
    const first = list[0];
    const pnu = first?.pnu ?? first?.PNU ?? null;
    const entry: any = { kw: t.kw, count: list.length, first: first ? { address: first.address ?? first.jibunAddress ?? first.roadAddress, road: first.roadAddress, pnu } : null };
    if (pnu) {
      const title = await brCall('getBrTitleInfo', pnu);
      const flr = await brCall('getBrFlrOulnInfo', pnu);
      entry.title = Array.isArray(title) ? title.map((x: any) => ({ bldNm: x.bldNm, mainPurpsCdNm: x.mainPurpsCdNm, platArea: x.platArea, archArea: x.archArea, totArea: x.totArea, vlRatEstmTotArea: x.vlRatEstmTotArea, bcRat: x.bcRat, vlRat: x.vlRat, grndFlrCnt: x.grndFlrCnt, ugrndFlrCnt: x.ugrndFlrCnt, useAprDay: x.useAprDay, strctCdNm: x.strctCdNm, rideUseElvtCnt: x.rideUseElvtCnt, indrMechUtcnt: x.indrMechUtcnt, indrAutoUtcnt: x.indrAutoUtcnt, oudrMechUtcnt: x.oudrMechUtcnt, oudrAutoUtcnt: x.oudrAutoUtcnt, regstrKindCdNm: x.regstrKindCdNm })) : title;
      entry.floors = Array.isArray(flr) ? flr.map((x: any) => ({ flrGbCdNm: x.flrGbCdNm, flrNo: x.flrNo, flrNoNm: x.flrNoNm, mainPurpsCdNm: x.mainPurpsCdNm, etcPurps: x.etcPurps, area: x.area, strctCdNm: x.strctCdNm, mainAtchGbCdNm: x.mainAtchGbCdNm })) : flr;
    }
    out[t.id] = entry;
    console.log(t.id, t.kw, '→', pnu, entry.first?.address, '| title', Array.isArray(entry.title) ? entry.title.length : entry.title, '| floors', Array.isArray(entry.floors) ? entry.floors.length : entry.floors);
  }
  fs.writeFileSync(process.argv[2] || 'p0_register.json', JSON.stringify(out, null, 2));
})();

