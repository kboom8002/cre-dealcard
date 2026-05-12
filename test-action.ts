import { createHandoff } from "./src/domain/handoff/handoff";

async function testAction() {
  try {
    console.log("Starting createHandoff...");
    const handoff = await createHandoff({
      sourceBuildingSsotLiteId: "03f44849-2777-4345-9342-d204b785d750",
      requestedOutput: "im_lite",
      actorRole: "broker",
      sourceVisibilityLevel: "public_blind",
    }, null);
    
    console.log("Handoff created:", handoff.handoff_token);

    const fullImApiUrl = "https://cre-fullim.vercel.app";
    console.log("Fetching...", `${fullImApiUrl}/api/mobile-im/create`);
    const res = await fetch(`${fullImApiUrl}/api/mobile-im/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        handoff_token: handoff.handoff_token,
        supplemental: {
          monthly_rent_total_krw: 5000000, 
          vacancy_status: "85%",
          photo_urls: []
        }
      })
    });
    
    if (!res.ok) {
        console.error("Not ok! status:", res.status);
        console.error("Body:", await res.text());
    } else {
        console.log("Success! status:", res.status);
        console.log("Body:", await res.text());
    }
  } catch (err) {
    console.error("Caught error:", err);
  }
}
testAction();
