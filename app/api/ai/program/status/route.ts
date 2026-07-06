import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/ai/program/status?id=xxx
// Returns { status, progress, name, programId }
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const program = await db.workoutProgram.findUnique({ where: { id } });
  if (!program || program.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let progress: Record<string, unknown> = {};
  try { progress = JSON.parse(program.generationProgress) as Record<string, unknown>; } catch {}

  return NextResponse.json({
    status: program.generationStatus,
    progress,
    name: program.name,
    programId: program.id,
  });
}
