async function test() {
  const memo = "김대표님 조건. 예산은 50억에서 80억 정도.";
  const res = await fetch("https://cre-dealcard.vercel.app/api/broker/buyer-intents/from-memo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo })
  });
  
  console.log("Status:", res.status);
  console.log("Response:", await res.text());
}
test();
