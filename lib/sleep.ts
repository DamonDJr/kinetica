const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SleepNight = { hours: number; quality: number; forDate: Date };

export type SleepDebt = {
  windowDays: number;
  goalHours: number;
  nightsLogged: number;
  totalSlept: number;
  totalGoal: number;
  debtHours: number;
  avgHours: number | null;
  severity: "none" | "mild" | "moderate" | "severe";
};

/**
 * Sleep debt over a rolling window. Only counts nights actually logged — if the
 * user skips logging we treat that night as "no data" rather than a 0h deficit,
 * since the alternative produces wildly punishing numbers after a quiet week.
 */
export function calcSleepDebt(nights: SleepNight[], goalHours: number, windowDays = 7): SleepDebt {
  const cutoff = Date.now() - windowDays * MS_PER_DAY;
  const recent = nights.filter((n) => n.forDate.getTime() >= cutoff);
  const totalSlept = recent.reduce((s, n) => s + n.hours, 0);
  const totalGoal = recent.length * goalHours;
  const debt = +(totalGoal - totalSlept).toFixed(2);
  const avg = recent.length > 0 ? +(totalSlept / recent.length).toFixed(2) : null;

  let severity: SleepDebt["severity"] = "none";
  if (debt >= 10) severity = "severe";
  else if (debt >= 5) severity = "moderate";
  else if (debt >= 2) severity = "mild";

  return {
    windowDays,
    goalHours,
    nightsLogged: recent.length,
    totalSlept: +totalSlept.toFixed(2),
    totalGoal: +totalGoal.toFixed(2),
    debtHours: debt,
    avgHours: avg,
    severity,
  };
}

export function parseHHMM(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}

export function formatHHMM(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function format12h(value: string | null | undefined): string {
  const t = parseHHMM(value);
  if (!t) return "—";
  const h = t.hour % 12 || 12;
  const ampm = t.hour < 12 ? "AM" : "PM";
  return `${h}:${t.minute.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Given a wake-time goal and target sleep hours, suggest a bedtime range.
 * Returns "ideal" bedtime (target hours before wake) and a "get ready" time
 * (45 minutes before bedtime) so the user has a wind-down buffer.
 */
export function calcBedtime(wakeTime: string, goalHours: number, debtHours = 0): {
  bedtime: string;
  getReadyAt: string;
  targetHours: number;
} {
  const wake = parseHHMM(wakeTime);
  if (!wake) throw new Error("invalid wake time");

  // If in debt, push bedtime earlier — but cap at 1 extra hour so we don't
  // hand back a noon bedtime after a brutal week.
  const extra = Math.min(Math.max(debtHours / 7, 0), 1);
  const targetHours = goalHours + extra;

  const wakeMin = wake.hour * 60 + wake.minute;
  let bedMin = wakeMin - Math.round(targetHours * 60);
  while (bedMin < 0) bedMin += 24 * 60;
  let readyMin = bedMin - 45;
  while (readyMin < 0) readyMin += 24 * 60;

  return {
    bedtime: formatHHMM(Math.floor(bedMin / 60), bedMin % 60),
    getReadyAt: formatHHMM(Math.floor(readyMin / 60), readyMin % 60),
    targetHours: +targetHours.toFixed(2),
  };
}
