import { db } from "./db";
import { sendPushToProfile } from "./push";
import { buildCoachContext } from "./coach-context";
import { generateJSON } from "./ai";
import { nudgeDecisionPrompt } from "./ai-prompts";

const SMART_NUDGE_COOLDOWN_HOURS = 2;
const DORMANT_DAYS = 7;

type NudgeDecision = {
  shouldNudge: boolean;
  reasoning: string;
  type: "meal" | "workout" | "sleep" | "hydration" | "measurement" | "motivation" | "none";
  title: string;
  body: string;
  url: string;
};

type NudgeRunResult = {
  scanned: number;
  considered: number;
  sent: number;
  skipped: { reason: string; profileId: string }[];
};

function hourInRange(hour: number, start: number, end: number) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function hoursAgo(d: Date | null | undefined, now: Date) {
  if (!d) return Infinity;
  return (now.getTime() - new Date(d).getTime()) / (1000 * 60 * 60);
}

const ALLOWED_URLS = new Set([
  "/dashboard",
  "/nutrition",
  "/nutrition/smart-log",
  "/nutrition/log",
  "/workouts",
  "/workouts/generate",
  "/profile",
  "/profile/measurements",
]);

function safeUrl(u: string | undefined): string {
  if (!u) return "/dashboard";
  if (ALLOWED_URLS.has(u)) return u;
  if (u.startsWith("/workouts/programs/")) return u;
  return "/dashboard";
}

/**
 * Smart nudge scan: for every push-subscribed profile, build the coach context
 * and ask the AI whether to send a notification right now. Cheap pre-filters
 * (quiet hours, cooldown, daily cap, dormant) keep model calls bounded.
 */
export async function runNudgeChecks(now: Date = new Date()): Promise<NudgeRunResult> {
  const result: NudgeRunResult = { scanned: 0, considered: 0, sent: 0, skipped: [] };

  const subscriptions = await db.pushSubscription.findMany({
    include: { profile: true },
  });

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dormantCutoff = new Date(now.getTime() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
  const hour = now.getHours();

  for (const sub of subscriptions) {
    result.scanned++;
    const profile = sub.profile;
    if (!profile) continue;

    if (!profile.smartNudgesEnabled) {
      result.skipped.push({ reason: "disabled", profileId: profile.id });
      continue;
    }

    if (!hourInRange(hour, profile.notifyStartHour, profile.notifyEndHour)) {
      result.skipped.push({ reason: "quiet-hours", profileId: profile.id });
      continue;
    }

    if (hoursAgo(profile.lastSmartNudgeAt, now) < SMART_NUDGE_COOLDOWN_HOURS) {
      result.skipped.push({ reason: "cooldown", profileId: profile.id });
      continue;
    }

    const sentToday = await db.aiInsight.count({
      where: { profileId: profile.id, type: "nudge", createdAt: { gte: dayStart } },
    });
    if (sentToday >= profile.dailyNudgeCap) {
      result.skipped.push({ reason: "daily-cap", profileId: profile.id });
      continue;
    }

    // Dormant filter — don't burn LM Studio cycles on profiles with no activity.
    const recentActivity = await db.mealLog.findFirst({
      where: { profileId: profile.id, loggedAt: { gte: dormantCutoff } },
      select: { id: true },
    });
    const recentWorkout = recentActivity
      ? null
      : await db.workoutLog.findFirst({
          where: { profileId: profile.id, completedAt: { gte: dormantCutoff } },
          select: { id: true },
        });
    if (!recentActivity && !recentWorkout) {
      result.skipped.push({ reason: "dormant", profileId: profile.id });
      continue;
    }

    result.considered++;

    let decision: NudgeDecision | null = null;
    try {
      const context = await buildCoachContext(profile.id, now);
      const { system, user } = nudgeDecisionPrompt(context);
      decision = await generateJSON<NudgeDecision>(system, user);
    } catch (err) {
      console.error(`[nudges] decision failed for ${profile.id}:`, err);
      result.skipped.push({ reason: "ai-error", profileId: profile.id });
      continue;
    }

    if (!decision || !decision.shouldNudge || !decision.title || !decision.body) {
      result.skipped.push({ reason: "ai-declined", profileId: profile.id });
      continue;
    }

    const title = decision.title.slice(0, 40);
    const body = decision.body.slice(0, 140);
    const url = safeUrl(decision.url);

    try {
      await sendPushToProfile(profile.id, { title, body, url });
    } catch (err) {
      console.error(`[nudges] push failed for ${profile.id}:`, err);
      result.skipped.push({ reason: "push-error", profileId: profile.id });
      continue;
    }

    await db.$transaction([
      db.profile.update({
        where: { id: profile.id },
        data: { lastSmartNudgeAt: now },
      }),
      db.aiInsight.create({
        data: {
          profileId: profile.id,
          type: "nudge",
          content: JSON.stringify({
            headline: title,
            body,
            action: url,
            kind: decision.type,
            reasoning: decision.reasoning,
          }),
        },
      }),
    ]);

    result.sent++;
  }

  return result;
}
