import type { Profile, WorkoutProgram } from "@prisma/client";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { buildProfileContext, SYSTEM_COACH } from "@/lib/ai-prompts";

export type ProgressionTip = {
  weeks: string;
  tip: string;
};

/*
 * Generates the program-level "Progressive Overload Plan" — a handful of
 * week-range tips describing how to keep advancing through the program —
 * and saves it on the WorkoutProgram. Returns the tips, or null if the AI
 * call failed (callers treat this as non-fatal).
 */
export async function generateProgressionTips(
  program: WorkoutProgram,
  profile: Profile
): Promise<ProgressionTip[] | null> {
  const { weeks, goal, difficulty, name, userNotes } = program;
  const phaseCount = Math.min(Math.max(2, Math.ceil(weeks / 2)), 5);

  const userPrompt = `
${buildProfileContext(profile)}

Program: "${name}" — ${weeks}-week ${goal} program, ${difficulty} difficulty.${userNotes ? `\nUser's specific goals for THIS program: ${userNotes}` : ""}

Write a progressive overload plan: how the user should increase the challenge as the program advances, so they keep seeing results. Think reps, resistance level, extra rounds, slower tempo, longer holds — concrete levers, not vague "push harder".

Respect the user's health conditions: progression must stay joint-safe and pacing-aware.

Return JSON with exactly ${phaseCount} phases that together cover weeks 1 through ${weeks} in order, no gaps:
{
  "tips": [
    {
      "weeks": "string — e.g. 'Weeks 1–2'",
      "tip": "string — 1-2 sentences, one concrete progression action for this phase"
    }
  ]
}`;

  const result = await generateJSON<{ tips: ProgressionTip[] }>(SYSTEM_COACH, userPrompt);
  const tips = (result?.tips ?? []).filter((t) => t?.weeks && t?.tip);
  if (tips.length === 0) return null;

  await db.workoutProgram.update({
    where: { id: program.id },
    data: { progressionTips: JSON.stringify(tips) },
  });
  return tips;
}
