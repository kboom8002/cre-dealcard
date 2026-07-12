const key = 'fb53be41503ab6f3dfa8db52a647d4c172c98aea38e4b042af7e4664809e4be9';

// Test 1: sigunguCd only (minimal params)
const url1 = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?ServiceKey=${key}&sigunguCd=11680&numOfRows=5&pageNo=1&_type=json`;
const r1 = await fetch(url1);
const d1 = await r1.json();
console.log('Test 1 (sigunguCd only):', JSON.stringify(d1).substring(0, 500));

// Test 2: real-transaction API (different service)
const url2 = `https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade?ServiceKey=${key}&LAWD_CD=11680&DEAL_YMD=202606&numOfRows=5&pageNo=1&_type=json`;
const r2 = await fetch(url2);
const d2 = await r2.text();
console.log('\nTest 2 (실거래가):', d2.substring(0, 500));
