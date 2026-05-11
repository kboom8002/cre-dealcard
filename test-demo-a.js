fetch('http://localhost:3002/api/public/building-radar/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input: '강남구 테헤란로 123',
    inputType: 'address',
    userPurpose: 'buy_consideration'
  })
}).then(res => res.json()).then(console.log).catch(console.error);
