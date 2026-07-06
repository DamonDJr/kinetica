import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { planImportPrompt } from "@/lib/ai-prompts";

export const maxDuration = 120;

type ImportedSession = {
  dayNumber: number;
  name: string;
  focus: string;
  notes: string;
  exercises: Array<{
    name: string;
    type?: "warmup" | "main" | "cooldown";
    sets: number;
    reps: string;
    rest: string;
    notes: string;
  }>;
  conditionTips: Array<{ condition: string; tip: string }>;
};

type ImportedProgram = {
  name: string;
  description: string;
  coachNote: string;
  weeks: number;
  daysPerWeek: number;
  goal: string;
  difficulty: string;
  warnings: string[];
  sessions: ImportedSession[];
};

const ALLOWED_GOAL = ["strength", "hypertrophy", "endurance", "fat-loss", "mobility", "general"];
const ALLOWED_DIFFICULTY = ["beginner", "intermediate", "advanced"];

// Deterministic import for already-structured JSON plans. Avoids round-tripping
// well-formed data through the LLM (which truncates large plans and can mangle
// exercises). Returns null if the text isn't JSON we recognise, so the caller
// falls back to the AI parser for free-form text.
function tryParseStructuredPlan(text: string): ImportedProgram | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  // Accept a bare array of days, or an object wrapping one under `days`/`week`.
  let days: unknown[] | null = null;
  if (Array.isArray(data)) {
    days = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.days)) days = obj.days;
    else if (Array.isArray(obj.week)) days = obj.week;
    else if (Array.isArray(obj.sessions)) days = obj.sessions;
  }
  if (!days || days.length === 0) return null;

  // Only treat it as a plan if the entries actually look like workout days.
  const looksLikePlan = days.every(
    (d) =>
      d != null &&
      typeof d === "object" &&
      (Array.isArray((d as Record<string, unknown>).circuits) ||
        Array.isArray((d as Record<string, unknown>).exercises)),
  );
  if (!looksLikePlan) return null;

  const str = (v: unknown): string => (v == null ? "" : String(v).trim());

  const mapExercise = (
    ex: Record<string, unknown>,
    type: "warmup" | "main" | "cooldown",
    fallbackRest: string,
  ): ImportedSession["exercises"][number] => {
    const note = str(ex.note ?? ex.notes);
    const target = str(ex.target);
    const notes = [note, target ? `Target: ${target}` : ""].filter(Boolean).join(" — ");
    const setsRaw = Number(ex.sets);
    return {
      name: str(ex.name) || "Exercise",
      type,
      sets: Number.isFinite(setsRaw) && setsRaw > 0 ? setsRaw : 1,
      reps: str(ex.reps),
      rest: str(ex.rest) || fallbackRest,
      notes,
    };
  };

  const sessions: ImportedSession[] = days.map((dRaw, i) => {
    const d = dRaw as Record<string, unknown>;
    const exercises: ImportedSession["exercises"] = [];

    const warmup = str(d.warmup);
    if (warmup) {
      exercises.push({ name: "Warm-up", type: "warmup", sets: 1, reps: warmup, rest: "", notes: "" });
    }

    const circuits = Array.isArray(d.circuits) ? d.circuits : [];
    for (const cRaw of circuits) {
      const c = (cRaw ?? {}) as Record<string, unknown>;
      const circuitRest = str(c.rest);
      const circuitName = str(c.name);
      const exList = Array.isArray(c.exercises) ? c.exercises : [];
      for (const exRaw of exList) {
        const mapped = mapExercise((exRaw ?? {}) as Record<string, unknown>, "main", circuitRest);
        if (circuitName && circuits.length > 1) {
          mapped.notes = [`${circuitName}`, mapped.notes].filter(Boolean).join(" · ");
        }
        exercises.push(mapped);
      }
    }

    // Some plans put exercises directly on the day instead of in circuits.
    const directEx = Array.isArray(d.exercises) ? d.exercises : [];
    for (const exRaw of directEx) {
      exercises.push(mapExercise((exRaw ?? {}) as Record<string, unknown>, "main", ""));
    }

    const cooldown = str(d.cooldown);
    if (cooldown) {
      exercises.push({ name: "Cool-down", type: "cooldown", sets: 1, reps: cooldown, rest: "", notes: "" });
    }

    const label = str(d.label) || str(d.name);
    const day = str(d.day);
    const equipment = Array.isArray(d.equipment) ? d.equipment.map(str).filter(Boolean) : [];
    const notesParts = [
      day,
      equipment.length ? `Equipment: ${equipment.join(", ")}` : "",
    ].filter(Boolean);

    return {
      dayNumber: i + 1,
      name: label || day || `Day ${i + 1}`,
      focus: str(d.subtitle) || str(d.focus),
      notes: notesParts.join(" · "),
      exercises,
      conditionTips: [],
    };
  });

  const labels = sessions.map((s) => s.name).filter(Boolean);

  return {
    name: "Imported Weekly Plan",
    description: labels.length ? `A ${sessions.length}-day plan: ${labels.join(", ")}.` : "Imported workout plan.",
    coachNote: "Imported your plan exactly as written — every exercise kept as-is.",
    weeks: 4,
    daysPerWeek: sessions.length,
    goal: "general",
    difficulty: "intermediate",
    warnings: [
      "Imported as-is from structured data — no automatic safety swaps were applied. Review the exercises against your conditions.",
    ],
    sessions,
  };
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const planText = typeof body.text === "string" ? body.text.trim() : "";
  const setActive = !!body.setActive;
  const dryRun = !!body.dryRun;

  if (planText.length < 30) {
    return NextResponse.json({ error: "Plan text is too short to parse" }, { status: 400 });
  }

  // Fast-path: if the user pasted structured JSON, map it directly instead of
  // round-tripping through the LLM (which truncates large plans at max_tokens).
  let parsed = tryParseStructuredPlan(planText);
  if (!parsed) {
    const { system, user } = planImportPrompt(profile, planText);
    parsed = await generateJSON<ImportedProgram>(system, user, { maxTokens: 8000 });
  }

  if (!parsed?.name || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
    return NextResponse.json(
      { error: "AI could not parse a program from that text. Try adding more structure (days, exercises, sets/reps)." },
      { status: 422 },
    );
  }

  const goal = ALLOWED_GOAL.includes(parsed.goal) ? parsed.goal : "general";
  const difficulty = ALLOWED_DIFFICULTY.includes(parsed.difficulty) ? parsed.difficulty : "intermediate";
  const weeks = Math.min(Math.max(parsed.weeks || 4, 1), 16);
  const daysPerWeek = Math.min(Math.max(parsed.daysPerWeek || parsed.sessions.length, 1), 7);

  if (dryRun) {
    return NextResponse.json({
      preview: {
        name: parsed.name,
        description: parsed.description,
        coachNote: parsed.coachNote,
        weeks,
        daysPerWeek,
        goal,
        difficulty,
        warnings: parsed.warnings ?? [],
        sessions: parsed.sessions,
      },
    });
  }

  const program = await db.workoutProgram.create({
    data: {
      profileId: profile.id,
      name: parsed.name,
      description: parsed.description ?? "",
      userNotes: "",
      weeks,
      daysPerWeek,
      goal,
      difficulty,
      aiGenerated: true,
      isActive: true,
      generationStatus: "complete",
      importedFromText: planText.slice(0, 16000),
      importSource: "paste",
    },
  });

  await Promise.all(
    parsed.sessions.slice(0, daysPerWeek).map((s, i) =>
      db.programSession.create({
        data: {
          programId: program.id,
          dayNumber: s.dayNumber || i + 1,
          name: s.name ?? `Day ${i + 1}`,
          focus: s.focus ?? "",
          exercises: JSON.stringify(s.exercises ?? []),
          conditionTips: JSON.stringify(s.conditionTips ?? []),
          notes: s.notes ?? null,
        },
      }),
    ),
  );

  if (setActive) {
    await db.profile.update({
      where: { id: profile.id },
      data: { activeProgramId: program.id },
    });
  }

  return NextResponse.json({
    program: { id: program.id, name: program.name },
    coachNote: parsed.coachNote,
    warnings: parsed.warnings ?? [],
  });
}
