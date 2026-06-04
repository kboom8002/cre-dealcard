import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import OpenAI from "openai";

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log("API Key loaded (first 10 chars):", apiKey?.slice(0, 10));

  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10,
    });
    console.log("SUCCESS:", response.choices[0].message.content);
  } catch (error) {
    console.error("OPENAI ERROR:", error);
  }
}

testOpenAI();
