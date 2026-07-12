// POST /api/analyze — runs the AI analysis + guardrail pipeline.
// Body: { customerMessage, context, images?, claimEvidenceVerified?, isCourierPromise?, isSensitiveAction? }
// Returns the structured AnalysisOutput + guardrail findings for operator review.

import { NextRequest, NextResponse } from "next/server";
import { analyzeConversation, AnalyzeInput } from "@/lib/ai/analyze";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: AnalyzeInput;
  try {
    body = (await req.json()) as AnalyzeInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.customerMessage || !body?.context) {
    return NextResponse.json(
      { error: "customerMessage and context are required" },
      { status: 400 }
    );
  }

  try {
    const result = await analyzeConversation(body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
