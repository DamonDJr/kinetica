import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { buildProfileContext, SYSTEM_COACH } from "@/lib/ai-prompts";
import { generateProgressionTips } from "@/lib/progression";
import { sendPushToProfile } from "@/lib/push";
import type { Profile } from "@prisma/client";

export const maxDuration = 30;

type ProgramMeta = {
  name: string;
  description: string;
  coachNote: string;
};

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

type WeekSession = {
  dayNumber: number;
  name: string;
  focus: string;
  notes: string;
  exercises: Exercise[];
  conditionTips?: ConditionTip[];
};

async function runFullGeneration(programId: string, profile: Profile) {
  try {
    const program = await db.workoutProgram.findUnique({ where: { id: programId } });
    if (!program) throw new Error("Program not found");

    const { weeks, daysPerWeek, goal, difficulty, name: programName, userNotes } = program;

    let conditions: string[] = [];
    try { conditions = JSON.parse(profile.conditions) as string[]; } catch {}
    const hasConditions = conditions.length > 0;

    // One AI call per week, returning the schedule AND exercises together.
    // This used to be 1 + daysPerWeek calls per week; collapsing them cuts
    // generation time dramatically since each call pays fixed prompt/startup
    // overhead on a local model.
    for (let weekNum = 1; weekNum <= weeks; weekNum++) {
      const firstDay = (weekNum - 1) * daysPerWeek + 1;
      const lastDay = weekNum * daysPerWeek;
      const weekContext =
        weekNum === 1
          ? "Week 1 — foundation week, establish baseline and build habits"
          : weekNum === weeks
          ? `Week ${weekNum} — final peak week, maximum challenge and intensity`
          : `Week ${weekNum} of ${weeks} — progressive step up from last week`;

      // Progress: dayNum 0 renders as "Wk N/T — planning" in the banner.
      await db.workoutProgram.update({
        where: { id: programId },
        data: {
          generationProgress: JSON.stringify({ weekNum, totalWeeks: weeks, dayNum: 0, totalDays: daysPerWeek }),
        },
      });

      const weekUserPrompt = `
${buildProfileContext(profile)}

Program: "${programName}" — ${weeks}-week ${goal} program, ${difficulty} difficulty.${userNotes ? `\nUser's specific goals and notes for THIS program: ${userNotes}` : ""}

Generate ${weekContext}, complete with exercises for every session.
This week is days ${firstDay} through ${lastDay} (${daysPerWeek} sessions).

IMPORTANT: This program's primary focus is "${goal}"${userNotes ? ` and the user notes above` : ""}. Use the profile's "Fitness goals" (with their parenthetical details) as supporting context — weave them in where they naturally fit, but do not let them override the program's focus. If a profile goal lists specific skills or details in parentheses, treat those as the only skill work to consider; do not invent other skills.

Balance muscle groups. Use a logical weekly split appropriate for ${daysPerWeek} days/week and the user's goals.
Each session should be 35–55 minutes: a warmup (2-3 exercises), main work (4-6 exercises), and a cooldown (1-2 exercises).
Adjust for the user's health conditions and available equipment.
${hasConditions ? `The user has: ${conditions.join(", ")}. For each session, include practical, specific tips for exercising safely with these conditions during that session type — one tip per condition, actionable and session-specific (not generic advice).` : ""}

Return JSON with exactly ${daysPerWeek} sessions:
{
  "sessions": [
    {
      "dayNumber": number,
      "name": "string — e.g. 'Day ${firstDay} — Lower Body Flexibility'",
      "focus": "string — specific muscles/areas, e.g. 'hamstrings, hip flexors, calves'",
      "notes": "string — one coaching sentence for this session",
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
          "tip": "string — 1-2 sentence practical tip for this session type"
        }
      ]` : ""}
    }
  ]
}

dayNumber must run from ${firstDay} to ${lastDay} in order.`;

      const weekResult = await generateJSON<{ sessions: WeekSession[] }>(SYSTEM_COACH, weekUserPrompt, {
        // A full week of exercises is a big response — scale the cap so long
        // weeks don't truncate mid-JSON.
        maxTokens: Math.max(6000, daysPerWeek * 2500),
      });
      if (!weekResult?.sessions?.length) {
        throw new Error(`Week ${weekNum} generation failed — AI returned empty response`);
      }

      // Sessions with missing/empty exercises are still created: the program
      // page offers per-session regeneration, so one weak spot shouldn't sink
      // the whole run.
      const sessionData = weekResult.sessions.slice(0, daysPerWeek).map((s, i) => ({
        dayNumber: firstDay + i,
        name: s.name ?? `Day ${firstDay + i}`,
        focus: s.focus ?? "",
        exercises: JSON.stringify(Array.isArray(s.exercises) ? s.exercises : []),
        conditionTips: JSON.stringify(Array.isArray(s.conditionTips) ? s.conditionTips : []),
        notes: s.notes ?? null,
        programId,
      }));

      await Promise.all(sessionData.map((s) => db.programSession.create({ data: s })));
    }

    // Program-level progressive overload plan. Non-fatal: the sessions are
    // already complete, and the UI offers a retry button when tips are missing.
    await generateProgressionTips(program, profile).catch((err) =>
      console.error("Progression tips generation failed:", err)
    );

    // Mark done
    await db.workoutProgram.update({
      where: { id: programId },
      data: {
        generationStatus: "done",
        generationProgress: "{}",
      },
    });

    await sendPushToProfile(profile.id, {
      title: "Program ready!",
      body: `Your workout program "${program.name}" has been generated.`,
      url: `/workouts/programs/${programId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("runFullGeneration error:", err);
    await db.workoutProgram
      .update({
        where: { id: programId },
        data: {
          generationStatus: "error",
          generationProgress: JSON.stringify({ error: message }),
        },
      })
      .catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { goal = "general", weeks = 4, daysPerWeek = 3, difficulty = "beginner", freeForm } = await req.json();

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
      generationStatus: "generating",
      generationProgress: "{}",
    },
  });

  // Fire-and-forget — Node.js keeps running after response
  runFullGeneration(program.id, profile);

  return NextResponse.json({ programId: program.id, programName: program.name });
}
