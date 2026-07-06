import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { workoutLogParsePrompt } from "@/lib/ai-prompts";

export const maxDuration = 60;

const ALLOWED_CATEGORY = ["strength", "cardio", "mobility", "hiit", "sport", "other"];

type ParsedWorkout = {
  title: string;
  category: string;
  focus: string;
  durationMin: number | null;
  caloriesBurned: number | null;
  exercises: Array<{ name: string; detail: string }>;
  summary: string;
  coachNote: string;
};

// Takes a free-text description of a self-directed workout and returns a clean,
// structured version for the user to confirm before saving. This route does NOT
// persist anything — the client confirms then POSTs to /api/workouts/log, which
// is the single place that awards XP/streak.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 10) {
    return NextResponse.json({ error: "Describe your workout in a bit more detail." }, { status: 400 });
  }

  const { system, user } = workoutLogParsePrompt(profile, text);
  const parsed = await generateJSON<ParsedWorkout>(system, user);

  if (!parsed?.title) {
    return NextResponse.json(
      { error: "The AI couldn't organize that. You can still save it as-is." },
      { status: 422 },
    );
  }

  const category = ALLOWED_CATEGORY.includes(parsed.category) ? parsed.category : "other";
  const exercises = Array.isArray(parsed.exercises)
    ? parsed.exercises
        .filter((e) => e && typeof e.name === "string" && e.name.trim())
        .map((e) => ({ name: String(e.name).trim(), detail: String(e.detail ?? "").trim() }))
    : [];

  const durationMin =
    typeof parsed.durationMin === "number" && parsed.durationMin > 0
      ? Math.min(Math.round(parsed.durationMin), 600)
      : null;
  const caloriesBurned =
    typeof parsed.caloriesBurned === "number" && parsed.caloriesBurned > 0
      ? Math.min(Math.round(parsed.caloriesBurned), 5000)
      : null;

  return NextResponse.json({
    parsed: {
      title: String(parsed.title).slice(0, 80),
      category,
      focus: String(parsed.focus ?? "").slice(0, 120),
      durationMin,
      caloriesBurned,
      exercises,
      summary: String(parsed.summary ?? "").slice(0, 280),
      coachNote: String(parsed.coachNote ?? "").slice(0, 280),
    },
  });
}
