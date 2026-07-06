import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { buildProfileContext, SYSTEM_COACH } from "@/lib/ai-prompts";

export const maxDuration = 60;

type ProgramMeta = {
  name: string;
  description: string;
  coachNote: string;
};

export async function DELETE(req: NextRequest) {
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

  await db.workoutProgram.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { goal = "general", weeks = 4, daysPerWeek = 3, difficulty = "beginner", freeForm } = await req.json();

  // Only generate metadata — sessions are built week-by-week via /api/ai/program/week
  const userPrompt = `
${buildProfileContext(profile)}

I'm designing a ${weeks}-week ${goal} program, ${daysPerWeek} days/week, ${difficulty} difficulty.${freeForm ? `\nUser notes: ${freeForm}` : ""}

Give this program a great name, a 2-sentence description of its arc, and a warm coach note.

Return JSON only:
{
  "name": "string",
  "description": "string",
  "coachNote": "string"
}`;

  const meta = await generateJSON<ProgramMeta>(SYSTEM_COACH, userPrompt);
  if (!meta?.name) {
    return NextResponse.json({ error: "AI did not return valid program metadata. Is LM Studio running?" }, { status: 500 });
  }

  const program = await db.workoutProgram.create({
    data: {
      profileId: profile.id,
      name: meta.name,
      description: meta.description ?? "",
      userNotes: freeForm ?? "",
      weeks,
      daysPerWeek,
      goal,
      difficulty,
      aiGenerated: true,
    },
  });

  return NextResponse.json({ program, coachNote: meta.coachNote });
}
