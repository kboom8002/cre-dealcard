fetch('http://localhost:3002/api/broker/deal-card/from-memo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    memo: '성수동 000-00, 80억대 근생, 1층 A카페 월세 800, 2층 사무실 450. 매도자 빠른 협의 원함.',
    visibilityPreference: 'blind'
  })
}).then(res => res.json()).then(console.log).catch(console.error);
