import { NextRequest } from "next/server";
import { buildSystemPrompt } from "@/lib/claude";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicle = {
    year: searchParams.get("year") ?? "",
    make: searchParams.get("make") ?? "",
    model: searchParams.get("model") ?? "",
    repairType: searchParams.get("repairType") ?? "",
  };
  return Response.json({ prompt: buildSystemPrompt(vehicle) });
}
