import type { Profile } from "@prisma/client";
import { parseGoals, formatGoalsForPrompt, kgToLb, cmToIn } from "./utils";
import type { CoachContext } from "./coach-context";

function parseJson<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

function formatHeight(totalInches: number | null): string {
  if (!totalInches) return "unknown";
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
}

export function buildProfileContext(profile: Profile): string {
  const conditions = parseJson<string[]>(profile.conditions, []);
  const injuries = parseJson<string[]>(profile.injuries, []);
  const equipment = parseJson<string[]>(profile.equipment, []);
  const goals = parseGoals(profile.fitnessGoals);
  const restrictions = parseJson<string[]>(profile.restrictions, []);

  // heightCm field stores inches; weightKg field stores lbs (imperial throughout)
  return `
User: ${profile.displayName}, age ${profile.age ?? "unknown"}, ${profile.gender ?? "unspecified"}.
Height: ${formatHeight(profile.heightCm)}, Weight: ${profile.weightKg ?? "unknown"} lbs, goal: ${profile.goalWeightKg ?? "unknown"} lbs.
Activity level: ${profile.activityLevel}. Streak: ${profile.streakDays} days.
Health conditions: ${conditions.length ? conditions.join(", ") : "none reported"}.
Injuries: ${injuries.length ? injuries.join(", ") : "none reported"}.
Equipment: ${equipment.length ? equipment.join(", ") : "bodyweight only"}.
Fitness goals: ${formatGoalsForPrompt(goals)}.
Daily targets: ${profile.calorieTarget ?? "?"} kcal, ${profile.proteinTargetG ?? "?"}g protein.
Dietary restrictions: ${restrictions.length ? restrictions.join(", ") : "none"}.${
    profile.goalPhotoDescription
      ? `\nBody goal reference photo: ${profile.goalPhotoDescription}${
          profile.goalPhotoNotes ? ` User's own note on it: "${profile.goalPhotoNotes}"` : ""
        }`
      : ""
  }
`.trim();
}

export const SYSTEM_COACH = `
You are Kinetica, the AI coach inside a family fitness app. You coach like an experienced personal trainer who knows this user's history and genuinely wants them to reach their goals — not like a generic wellness bot.

COACHING PRINCIPLES
1. Coach toward the user's stated goals. Every recommendation should visibly connect to a goal they set. If their recent behavior is drifting away from a goal, name it — gently, but clearly.
2. Be specific and evidence-based. Cite the user's actual numbers (grams, pounds, sessions, hours) from the data you're given. "You averaged 92g protein against a 150g target" beats "try to eat more protein." Never invent numbers that aren't in the data.
3. Celebrate real wins loudly and by name — specificity is what makes praise land. But never manufacture praise for things that didn't happen; honest assessment is what makes the celebration mean something.
4. Favor progressive overload and sustainable habits: one small, concrete next step the user can take today. No overhauls, no lists of five changes at once.
5. When the data shows a plateau or a slide, say so plainly and offer one corrective action. Frame it with curiosity ("let's figure out what's in the way"), never blame.

SAFETY & CONDITIONS
- You never diagnose medical conditions. For pain or injuries, always recommend consulting a professional.
- Always adapt recommendations to the user's listed health conditions and injuries:
  - ADHD: keep advice short, novel, dopamine-rewarding; one action at a time.
  - POTS: seated alternatives, hydration + electrolyte reminders, pacing.
  - hEDS/hypermobility: avoid high-impact and ballistic loading; prioritize stabilization and controlled range of motion.
  - Chronic fatigue: rest is part of training, not failure; never push through crashes.

VOICE
- Warm, calm, human. Never clinical, never shaming, never corporate.
- Address the user by name when it feels natural.
- Celebrate effort AND direction: the goal is true growth toward what they said they want, not activity for its own sake.
`.trim();

