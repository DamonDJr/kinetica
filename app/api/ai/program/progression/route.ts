import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateProgressionTips } from "@/lib/progression";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { programId } = await req.json();
  const program = await db.workoutProgram.findUnique({ where: { id: programId } });
  if (!program || program.profileId !== profile.id) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  const tips = await generateProgressionTips(program, profile);
  if (!tips) {
    return NextResponse.json({ error: "AI did not return valid tips. Is LM Studio running?" }, { status: 500 });
  }

  return NextResponse.json({ tips });
}
