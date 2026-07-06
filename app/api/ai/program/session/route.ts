import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { buildProfileContext, SYSTEM_COACH } from "@/lib/ai-prompts";

export const maxDuration = 120;

type Exercise = {
  name: string;
  type?: "warmup" | "main" | "cooldown";
  sets: number;
  reps: string;
  rest: string;
  notes: string;
};

type ConditionTip = {
  condition: string;
  tip: string;
};

type SessionResult = {
  exercises: Exercise[];
  conditionTips: ConditionTip[];
};

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const programSession = await db.programSession.findUnique({
    where: { id: sessionId },
    include: { program: true },
  });
  if (!programSession || programSession.program.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { program } = programSession;
  const weekNum = Math.ceil(programSession.dayNumber / program.daysPerWeek);

  // Parse conditions for the tip section
  let conditions: string[] = [];
  try { conditions = JSON.parse(profile.conditions) as string[]; } catch {}
  const hasConditions = conditions.length > 0;

  const userPrompt = `
${buildProfileContext(profile)}

Program: "${program.name}" — ${program.weeks} weeks, ${program.goal} goal, ${program.difficulty} difficulty.${program.userNotes ? `\nUser's specific goals: ${program.userNotes}` : ""}
This is Week ${weekNum} of ${program.weeks}.

Generate exercises for this specific session:
- Session name: ${programSession.name}
- Muscle focus: ${programSession.focus}
- Week context: ${weekNum === 1 ? "Week 1 — establish baseline, prioritize form" : weekNum === program.weeks ? "Final week — peak effort, maximum challenge" : `Week ${weekNum} — progressive step up`}

IMPORTANT: All exercises must directly serve the user's stated goals and profile. Do not include exercises that weren't requested or aren't relevant to their focus areas.

Include a warmup (2-3 exercises), main work (4-6 exercises), and cooldown (1-2 exercises).
Adjust for the user's health conditions and available equipment.
${hasConditions ? `The user has: ${conditions.join(", ")}. Include practical, specific tips for exercising safely with these conditions during THIS type of session (${programSession.focus}).` : ""}

Return JSON:
{
  "exercises": [
    {
      "name": "string",
      "type": "warmup" | "main" | "cooldown",
      "sets": number,
      "reps": "string",
      "rest": "string",
      "notes": "string — form cue or modification"
    }
  ]${hasConditions ? `,
  "conditionTips": [
    {
      "condition": "string — condition name exactly as given",
      "tip": "string — 1-2 sentence practical tip specific to this session type and their condition"
    }
  ]` : ""}
}
${hasConditions ? `Provide one tip per condition. Tips must be actionable and session-specific (not generic advice).` : ""}`;

  const result = await generateJSON<SessionResult>(SYSTEM_COACH, userPrompt);
  if (!result?.exercises?.length) {
    return NextResponse.json({ error: "Exercise generation failed" }, { status: 500 });
  }

  const conditionTips = result.conditionTips ?? [];

  const updated = await db.programSession.update({
    where: { id: sessionId },
    data: {
      exercises: JSON.stringify(result.exercises),
      conditionTips: JSON.stringify(conditionTips),
    },
  });

  return NextResponse.json({ exercises: result.exercises, conditionTips, session: updated });
}