export function workoutPlanPrompt(profile: Profile, opts: {
  duration: number;
  difficulty: string;
  category: string;
}) {
  return {
    system: SYSTEM_COACH,
    user: `
${buildProfileContext(profile)}

Generate a ${opts.duration}-minute ${opts.difficulty} ${opts.category} workout plan.

Return JSON in this exact format:
{
  "title": "string",
  "description": "string — 1-2 sentences, warm and motivating",
  "warmup": [
    { "name": "string", "duration": "string", "notes": "string" }
  ],
  "exercises": [
    {
      "name": "string",
      "sets": number,
      "reps": "string",
      "rest": "string",
      "notes": "string — form tips, modifications for their conditions"
    }
  ],
  "cooldown": [
    { "name": "string", "duration": "string", "notes": "string" }
  ],
  "coachNote": "string — personal encouragement from the coach"
}
`.trim(),
  };
}

export function mealSuggestionPrompt(profile: Profile, opts: {
  mealType: string;
  remainingCalories: number;
}) {
  return {
    system: SYSTEM_COACH,
    user: `
${buildProfileContext(profile)}

Suggest 3 ${opts.mealType} options that fit within approximately ${opts.remainingCalories} remaining calories today.
Calorie target: ${profile.calorieTarget ?? 2000} kcal.
Protein target: ${profile.proteinTargetG ?? 150}g.

Return JSON:
{
  "suggestions": [
    {
      "name": "string",
      "description": "string",
      "calories": number,
      "proteinG": number,
      "carbsG": number,
      "fatG": number,
      "prepTime": "string",
      "tip": "string — brief helpful note"
    }
  ]
}
`.trim(),
  };
}

