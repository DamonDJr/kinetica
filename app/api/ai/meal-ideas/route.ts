import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { buildProfileContext, SYSTEM_COACH } from "@/lib/ai-prompts";
import { parseGoals, formatGoalsForPrompt } from "@/lib/utils";
import { webSearch } from "@/lib/search";

export const maxDuration = 45;

type MealIdea = {
  name: string;
  description: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepTime: string;
  tip: string;
};

type IdeasResponse = { ideas: MealIdea[] };

function inferMealTypeFromHour(hour: number): MealIdea["mealType"] {
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 17) return "snack";
  if (hour < 21) return "dinner";
  return "snack";
}

function timeOfDayLabel(hour: number): string {
  if (hour < 5) return "late night";
  if (hour < 11) return "morning";
  if (hour < 14) return "midday";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "late night";
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    freeForm?: string;
    mealType?: MealIdea["mealType"];
  };
  const freeForm = (body.freeForm ?? "").trim();

  const now = new Date();
  const hour = now.getHours();
  const inferredMealType = body.mealType ?? inferMealTypeFromHour(hour);

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const [meals, recentWorkout, activeProgramSession] = await Promise.all([
    db.mealLog.findMany({
      where: { profileId: profile.id, loggedAt: { gte: dayStart } },
      orderBy: { loggedAt: "asc" },
    }),
    db.workoutLog.findFirst({
      where: { profileId: profile.id, completedAt: { gte: fourHoursAgo } },
      orderBy: { completedAt: "desc" },
    }),
    profile.activeProgramId
      ? db.programSession.findFirst({
          where: { programId: profile.activeProgramId, completed: false },
          orderBy: { dayNumber: "asc" },
        })
      : Promise.resolve(null),
  ]);

  const totals = meals.reduce(
    (acc, m) => {
      acc.cal += m.calories;
      acc.protein += m.proteinG;
      acc.carbs += m.carbsG;
      acc.fat += m.fatG;
      return acc;
    },
    { cal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const calorieTarget = profile.calorieTarget ?? 2000;
  const proteinTarget = profile.proteinTargetG ?? 150;
  const carbTarget = profile.carbTargetG ?? 250;
  const fatTarget = profile.fatTargetG ?? 65;
  const remainingCal = Math.max(0, calorieTarget - totals.cal);
  const remainingProtein = Math.max(0, proteinTarget - Math.round(totals.protein));
  const remainingCarbs = Math.max(0, carbTarget - Math.round(totals.carbs));
  const remainingFat = Math.max(0, fatTarget - Math.round(totals.fat));

  const mealsLoggedSummary = meals.length
    ? meals.map((m) => `${m.mealType}: ${m.name} (${m.calories}kcal, ${Math.round(m.proteinG)}g P)`).join("; ")
    : "nothing logged yet today";

  let workoutContext = "No recent workout in the last 4 hours.";
  if (recentWorkout) {
    const minsAgo = Math.round((now.getTime() - new Date(recentWorkout.completedAt).getTime()) / 60000);
    workoutContext = `Just finished "${recentWorkout.title}" ${minsAgo} minutes ago${recentWorkout.durationMin ? ` (${recentWorkout.durationMin} min)` : ""}${recentWorkout.caloriesBurned ? `, ~${recentWorkout.caloriesBurned} kcal burned` : ""}. Consider post-workout recovery (protein + carbs).`;
  } else if (activeProgramSession) {
    workoutContext = `Next program session is "${activeProgramSession.name}" (focus: ${activeProgramSession.focus || "general"}).`;
  }

  // Build a focused search query
  const goals = parseGoals(profile.fitnessGoals);
  let restrictions: string[] = [];
  try { restrictions = JSON.parse(profile.restrictions) as string[]; } catch {}

  const searchTerms = [
    freeForm || `${inferredMealType} ideas`,
    `under ${remainingCal} calories`,
    `high protein`,
    restrictions.length ? restrictions.join(" ") : "",
  ].filter(Boolean).join(" ");

  const snippets = await webSearch(searchTerms, 5);
  const searchBlock = snippets.length
    ? `\nWeb search results (use as inspiration, verify nutrition with your own knowledge):\n${snippets.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
    : "";

  const userPrompt = `
${buildProfileContext(profile)}

Current context:
- Local time: ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (${timeOfDayLabel(hour)})
- Suggested meal type: ${inferredMealType}
- Today so far — ${totals.cal}/${calorieTarget} kcal, ${Math.round(totals.protein)}/${proteinTarget}g protein, ${Math.round(totals.carbs)}/${carbTarget}g carbs, ${Math.round(totals.fat)}/${fatTarget}g fat
- Remaining today: ${remainingCal} kcal, ${remainingProtein}g protein, ${remainingCarbs}g carbs, ${remainingFat}g fat
- Logged today: ${mealsLoggedSummary}
- Workout status: ${workoutContext}
- Fitness goals: ${formatGoalsForPrompt(goals)}
${freeForm ? `\nUser's request: "${freeForm}"` : ""}
${searchBlock}
Suggest 4 meal/snack ideas that fit this context. Each should:
- Match the suggested meal type or the user's request above
- Fit within the remaining calorie and macro budget (don't blow past it)
- Lean toward foods that complement what's already been logged (avoid obvious repeats unless requested)
- Reflect their fitness goals (e.g. higher protein if building muscle, lighter if losing weight)
- Honor dietary restrictions strictly
- Be practical — real foods someone could actually make or grab now

Return JSON only:
{
  "ideas": [
    {
      "name": "string — concise meal name",
      "description": "string — 1 sentence, what it is and why it fits right now",
      "mealType": "breakfast" | "lunch" | "dinner" | "snack",
      "calories": number,
      "proteinG": number,
      "carbsG": number,
      "fatG": number,
      "prepTime": "string — e.g. '5 min', 'no prep', '15 min'",
      "tip": "string — one short helpful note (timing, swap, prep tip)"
    }
  ]
}`.trim();

  const result = await generateJSON<IdeasResponse>(SYSTEM_COACH, userPrompt);
  if (!result?.ideas?.length) {
    return NextResponse.json(
      { error: "AI did not return meal ideas. Is LM Studio running?" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ideas: result.ideas,
    context: {
      remainingCal,
      remainingProtein,
      inferredMealType,
      workoutContext,
      mealsLoggedCount: meals.length,
      searchUsed: snippets.length > 0,
    },
  });
}
