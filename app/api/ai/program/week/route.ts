import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { buildProfileContext, SYSTEM_COACH } from "@/lib/ai-prompts";

export const maxDuration = 60;

type WeekSession = {
  dayNumber: number;
  name: string;
  focus: string;
  durationMin: number;
  notes: string;
};

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { programId, weekNum } = await req.json();
  if (!programId || !weekNum) {
    return NextResponse.json({ error: "programId and weekNum required" }, { status: 400 });
  }

  const program = await db.workoutProgram.findUnique({ where: { id: programId } });
  if (!program || program.profileId !== profile.id) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  const { weeks, daysPerWeek, goal, difficulty, name: programName, userNotes } = program;
  const firstDay = (weekNum - 1) * daysPerWeek + 1;
  const lastDay = weekNum * daysPerWeek;

  const weekContext =
    weekNum === 1
      ? "Week 1 — foundation week, establish baseline and build habits"
      : weekNum === weeks
      ? `Week ${weekNum} — final peak week, maximum challenge and intensity`
      : `Week ${weekNum} of ${weeks} — progressive step up from last week`;

  const userPrompt = `
${buildProfileContext(profile)}

Program: "${programName}" — ${weeks}-week ${goal} program, ${difficulty} difficulty.${userNotes ? `\nUser's specific goals and notes: ${userNotes}` : ""}

Generate the session schedule for ${weekContext}.
This week is days ${firstDay} through ${lastDay} (${daysPerWeek} sessions).

IMPORTANT: Base all sessions directly on the user's stated goals and profile above. Do not add exercises or focuses that aren't aligned with their specific request.

Balance muscle groups. Use a logical weekly split appropriate for ${daysPerWeek} days/week and the user's goals.
Each session should be 35–55 minutes.

Return JSON with exactly ${daysPerWeek} sessions:
{
  "sessions": [
    {
      "dayNumber": number,
      "name": "string — e.g. 'Day ${firstDay} — Lower Body Flexibility'",
      "focus": "string — specific muscles/areas, e.g. 'hamstrings, hip flexors, calves'",
      "durationMin": number,
      "notes": "string — one coaching sentence for this session"
    }
  ]
}

dayNumber must run from ${firstDay} to ${lastDay} in order. No exercises — session names and focus only.`;

  const result = await generateJSON<{ sessions: WeekSession[] }>(SYSTEM_COACH, userPrompt);

  if (!result?.sessions?.length) {
    return NextResponse.json(
      { error: `Week ${weekNum} generation failed — AI returned empty response. Check LM Studio.` },
      { status: 500 }
    );
  }

  // Validate and clamp dayNumbers, then create individually to get IDs back
  const sessionData = result.sessions.slice(0, daysPerWeek).map((s, i) => ({
    dayNumber: firstDay + i,
    name: s.name ?? `Day ${firstDay + i}`,
    focus: s.focus ?? "",
    exercises: "[]",
    conditionTips: "[]",
    notes: s.notes ?? null,
    programId,
  }));

  // createMany doesn't return records in SQLite — create individually
  const createdSessions = await Promise.all(
    sessionData.map((s) => db.programSession.create({ data: s }))
  );

  return NextResponse.json({
    sessions: createdSessions.map((s) => ({ id: s.id, dayNumber: s.dayNumber, name: s.name })),
    weekNum,
  });
}
