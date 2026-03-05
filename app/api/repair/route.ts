import { NextRequest } from "next/server";
import { anthropic, buildAnalyzePrompt } from "@/lib/claude";

export const runtime = "nodejs";

type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };
};
type TextBlock = { type: "text"; text: string };
type ContentBlock = TextBlock | ImageBlock;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vehicle, image, repairType, previousStep = 0 } = body;

  if (!vehicle?.year || !vehicle?.make || !vehicle?.model || !repairType) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const systemPrompt = buildAnalyzePrompt({
    ...vehicle,
    repairType,
    previousStep,
  });

  const content: ContentBlock[] = [];

  if (image) {
    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const mediaType = image.startsWith("data:image/png")
      ? ("image/png" as const)
      : image.startsWith("data:image/webp")
      ? ("image/webp" as const)
      : ("image/jpeg" as const);
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
  }

  content.push({
    type: "text",
    text: previousStep === 0
      ? `Start the ${repairType} repair. ${image ? "I've pointed my camera at the car." : "Guide me on where to look first."}`
      : `I completed step ${previousStep}. ${image ? "Here's what my camera sees now." : "What's next?"}`,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";

  // Strip any markdown code fences Claude might add
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return Response.json(parsed);
  } catch {
    // Fallback if JSON parsing fails
    return Response.json({
      step: previousStep + 1,
      totalSteps: 5,
      instruction: raw.slice(0, 120),
      highlight: null,
      highlightLabel: null,
      safetyWarning: null,
      done: false,
      nextAction: "Continue with the repair.",
    });
  }
}
