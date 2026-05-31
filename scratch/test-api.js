fetch('http://localhost:3002/api/broker/buyer-memo/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    buildingId: '1af74f61-8545-4388-8e9e-f7ae2c3c581f',
    buyerIntentId: '3698558e-cbbb-4b4b-bba4-7c4e613039e0',
    tone: 'kakao'
  })
}).then(res => res.json()).then(console.log).catch(console.error);
