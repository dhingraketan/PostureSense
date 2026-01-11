import { NextResponse } from "next/server";
import { getGemini, getModelName } from "@/lib/gemini/serverClient";
import { extractJson } from "@/lib/gemini/json";
import { SYSTEM_RULES, summaryPrompt } from "@/lib/gemini/prompts";
import { fallbackSummary } from "@/lib/gemini/fallback";

export async function POST(req: Request) {
  let payload: any = {};
  try {
    payload = await req.json();

    const ai = getGemini();
    const result = await ai.models.generateContent({
      model: getModelName(),
      contents: [
        {
          role: "user",
          parts: [{ text: SYSTEM_RULES + "\n" + summaryPrompt(payload) }],
        },
      ],
    });

    const text = result.text ?? "";
    if (!text) {
    return NextResponse.json(fallbackSummary(payload)); // or fallbackCoach(payload)
    }
    const json = extractJson(text);
    return NextResponse.json(json);


  } catch (e: any) {
    const msg = e?.message ?? "";

    // If Gemini quota exceeded, return fallback insights instead of failing
    if (
      msg.includes("429") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("Quota exceeded")
    ) {
      return NextResponse.json(fallbackSummary(payload));
    }

    return new NextResponse(msg || "Summary API error", { status: 500 });
  }
}
