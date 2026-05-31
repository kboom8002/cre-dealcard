import * as fs from "fs";
import * as path from "path";

// ── Super-robust dotenv polyfill to avoid external module dependency ──
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index === -1) return;
      const key = trimmed.substring(0, index).trim();
      let val = trimmed.substring(index + 1).trim();
      // Remove surrounding quotes if any
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    });
  }
}

// Execute environment loading FIRST
loadEnvLocal();

async function runSeed() {
  // Dynamically import to ensure environment variables are loaded
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const { generateSeedQuestions } = await import("../src/domain/agora/qis-seed-generator");
  const { generateAIAnswer } = await import("../src/domain/agora/ai-answer-generator");

  const supabase = createServiceClient();
  const seeds = generateSeedQuestions();
  
  const rows = seeds.map((seed) => {
    const aiResult = generateAIAnswer({
      questionTitle:   seed.title,
      questionContent: seed.content,
      category:        seed.category,
      region:          seed.region,
    });

    return {
      title:                seed.title,
      content:              seed.content,
      category:             seed.category,
      region:               seed.region,
      author_id:            null,
      author_name:          seed.authorName,
      is_seed:              true,
      tags:                 seed.tags,
      is_hot:               false,
      ai_answer:            `${aiResult.content}\n\n${aiResult.disclaimer}`,
      matched_deal_ids:     [],
      market_report_region: aiResult.marketReportRegion,
      status:               "published",
    };
  });

  console.log("Cleaning up old seed agora_threads...");
  await supabase
    .from("agora_threads")
    .delete()
    .eq("is_seed", true);

  console.log("Seeding new agora_threads database table in progress...");
  
  const { data, error } = await supabase
    .from("agora_threads")
    .insert(rows)
    .select("id, title, author_name");

  if (error) {
    console.error("Failed to seed agora_threads:", error.message);
    process.exit(1);
  }

  console.log(`Successfully seeded ${data?.length ?? 0} agora threads into the database!`);
  process.exit(0);
}

runSeed().catch((err) => {
  console.error("Unexpected error in seeding:", err);
  process.exit(1);
});
