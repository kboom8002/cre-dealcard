const token = "73b7ea41a9075237a13fef70efbbedd75616a60a936dfafbe8e95d31f8e0fb71";
const mvpBaseUrl = "https://cre-dealcard.vercel.app";

async function testFetch() {
  try {
    const res = await fetch(`${mvpBaseUrl}/api/full-im-handoffs/${token}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-service-api-key": "mock-inter-service-key",
      },
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
  } catch (err) {
    console.error("Fetch threw error:", err);
  }
}

testFetch();
