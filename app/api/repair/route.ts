import { NextRequest } from "next/server";
import { anthropic, buildSystemPrompt } from "@/lib/claude";
import type { HistoryEntry } from "@/lib/types";

export const runtime = "nodejs";

type ImageSource = {
  type: "base64";
  media_type: "image/jpeg" | "image/png" | "image/webp";
  data: string;
};

function toImageBlock(dataUrl: string) {
  const data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const mediaType: ImageSource["media_type"] = dataUrl.startsWith("data:image/png")
    ? "image/png"
    : dataUrl.startsWith("data:image/webp")
    ? "image/webp"
    : "image/jpeg";
  return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data } };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vehicle, image, repairType, history = [] }: {
    vehicle: { year: string; make: string; model: string };
    image: string | null;
    repairType: string;
    history: HistoryEntry[];
  } = body;

  if (!vehicle?.year || !vehicle?.make || !vehicle?.model || !repairType) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Build multi-turn conversation — last 4 steps for context (keeps payload manageable)
  const recentHistory = history.slice(-4);
  type MessageParam = { role: "user" | "assistant"; content: string | Array<{ type: string; [key: string]: unknown }> };
  const messages: MessageParam[] = [];

  for (const entry of recentHistory) {
    const userContent: Array<{ type: string; [key: string]: unknown }> = [];
    if (entry.image) userContent.push(toImageBlock(entry.image));
    userContent.push({ type: "text", text: `Step ${entry.result.step}: this is what my camera showed.` });
    messages.push({ role: "user", content: userContent });
    messages.push({ role: "assistant", content: JSON.stringify(entry.result) });
  }

  // Current user turn
  const currentContent: Array<{ type: string; [key: string]: unknown }> = [];
  if (image) currentContent.push(toImageBlock(image));
  currentContent.push({
    type: "text",
    text: history.length === 0
      ? `Start the ${repairType} repair.${image ? " Here is what my camera sees." : " Guide me on where to look first."}`
      : `Here is what my camera sees now. What should I do next?`,
  });
  messages.push({ role: "user", content: currentContent });

  // Stream response so frontend gets highlight early
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: buildSystemPrompt({ ...vehicle, repairType }),
    messages: messages as Parameters<typeof anthropic.messages.stream>[0]["messages"],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
