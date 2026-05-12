const token = "73b7ea41a9075237a13fef70efbbedd75616a60a936dfafbe8e95d31f8e0fb71";

async function testImport() {
  try {
    const res = await fetch("https://cre-fullim.vercel.app/api/im-projects/import-from-handoff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ handoff_token: token }),
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
  } catch (err) {
    console.error("Fetch threw error:", err);
  }
}

testImport();
