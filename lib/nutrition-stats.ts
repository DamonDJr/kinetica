// Shared helpers for aggregating meal logs into per-day buckets and
// calendar-period stats. Used by the nutrition summary card and the
// /nutrition/trends page so both report identical numbers.

export type MealRow = {
  loggedAt: Date;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type DayTotal = {
  key: string; // YYYY-MM-DD (local)
  date: Date; // local midnight
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Most recent Monday at 00:00 local. */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const mondayOffset = (d.getDay() + 6) % 7; // Sun=6 … Mon=0
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

/** First day of the current month at 00:00 local. */
export function startOfMonth(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

/**
 * Build one bucket per calendar day from `start` (inclusive) through today
 * (inclusive), filling days with no logs as zeros so charts show real gaps.
 */
export function bucketByDay(meals: MealRow[], start: Date): DayTotal[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: DayTotal[] = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const cur = new Date(d);
    days.push({ key: dayKey(cur), date: cur, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  }

  const index = new Map(days.map((day) => [day.key, day]));
  for (const m of meals) {
    const bucket = index.get(dayKey(new Date(m.loggedAt)));
    if (!bucket) continue;
    bucket.calories += m.calories;
    bucket.proteinG += m.proteinG;
    bucket.carbsG += m.carbsG;
    bucket.fatG += m.fatG;
  }
  return days;
}

/**
 * A calorie goal expressed as a range. `target` is the center (used for the
 * ring max and AI), `min`/`max` bound the "on target" band — a day inside the
 * band counts as on-target rather than over/under.
 */
export type CalorieRange = { min: number; max: number; target: number };

/**
 * Resolve a profile's stored calorie target + optional min/max into a range.
 * If the user hasn't set explicit bounds, derive a ±10% band around the target
 * so existing single-target profiles still get sensible range behaviour.
 */
export function resolveCalorieRange(
  calorieTarget: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): CalorieRange {
  const target = calorieTarget ?? 2000;
  const lo = min ?? Math.round(target * 0.9);
  const hi = max ?? Math.round(target * 1.1);
  return { min: Math.min(lo, hi), max: Math.max(lo, hi), target };
}

export type DayStatus = "empty" | "under" | "on" | "over";

/** Classify a day's calorie total against the goal range. */
export function dayStatus(calories: number, range: CalorieRange): DayStatus {
  if (calories <= 0) return "empty";
  if (calories < range.min) return "under";
  if (calories > range.max) return "over";
  return "on";
}

export type PeriodStats = {
  days: DayTotal[];
  daysElapsed: number;
  totalCalories: number;
  avgCalories: number; // over elapsed days
  avgProtein: number;
  goalToDate: number; // range.target * daysElapsed (center)
  goalMinToDate: number; // range.min * daysElapsed
  goalMaxToDate: number; // range.max * daysElapsed
  daysOnTarget: number; // logged days inside the range
  daysLogged: number;
};

export function summarize(days: DayTotal[], range: CalorieRange): PeriodStats {
  const daysElapsed = days.length;
  const totalCalories = days.reduce((s, d) => s + d.calories, 0);
  const totalProtein = days.reduce((s, d) => s + d.proteinG, 0);
  const logged = days.filter((d) => d.calories > 0);
  const daysOnTarget = logged.filter((d) => dayStatus(d.calories, range) === "on").length;
  return {
    days,
    daysElapsed,
    totalCalories,
    avgCalories: daysElapsed ? Math.round(totalCalories / daysElapsed) : 0,
    avgProtein: daysElapsed ? Math.round(totalProtein / daysElapsed) : 0,
    goalToDate: range.target * daysElapsed,
    goalMinToDate: range.min * daysElapsed,
    goalMaxToDate: range.max * daysElapsed,
    daysOnTarget,
    daysLogged: logged.length,
  };
}
