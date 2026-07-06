import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { runNutritionPipeline, type PipelineInput } from "@/lib/nutrition-pipeline";

export const maxDuration = 120;

// Streams the multi-stage analysis pipeline to the client as newline-delimited
// JSON. Each line is a StageEvent: progress updates ({type:"stage"}) followed by
// a terminal {type:"result"} or {type:"error"}. The client renders the current
// stage label on its button so the user can see what the AI is doing.
function streamPipeline(input: PipelineInput): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runNutritionPipeline(input)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: "Pipeline crashed." }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";

  // ── Photo / form-data path ──────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    const extraDescription = (formData.get("description") as string | null) ?? "";

    if (!file && !extraDescription.trim()) {
      return NextResponse.json({ error: "No image or description provided" }, { status: 400 });
    }

    let image: PipelineInput["image"];
    if (file) {
      const bytes = await file.arrayBuffer();
      image = { base64: Buffer.from(bytes).toString("base64"), mimeType: file.type || "image/jpeg" };
    }

    return streamPipeline({ description: extraDescription, image, profileId: profile.id });
  }

  // ── Text description path ─────────────────────────────────────────────────
  const { description } = await req.json();
  if (!description?.trim()) return NextResponse.json({ error: "description required" }, { status: 400 });

  return streamPipeline({ description, profileId: profile.id });
}