function fmtTime(d: Date | null): string {
  if (!d) return "never";
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function formatJournalBlock(journal: CoachContext["recent"]["journal14d"]): string {
  if (journal.entriesLogged === 0) return "no journal entries recently";
  const wins = journal.wins.length
    ? `Recent wins they logged: ${journal.wins.map((w) => `"${w.content.slice(0, 120)}" (${w.context}, ${fmtTime(w.loggedAt)})`).join("; ")}.`
    : "No wins logged recently.";
  const latest = journal.latestEntries[0];
  return `${journal.entriesLogged} entries in 14d, avg mood ${journal.avgMood}/5. Latest: "${latest.content.slice(0, 140)}" (mood ${latest.mood}/5, ${latest.context}, ${fmtTime(latest.loggedAt)}). ${wins}`;
}

export function nudgeDecisionPrompt(ctx: CoachContext) {
  const { profile, targets, today, recent, program, measurements } = ctx;
  const proteinPct = targets.proteinG ? Math.round((today.meals.totals.proteinG / targets.proteinG) * 100) : null;
  const calPct = targets.calories ? Math.round((today.meals.totals.calories / targets.calories) * 100) : null;
  const recentNudgeBodies = recent.insights7d
    .filter((i) => i.type === "nudge")
    .slice(0, 5)
    .map((i) => `  - ${i.content}`)
    .join("\n");

  const wLb = kgToLb(measurements.latest?.weightKg ?? null);
  const wDeltaLb = kgToLb(measurements.deltas30d?.weightKg ?? null);
  const waistIn = cmToIn(measurements.latest?.waistCm ?? null);
  const waistDeltaIn = cmToIn(measurements.deltas30d?.waistCm ?? null);
  const measurementSummary = measurements.latest
    ? [
        wLb != null ? `weight ${wLb}lb` : null,
        wDeltaLb != null ? `Δ30d ${wDeltaLb > 0 ? "+" : ""}${wDeltaLb}lb` : null,
        waistIn != null ? `waist ${waistIn}in` : null,
        waistDeltaIn != null ? `Δ30d ${waistDeltaIn > 0 ? "+" : ""}${waistDeltaIn}in` : null,
      ].filter(Boolean).join(", ") || "n/a"
    : "n/a";

  const sleepLine = recent.sleep7d.lastNight
    ? `last night: ${recent.sleep7d.lastNight.hours}h, quality ${recent.sleep7d.lastNight.quality}/5; 7d avg ${recent.sleep7d.avgHours ?? "n/a"}h; debt ${recent.sleep7d.debtHours}h (${recent.sleep7d.debtSeverity})`
    : "no recent sleep logged";

  const user = `
${profile.displayName} — goals: ${formatGoalsForPrompt(profile.goals)}.
Conditions: ${profile.conditions.length ? profile.conditions.join(", ") : "none"}. Streak: ${profile.streakDays}d.

TODAY (${today.date}):
- Meals: ${today.meals.count} logged. Last: ${today.meals.lastMealType ?? "none"} ${fmtTime(today.meals.lastMealAt)}. Breakfast today: ${today.meals.hasBreakfast ? "yes" : "no"}.
- Calories: ${today.meals.totals.calories}/${targets.calories ?? "?"} (${calPct ?? "?"}%). Protein: ${today.meals.totals.proteinG}/${targets.proteinG ?? "?"}g (${proteinPct ?? "?"}%).
- Water: ${today.water.totalMl}ml. Workout logged today: ${today.workoutLogged ? "yes" : "no"}.${today.caloriesBurned > 0 ? `\n- Burned ${today.caloriesBurned} kcal (${today.activeCaloriesBurned} active + ${today.bmr} resting/BMR) → net ${today.netCalories} kcal.` : ""}

7-DAY PATTERNS:
- Avg calories/day: ${recent.meals7d.avgCaloriesPerDay} (target ${targets.calories ?? "?"}). Avg protein/day: ${recent.meals7d.avgProteinPerDay}g (target ${targets.proteinG ?? "?"}g).
- Breakfast skip rate: ${Math.round(recent.meals7d.breakfastSkipRate * 100)}%.
- Workouts last 14d: ${recent.workouts14d.count}. Last workout: ${fmtTime(recent.workouts14d.lastWorkoutAt)}.
- Sleep: ${sleepLine}.
- Body: ${measurementSummary}.
- Journal/mood: ${formatJournalBlock(recent.journal14d)}

PROGRAM: ${program ? `${program.name} (${program.daysPerWeek}/wk). Next session: ${program.nextSession?.name ?? "all done"}.` : "no active program"}

NUDGE STATE:
- Sent today: ${ctx.nudgeState.sentToday}/${ctx.nudgeState.dailyCap}.
- Last nudge: ${fmtTime(ctx.nudgeState.lastSmartNudgeAt)}.
- Recent nudges (avoid repeating):
${recentNudgeBodies || "  (none)"}

Decide: should we send a push notification right now? Be selective — only nudge when there's a SPECIFIC, ACTIONABLE pattern worth flagging. Skip if:
- They've already done the thing (logged meal recently, worked out today)
- The same nudge was sent recently
- Pattern is normal/healthy
- It would feel naggy

Tie the message to a specific pattern from above (e.g., "you skip breakfast 5/7 days and you're 40g under protein"). If they logged a recent win or their mood is trending up, you can build a nudge on that momentum ("you said the deadlift PR felt great — Pull day is queued up"). If mood is trending low, soften the ask: suggest the smallest useful action, not a full session. Keep body under 110 chars. Title under 30 chars. No emojis required, but okay if they fit.

Return JSON:
{
  "shouldNudge": boolean,
  "reasoning": "string — 1 sentence why or why not, references specific data",
  "type": "meal" | "workout" | "sleep" | "hydration" | "measurement" | "motivation" | "none",
  "title": "string — empty if shouldNudge is false",
  "body": "string — empty if shouldNudge is false",
  "url": "string — relevant app path like /nutrition/smart-log, /workouts, /profile/measurements, /dashboard"
}
`.trim();

  return { system: SYSTEM_COACH, user };
}

export function planImportPrompt(profile: Profile, planText: string) {
  return {
    system: SYSTEM_COACH,
    user: `
${buildProfileContext(profile)}

The user pasted this workout plan and wants to import it into Kinetica:

---PLAN START---
${planText.slice(0, 8000)}
---PLAN END---

Parse it into Kinetica's program structure. If the original is missing details (sets, reps, rest), fill in reasonable defaults aligned with the user's difficulty level and goals.

CRITICAL — adapt for safety:
- For each exercise, check against the user's injuries and conditions.
- If an exercise conflicts (e.g. heavy squats with knee issues, overhead pressing with shoulder issues, high-impact with hEDS/POTS), substitute a safer variation AND record the swap in conditionTips for that session.
- Never silently drop exercises — either keep with modifications or substitute.

If the plan doesn't specify weeks or days/week, infer reasonable values from the structure (e.g. "Push/Pull/Legs" = 3 days/week, repeat for 4 weeks).

Return JSON only:
{
  "name": "string — name from the plan, or generated",
  "description": "string — 1-2 sentences",
  "coachNote": "string — warm welcome note about the import",
  "weeks": number,
  "daysPerWeek": number,
  "goal": "strength" | "hypertrophy" | "endurance" | "fat-loss" | "mobility" | "general",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "warnings": ["string — any safety swaps made or concerns"],
  "sessions": [
    {
      "dayNumber": number,
      "name": "string",
      "focus": "string — muscles/areas",
      "notes": "string — one sentence coaching note",
      "exercises": [
        {
          "name": "string",
          "type": "warmup" | "main" | "cooldown",
          "sets": number,
          "reps": "string",
          "rest": "string",
          "notes": "string — form tips or modification reason"
        }
      ],
      "conditionTips": [
        { "condition": "string", "tip": "string" }
      ]
    }
  ]
}

Sessions cover ONE WEEK (daysPerWeek items). dayNumber starts at 1 and is sequential.
`.trim(),
  };
}

export function workoutLogParsePrompt(profile: Profile, text: string) {
  return {
    system: SYSTEM_COACH,
    user: `
${buildProfileContext(profile)}

${profile.displayName} just finished a workout they put together themselves and wrote this rough description of what they did:

---WORKOUT START---
${text.slice(0, 4000)}
---WORKOUT END---

Organize it into a clean, structured log entry. Do NOT invent exercises that aren't described, but DO tidy up names (e.g. "pushups" → "Push-ups"), normalise sets/reps notation, and infer a sensible title and focus from what's there.

- If a duration is mentioned or implied, set durationMin. Otherwise null.
- Only estimate caloriesBurned if there's enough to go on (exercises + duration); be conservative and use ${profile.displayName}'s body weight (${profile.weightKg ?? "unknown"} lbs) as a rough basis. If you can't reasonably estimate, use null — the user can fill it in.
- For each distinct movement, add an exercise. Put set/rep/time details in "detail" (e.g. "3 × 10", "20 min", "3 sets to failure"). Leave "detail" as "" if none was given.
- summary: one short clean sentence recapping the session.
- coachNote: one warm, specific sentence celebrating that they trained on their own. Address them as ${profile.displayName}.

Return JSON only:
{
  "title": "string — short session title, e.g. 'Push & Core'",
  "category": "strength" | "cardio" | "mobility" | "hiit" | "sport" | "other",
  "focus": "string — muscles/areas worked, short",
  "durationMin": number | null,
  "caloriesBurned": number | null,
  "exercises": [
    { "name": "string", "detail": "string" }
  ],
  "summary": "string",
  "coachNote": "string"
}
`.trim(),
  };
}

export function measurementInsightPrompt(ctx: CoachContext) {
  const { profile, targets, recent, measurements } = ctx;
  if (!measurements.latest) {
    throw new Error("measurementInsightPrompt requires at least one measurement");
  }

  const fmtDelta = (v: number | null, unit: string) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}${unit}`);
  const latest = measurements.latest;
  const d30 = measurements.deltas30d;
  const d90 = measurements.deltas90d;

  const metricsBlock = [
    `weight    ${kgToLb(latest.weightKg) ?? "—"}lb   30d ${fmtDelta(kgToLb(d30?.weightKg ?? null), "lb")}   90d ${fmtDelta(kgToLb(d90?.weightKg ?? null), "lb")}`,
    `body fat  ${latest.bodyFatPct ?? "—"}%    30d ${fmtDelta(d30?.bodyFatPct ?? null, "%")}    90d ${fmtDelta(d90?.bodyFatPct ?? null, "%")}`,
    `waist     ${cmToIn(latest.waistCm) ?? "—"}in   30d ${fmtDelta(cmToIn(d30?.waistCm ?? null), "in")}   90d ${fmtDelta(cmToIn(d90?.waistCm ?? null), "in")}`,
    `chest     ${cmToIn(latest.chestCm) ?? "—"}in   30d ${fmtDelta(cmToIn(d30?.chestCm ?? null), "in")}   90d ${fmtDelta(cmToIn(d90?.chestCm ?? null), "in")}`,
    `arm       ${cmToIn(latest.armCm) ?? "—"}in   30d ${fmtDelta(cmToIn(d30?.armCm ?? null), "in")}   90d ${fmtDelta(cmToIn(d90?.armCm ?? null), "in")}`,
    `thigh     ${cmToIn(latest.thighCm) ?? "—"}in   30d ${fmtDelta(cmToIn(d30?.thighCm ?? null), "in")}   90d ${fmtDelta(cmToIn(d90?.thighCm ?? null), "in")}`,
  ].join("\n");

  const user = `
${profile.displayName} — goals: ${formatGoalsForPrompt(profile.goals)}.
Goal weight: ${profile.goalWeightKg ?? "—"}lb. Current: ${profile.weightKg ?? "—"}lb.
Conditions: ${profile.conditions.length ? profile.conditions.join(", ") : "none"}.

BODY MEASUREMENTS (latest values + change over window):
${metricsBlock}

NUTRITION (7d avg):
- Calories ${recent.meals7d.avgCaloriesPerDay}/${targets.calories ?? "?"} target.
- Protein ${recent.meals7d.avgProteinPerDay}g/${targets.proteinG ?? "?"}g target.

TRAINING (14d): ${recent.workouts14d.count} sessions logged.
JOURNAL: ${formatJournalBlock(recent.journal14d)}

Generate 2-3 specific, actionable insights based on the trends. Look for:
- Recomp signals (e.g., waist down, weight flat → losing fat, gaining muscle)
- Plateaus (e.g., no change in 30d on a target metric)
- Goal alignment (are trends pointing toward their stated goals?)
- Nutrition connection (is protein supporting their measurement goals?)
- Mood connection (if journal mood tracks with training/eating patterns, or a logged win deserves reinforcing with the numbers that back it up)

Each insight: lead with the observation, then a concrete next step. No medical advice.

Return JSON:
{
  "insights": [
    {
      "headline": "string — short observation",
      "body": "string — 1-2 sentences with specific numbers from the data",
      "action": "string — one concrete thing to do",
      "priority": "high" | "medium" | "low"
    }
  ]
}
`.trim();

  return { system: SYSTEM_COACH, user };
}

export function dailyInsightPrompt(profile: Profile, data: {
  workoutsThisWeek: number;
  avgCalories: number;
  avgWaterMl: number;
  streakDays: number;
}) {
  return {
    system: SYSTEM_COACH,
    user: `
${buildProfileContext(profile)}

Weekly summary for ${profile.displayName}:
- Workouts completed this week: ${data.workoutsThisWeek}
- Average daily calories: ${data.avgCalories} kcal (target: ${profile.calorieTarget ?? 2000})
- Average daily water: ${Math.round(data.avgWaterMl / 1000 * 10) / 10}L
- Current streak: ${data.streakDays} days

Generate a brief, warm, personalized insight. Be specific, encouraging, and practical.
Return JSON:
{
  "type": "workout" | "nutrition" | "recovery" | "motivation",
  "headline": "string — short punchy title",
  "body": "string — 2-3 sentences max, personal and warm",
  "action": "string — one concrete thing to do today"
}
`.trim(),
  };
}

export function nutritionTargetsPrompt(ctx: CoachContext) {
  const { profile, targets, recent, measurements } = ctx;
  const wLb = kgToLb(measurements.latest?.weightKg ?? null);
  const wDelta30 = kgToLb(measurements.deltas30d?.weightKg ?? null);
  const wDelta90 = kgToLb(measurements.deltas90d?.weightKg ?? null);
  const waistIn = cmToIn(measurements.latest?.waistCm ?? null);
  const waistDelta30 = cmToIn(measurements.deltas30d?.waistCm ?? null);

  // Profile.weightKg / goalWeightKg actually store lbs (imperial throughout).
  const profileWeightLb = profile.weightKg;
  const profileGoalLb = profile.goalWeightKg;

  const trendLine = wLb != null
    ? `latest weight ${wLb}lb${wDelta30 != null ? ` (30d ${wDelta30 > 0 ? "+" : ""}${wDelta30}lb)` : ""}${wDelta90 != null ? ` (90d ${wDelta90 > 0 ? "+" : ""}${wDelta90}lb)` : ""}${waistIn != null ? `, waist ${waistIn}in${waistDelta30 != null ? ` (30d ${waistDelta30 > 0 ? "+" : ""}${waistDelta30}in)` : ""}` : ""}`
    : "no measurement history yet";

  const user = `
${profile.displayName} — goals: ${formatGoalsForPrompt(profile.goals)}.
Sex: ${profile.gender ?? "unspecified"}. Age: ${profile.age ?? "?"}. Activity: ${profile.activityLevel}.
Profile weight: ${profileWeightLb ?? "?"}lb → goal ${profileGoalLb ?? "?"}lb.
Conditions: ${profile.conditions.length ? profile.conditions.join(", ") : "none"}.

CURRENT TARGETS (may be stale): ${targets.calories ?? "?"} kcal / ${targets.proteinG ?? "?"}g protein per day.

EATING (7d): ${recent.meals7d.avgCaloriesPerDay} kcal/day avg, ${recent.meals7d.avgProteinPerDay}g protein/day avg, breakfast skipped ${Math.round(recent.meals7d.breakfastSkipRate * 100)}% of days.
TRAINING (14d): ${recent.workouts14d.count} sessions.
BODY: ${trendLine}.

Set realistic daily calorie + protein targets that move the user toward their goals, accounting for their actual eating habits and body trend.

Rules:
- If body data shows fat-loss goal but weight is stalling and intake is above target, lower calories ~10-15%.
- If body data shows fat-loss goal and weight is dropping faster than ~1% bodyweight/week, raise calories slightly (avoid muscle loss).
- For muscle gain / recomp goals, protein ≥ 0.8g per lb bodyweight; keep slight surplus.
- For "general health" / maintenance, match estimated TDEE.
- Never recommend <1200 kcal for women or <1500 kcal for men.
- If eating average is wildly different from current target (>30% off), trust the average somewhat — drastic targets get ignored.
- If little data (no measurements + <3 days meals logged), keep current targets and explain.

Also give a daily calorie RANGE (min/max) around the target — a sensible band the
user can land in any given day and still be on track (typically ±150-250 kcal,
wider for maintenance, tighter for aggressive fat-loss). min < calorieTarget < max.

Return JSON only:
{
  "calorieTarget": number,
  "calorieTargetMin": number,
  "calorieTargetMax": number,
  "proteinTargetG": number,
  "carbTargetG": number,
  "fatTargetG": number,
  "reasoning": "string — 2-3 sentences citing the specific data you used",
  "confidence": "high" | "medium" | "low"
}
`.trim();

  return { system: SYSTEM_COACH, user };
}

export function feedbackAdjustNextSessionPrompt(
  ctx: CoachContext,
  justCompleted: {
    name: string;
    exercises: Array<{ name: string; sets: number; reps: string; rest?: string }>;
  },
  feedback: Array<{ exerciseName: string; difficulty: number; note?: string }>,
  sessionNote: string | null,
  nextSession: {
    name: string;
    focus: string;
    exercises: Array<{ name: string; type?: string; sets: number; reps: string; rest?: string; notes?: string }>;
  },
) {
  const feedbackLines = feedback.length
    ? feedback
        .map((f) => `  - ${f.exerciseName}: difficulty ${f.difficulty}/5${f.note ? ` — "${f.note}"` : ""}`)
        .join("\n")
    : "  (no per-exercise feedback)";

  // Difficulty scale: 1 = way too easy, 2 = easy, 3 = just right, 4 = hard, 5 = brutal/failed
  const avgDifficulty = feedback.length
    ? +(feedback.reduce((s, f) => s + f.difficulty, 0) / feedback.length).toFixed(2)
    : null;

  const user = `
${ctx.profile.displayName} just completed: "${justCompleted.name}".
Goals: ${formatGoalsForPrompt(ctx.profile.goals)}.
Conditions: ${ctx.profile.conditions.length ? ctx.profile.conditions.join(", ") : "none"}.

FEEDBACK on the session just done (difficulty scale: 1=way too easy, 2=easy, 3=just right, 4=hard, 5=brutal/failed):
${feedbackLines}
${avgDifficulty != null ? `Average difficulty: ${avgDifficulty}/5.` : ""}
${sessionNote ? `Session note: "${sessionNote}"` : ""}

NEXT PLANNED SESSION: ${nextSession.name} — focus: ${nextSession.focus}.
Exercises:
${JSON.stringify(nextSession.exercises, null, 2)}

Adjust the next session to apply progressive overload (if too easy) or de-load (if struggled). Guidance:
- If most exercises were 1-2 (too easy): bump intensity — add a set on main lifts, or harder reps (lower rep range / heavier implied), or shorter rest.
- If most were 4-5 (struggled): drop a set on the hardest lifts, or easier reps, or longer rest. Don't gut the session.
- 3 (just right): tiny progression — maybe +1 rep on one main lift, or hold steady.
- Match per-exercise hints: if a specific exercise was rated 5 with note "lower back", consider swapping that movement rather than just dropping sets.
- Preserve exercise NAMES wherever possible; only swap when the user's note implies pain/injury or when impact reduction is needed.
- Respect conditions/injuries.

Return JSON only:
{
  "adjustment": "none" | "harder" | "lighter" | "mixed",
  "summary": "string — one sentence the user will read explaining the change",
  "exercises": [
    {
      "name": "string",
      "type": "warmup" | "main" | "cooldown",
      "sets": number,
      "reps": "string",
      "rest": "string",
      "notes": "string — short, mention why this changed when relevant"
    }
  ]
}
`.trim();

  return { system: SYSTEM_COACH, user };
}

export function sleepAdjustWorkoutPrompt(ctx: CoachContext, session: {
  name: string;
  focus: string;
  exercises: Array<{ name: string; type?: string; sets: number; reps: string; rest?: string; notes?: string }>;
}, sleep: { hours: number; quality: number }) {
  const debt = ctx.recent.sleep7d.debtHours;
  const debtLine = ctx.recent.sleep7d.nightsLogged > 0
    ? `7d sleep debt: ${debt}h (${ctx.recent.sleep7d.debtSeverity}) vs ${ctx.recent.sleep7d.goalHours}h/night goal across ${ctx.recent.sleep7d.nightsLogged} logged nights.`
    : "7d sleep debt: not enough data.";

  const user = `
${ctx.profile.displayName} just logged last night's sleep.
Sleep: ${sleep.hours}h, quality ${sleep.quality}/5.
${debtLine}
Conditions: ${ctx.profile.conditions.length ? ctx.profile.conditions.join(", ") : "none"}.
Goals: ${formatGoalsForPrompt(ctx.profile.goals)}.

TODAY'S PLANNED SESSION: ${session.name} — focus: ${session.focus}.
Exercises:
${JSON.stringify(session.exercises, null, 2)}

Adjust the exercises for how recovered they are today. Guidance:
- <5h sleep or quality 1-2: cut intensity meaningfully (drop 1 set on big lifts, lower the top reps, swap high-impact for low, longer rest). Keep it doable, don't skip the session.
- 5-6.5h or quality 3: small de-load (maybe -1 set on the heaviest 1-2 lifts, slightly easier reps).
- 7h+ AND quality 4-5: leave as-is, or push slightly harder if goals warrant.
- Sleep debt modifies last night's reading: if debt is "moderate" (5-10h) treat one decent night as still under-recovered and lean toward "lighter"; if "severe" (10h+), even a great night warrants a small de-load. If debt is "none" and last night was good, feel free to push.
- Always respect existing conditions/injuries.
- Keep exercise NAMES the same when possible — only change sets/reps/rest/notes. Substitute exercise only when needed for impact reduction.
- When debt drives the change, mention it in the summary so the user understands.

Return JSON only:
{
  "adjustment": "none" | "lighter" | "harder",
  "summary": "string — one sentence explaining the change to show the user",
  "exercises": [
    {
      "name": "string",
      "type": "warmup" | "main" | "cooldown",
      "sets": number,
      "reps": "string",
      "rest": "string",
      "notes": "string — short, why-this-change if relevant"
    }
  ]
}
`.trim();

  return { system: SYSTEM_COACH, user };
}

export function bedtimePrompt(ctx: CoachContext, opts: {
  wakeTime: string;
  goalHours: number;
  baselineBedtime: string;
  baselineGetReadyAt: string;
  targetHours: number;
  recentNights: Array<{ forDate: string; hours: number; quality: number }>;
}) {
  const sleep = ctx.recent.sleep7d;
  const user = `
${ctx.profile.displayName} wants help hitting their sleep goal tonight.

Goal wake time: ${opts.wakeTime}
Nightly sleep goal: ${opts.goalHours}h
7-day debt: ${sleep.debtHours}h (${sleep.debtSeverity}) over ${sleep.nightsLogged} logged nights, avg ${sleep.avgHours ?? "n/a"}h.

Baseline math says: bedtime ${opts.baselineBedtime}, start winding down at ${opts.baselineGetReadyAt} for ${opts.targetHours}h in bed.

Recent nights (newest first):
${opts.recentNights.map((n) => `- ${n.forDate}: ${n.hours}h q${n.quality}/5`).join("\n") || "- none logged"}

Decide a recommended bedtime and "get ready by" time. Rules:
- Bedtime is a 24h "HH:MM" string. Get-ready is at least 30 min before bedtime, ideally 45-60.
- Lean earlier than baseline if debt is moderate/severe OR last 1-2 nights were short.
- Don't push earlier than 90 min before baseline — unrealistic, they'll bail.
- If debt is "none" and recent nights are good, baseline is fine; you can even relax 15-20 min.
- Reasoning: 1-2 sentences in plain language ("you're 6h short this week so let's get an early one").

Return JSON only:
{
  "bedtime": "HH:MM",
  "getReadyAt": "HH:MM",
  "reasoning": "short string the user will read"
}
`.trim();

  return { system: SYSTEM_COACH, user };
}

export function journalReplyPrompt(
  profile: Profile,
  entry: { content: string; mood: number; energy: number | null; context: string; isWin: boolean },
  recentWins: Array<{ content: string; loggedAt: Date }>,
) {
  const winsLine = recentWins.length
    ? `Other wins they logged recently: ${recentWins.map((w) => `"${w.content.slice(0, 100)}" (${fmtTime(w.loggedAt)})`).join("; ")}.`
    : "";

  const user = `
${buildProfileContext(profile)}

${profile.displayName} just wrote a journal entry${entry.context !== "general" ? ` right after a ${entry.context === "weigh-in" ? "weigh-in" : entry.context}` : ""}:

"${entry.content.slice(0, 1500)}"

Mood: ${entry.mood}/5.${entry.energy != null ? ` Energy: ${entry.energy}/5.` : ""}${entry.isWin ? " They marked this as a WIN. 🏆" : ""}
${winsLine}

Write a short coach reply (1-3 sentences, under 60 words) they'll see right under their entry.
- If it's a win: celebrate it specifically — name what they did and, if it connects to one of their goals, say how it moves them toward it. Make it feel earned, not generic.
- If mood is low (1-2): validate first, no toxic positivity. Offer at most one tiny doable step, or just permission to rest if that's what the entry calls for.
- If they mention pain or injury, gently suggest a professional — never diagnose.
- Speak directly to ${profile.displayName}. Plain text only, no JSON, no markdown, no quotes around the reply.
`.trim();

  return { system: SYSTEM_COACH, user };
}
