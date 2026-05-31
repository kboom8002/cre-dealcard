const token = "73b7ea41a9075237a13fef70efbbedd75616a60a936dfafbe8e95d31f8e0fb71";

async function testMobileIm() {
  try {
    const res = await fetch("https://cre-fullim.vercel.app/api/mobile-im/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        handoff_token: token,
        supplemental: {
          monthly_rent_total_krw: 5000000, 
          vacancy_status: "85%",
          photo_urls: []
        }
      }),
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body length:", text.length);
    console.log("Body preview:", text.substring(0, 500));
  } catch (err) {
    console.error("Fetch threw error:", err);
  }
}

testMobileIm();
